import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

import { getEmbeddingDimensions } from '@/lib/embeddings';
import { cosineSimilarity } from '@/lib/text';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

export interface KnowledgeSearchResult extends KnowledgeChunk {
  score: number;
}

export interface VectorStore {
  listDocuments(): Promise<KnowledgeDocument[]>;
  saveDocument(document: KnowledgeDocument, chunks: KnowledgeChunk[]): Promise<void>;
  search(queryVector: number[], limit: number): Promise<KnowledgeSearchResult[]>;
}

interface JsonDatabase {
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
}

class JsonVectorStore implements VectorStore {
  private readonly filePath = path.join(process.cwd(), 'data', 'library.json');
  private pendingWrite: Promise<void> = Promise.resolve();

  private async read(): Promise<JsonDatabase> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as JsonDatabase;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { documents: [], chunks: [] };
      }
      throw error;
    }
  }

  private async write(database: JsonDatabase): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = this.filePath + '.tmp';
    await writeFile(temporaryPath, JSON.stringify(database), 'utf8');
    await rename(temporaryPath, this.filePath);
  }

  async listDocuments(): Promise<KnowledgeDocument[]> {
    return (await this.read()).documents.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async saveDocument(document: KnowledgeDocument, chunks: KnowledgeChunk[]): Promise<void> {
    this.pendingWrite = this.pendingWrite.then(async () => {
      const database = await this.read();
      database.documents = database.documents.filter((item) => item.id !== document.id);
      database.chunks = database.chunks.filter((item) => item.documentId !== document.id);
      database.documents.push(document);
      database.chunks.push(...chunks);
      await this.write(database);
    });
    await this.pendingWrite;
  }

  async search(queryVector: number[], limit: number): Promise<KnowledgeSearchResult[]> {
    const database = await this.read();
    return database.chunks
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

class PgVectorStore implements VectorStore {
  private readonly pool: Pool;
  private initialized?: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5 });
  }

  private ensureSchema(): Promise<void> {
    if (!this.initialized) {
      const dimensions = getEmbeddingDimensions();
      const schema = [
        'CREATE EXTENSION IF NOT EXISTS vector;',
        'CREATE TABLE IF NOT EXISTS knowledge_documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL);',
        'CREATE TABLE IF NOT EXISTS knowledge_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE, document_name TEXT NOT NULL, content TEXT NOT NULL, page INTEGER, embedding vector(' + dimensions + ') NOT NULL);',
      ].join('\n');
      this.initialized = this.pool.query(schema).then(() => undefined);
    }
    return this.initialized;
  }

  async listDocuments(): Promise<KnowledgeDocument[]> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      id: string;
      name: string;
      type: string;
      size: number;
      chunk_count: number;
      created_at: Date;
    }>('SELECT * FROM knowledge_documents ORDER BY created_at DESC');
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      chunkCount: row.chunk_count,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async saveDocument(document: KnowledgeDocument, chunks: KnowledgeChunk[]): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO knowledge_documents (id, name, type, size, chunk_count, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, size = EXCLUDED.size, chunk_count = EXCLUDED.chunk_count, created_at = EXCLUDED.created_at',
        [document.id, document.name, document.type, document.size, document.chunkCount, document.createdAt],
      );
      await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [document.id]);
      for (const chunk of chunks) {
        await client.query(
          'INSERT INTO knowledge_chunks (id, document_id, document_name, content, page, embedding) VALUES ($1, $2, $3, $4, $5, $6::vector)',
          [chunk.id, chunk.documentId, chunk.documentName, chunk.content, chunk.page ?? null, '[' + chunk.embedding.join(',') + ']'],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async search(queryVector: number[], limit: number): Promise<KnowledgeSearchResult[]> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      id: string;
      document_id: string;
      document_name: string;
      content: string;
      page: number | null;
      score: number;
    }>(
      'SELECT id, document_id, document_name, content, page, 1 - (embedding <=> $1::vector) AS score FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2',
      ['[' + queryVector.join(',') + ']', limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      content: row.content,
      page: row.page ?? undefined,
      embedding: [],
      score: Number(row.score),
    }));
  }
}

let singleton: VectorStore | undefined;

export function getVectorStore(): VectorStore {
  if (!singleton) {
    singleton = process.env.DATABASE_URL
      ? new PgVectorStore(process.env.DATABASE_URL)
      : new JsonVectorStore();
  }
  return singleton;
}
