import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getDatabasePool } from '@/lib/db';
import { calculateKeywordScore, extractKeywordTerms } from '@/lib/hybrid-search';
import { getDatabaseUrl, getEmbeddingIdentity } from '@/lib/platform-config';
import { cosineSimilarity } from '@/lib/text';
import type { DataScope } from '@/types/platform';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

export interface KnowledgeSearchResult extends KnowledgeChunk {
  score: number;
  routes?: Array<'semantic' | 'keyword'>;
}

export interface EmbeddingDescriptor {
  model: string;
  dimensions: number;
}

export interface VectorStore {
  listDocuments(scope?: DataScope): Promise<KnowledgeDocument[]>;
  getDocument(id: string, scope?: DataScope): Promise<KnowledgeDocument | null>;
  saveDocument(document: KnowledgeDocument, chunks: KnowledgeChunk[], scope?: DataScope): Promise<void>;
  deleteDocument(id: string, scope?: DataScope): Promise<KnowledgeDocument | null>;
  search(queryVector: number[], limit: number, scope?: DataScope, embedding?: EmbeddingDescriptor): Promise<KnowledgeSearchResult[]>;
  lexicalSearch(query: string, limit: number, scope?: DataScope): Promise<KnowledgeSearchResult[]>;
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

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    return (await this.read()).documents.find((item) => item.id === id) ?? null;
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

  async deleteDocument(id: string): Promise<KnowledgeDocument | null> {
    let deleted: KnowledgeDocument | null = null;
    this.pendingWrite = this.pendingWrite.then(async () => {
      const database = await this.read();
      deleted = database.documents.find((item) => item.id === id) ?? null;
      database.documents = database.documents.filter((item) => item.id !== id);
      database.chunks = database.chunks.filter((item) => item.documentId !== id);
      await this.write(database);
    });
    await this.pendingWrite;
    return deleted;
  }

  async search(queryVector: number[], limit: number): Promise<KnowledgeSearchResult[]> {
    const database = await this.read();
    return database.chunks
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding),
        routes: ['semantic' as const],
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async lexicalSearch(query: string, limit: number): Promise<KnowledgeSearchResult[]> {
    const terms = extractKeywordTerms(query);
    if (!terms.length) return [];
    const database = await this.read();
    return database.chunks
      .map((chunk) => ({ ...chunk, score: calculateKeywordScore(chunk.content, terms), routes: ['keyword' as const] }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

class PgVectorStore implements VectorStore {
  private readonly pool = getDatabasePool();
  private legacyInitialized?: Promise<void>;

  private ensureLegacySchema(): Promise<void> {
    if (!this.legacyInitialized) {
      const dimensions = getEmbeddingIdentity().dimensions;
      const schema = [
        'CREATE EXTENSION IF NOT EXISTS vector;',
        'CREATE TABLE IF NOT EXISTS knowledge_documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL);',
        'CREATE TABLE IF NOT EXISTS knowledge_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE, document_name TEXT NOT NULL, content TEXT NOT NULL, page INTEGER, embedding vector(' + dimensions + ') NOT NULL);',
      ].join('\n');
      this.legacyInitialized = this.pool.query(schema).then(() => undefined);
    }
    return this.legacyInitialized;
  }

  async listDocuments(scope?: DataScope): Promise<KnowledgeDocument[]> {
    if (scope?.mode === 'cloud') {
      const result = await this.pool.query<{
        id: string;
        name: string;
        mime_type: string;
        size_bytes: number;
        chunk_count: number;
        status: KnowledgeDocument['status'];
        sha256: string;
        embedding_model: string;
        embedding_dimensions: number;
        created_at: Date;
      }>(
        'SELECT id, name, mime_type, size_bytes, chunk_count, status, sha256, embedding_model, embedding_dimensions, created_at FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC',
        [scope.workspaceId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.mime_type,
        size: row.size_bytes,
        chunkCount: row.chunk_count,
        status: row.status,
        sha256: row.sha256,
        embeddingModel: row.embedding_model,
        embeddingDimensions: row.embedding_dimensions,
        createdAt: row.created_at.toISOString(),
      }));
    }

    await this.ensureLegacySchema();
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

  async getDocument(id: string, scope?: DataScope): Promise<KnowledgeDocument | null> {
    if (scope?.mode === 'cloud') {
      const result = await this.pool.query<{
        id: string;
        name: string;
        mime_type: string;
        size_bytes: number;
        chunk_count: number;
        status: KnowledgeDocument['status'];
        sha256: string;
        storage_path: string;
        embedding_model: string;
        embedding_dimensions: number;
        created_at: Date;
      }>(
        'SELECT id, name, mime_type, size_bytes, chunk_count, status, sha256, storage_path, embedding_model, embedding_dimensions, created_at FROM documents WHERE id = $1 AND workspace_id = $2',
        [id, scope.workspaceId],
      );
      const row = result.rows[0];
      return row ? {
        id: row.id,
        name: row.name,
        type: row.mime_type,
        size: row.size_bytes,
        chunkCount: row.chunk_count,
        status: row.status,
        sha256: row.sha256,
        storagePath: row.storage_path,
        embeddingModel: row.embedding_model,
        embeddingDimensions: row.embedding_dimensions,
        createdAt: row.created_at.toISOString(),
      } : null;
    }

    await this.ensureLegacySchema();
    const result = await this.pool.query<{
      id: string;
      name: string;
      type: string;
      size: number;
      chunk_count: number;
      created_at: Date;
    }>('SELECT * FROM knowledge_documents WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? {
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      chunkCount: row.chunk_count,
      createdAt: row.created_at.toISOString(),
    } : null;
  }

  async saveDocument(document: KnowledgeDocument, chunks: KnowledgeChunk[], scope?: DataScope): Promise<void> {
    if (scope?.mode === 'cloud' && getEmbeddingIdentity().dimensions !== 384) {
      throw new Error('云端向量表当前固定为 384 维，请将 EMBEDDING_DIMENSIONS 设置为 384。');
    }
    if (scope?.mode !== 'cloud') await this.ensureLegacySchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (scope?.mode === 'cloud') {
        await client.query(
          `INSERT INTO documents (id, workspace_id, owner_id, name, mime_type, size_bytes, chunk_count, status, storage_path, sha256, embedding_model, embedding_dimensions, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready', $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes, chunk_count = EXCLUDED.chunk_count, status = 'ready', storage_path = EXCLUDED.storage_path, sha256 = EXCLUDED.sha256, embedding_model = EXCLUDED.embedding_model, embedding_dimensions = EXCLUDED.embedding_dimensions`,
          [document.id, scope.workspaceId, scope.userId, document.name, document.type, document.size, document.chunkCount, document.storagePath, document.sha256, document.embeddingModel, document.embeddingDimensions, document.createdAt],
        );
        await client.query('DELETE FROM document_chunks WHERE document_id = $1 AND workspace_id = $2', [document.id, scope.workspaceId]);
        for (const chunk of chunks) {
          await client.query(
            'INSERT INTO document_chunks (id, document_id, workspace_id, document_name, content, page, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7::vector)',
            [chunk.id, chunk.documentId, scope.workspaceId, chunk.documentName, chunk.content, chunk.page ?? null, '[' + chunk.embedding.join(',') + ']'],
          );
        }
      } else {
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
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteDocument(id: string, scope?: DataScope): Promise<KnowledgeDocument | null> {
    const document = await this.getDocument(id, scope);
    if (!document) return null;
    if (scope?.mode === 'cloud') {
      await this.pool.query('DELETE FROM documents WHERE id = $1 AND workspace_id = $2', [id, scope.workspaceId]);
    } else {
      await this.ensureLegacySchema();
      await this.pool.query('DELETE FROM knowledge_documents WHERE id = $1', [id]);
    }
    return document;
  }

  async search(
    queryVector: number[],
    limit: number,
    scope?: DataScope,
    requestedEmbedding?: EmbeddingDescriptor,
  ): Promise<KnowledgeSearchResult[]> {
    const embedding = requestedEmbedding ?? getEmbeddingIdentity();
    if (scope?.mode === 'cloud' && embedding.dimensions !== 384) {
      throw new Error('云端向量表当前固定为 384 维，请将 EMBEDDING_DIMENSIONS 设置为 384。');
    }
    if (scope?.mode !== 'cloud') await this.ensureLegacySchema();
    const result = await this.pool.query<{
      id: string;
      document_id: string;
      document_name: string;
      content: string;
      page: number | null;
      score: number;
    }>(scope?.mode === 'cloud'
      ? `SELECT c.id, c.document_id, c.document_name, c.content, c.page,
                1 - (c.embedding <=> $1::vector) AS score
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id AND d.workspace_id = c.workspace_id
         WHERE c.workspace_id = $2
           AND d.embedding_model = $3
           AND d.embedding_dimensions = $4
         ORDER BY c.embedding <=> $1::vector
         LIMIT $5`
      : 'SELECT id, document_id, document_name, content, page, 1 - (embedding <=> $1::vector) AS score FROM knowledge_chunks ORDER BY embedding <=> $1::vector LIMIT $2',
    scope?.mode === 'cloud'
      ? ['[' + queryVector.join(',') + ']', scope.workspaceId, embedding.model, embedding.dimensions, limit]
      : ['[' + queryVector.join(',') + ']', limit]);
    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      content: row.content,
      page: row.page ?? undefined,
      embedding: [],
      score: Number(row.score),
      routes: ['semantic'],
    }));
  }

  async lexicalSearch(query: string, limit: number, scope?: DataScope): Promise<KnowledgeSearchResult[]> {
    const terms = extractKeywordTerms(query);
    if (!terms.length) return [];
    if (scope?.mode !== 'cloud') await this.ensureLegacySchema();
    const patterns = terms.map((term) => '%' + term + '%');
    const result = await this.pool.query<{
      id: string;
      document_id: string;
      document_name: string;
      content: string;
      page: number | null;
    }>(scope?.mode === 'cloud'
      ? `SELECT id, document_id, document_name, content, page
         FROM document_chunks
         WHERE workspace_id = $1 AND content ILIKE ANY($2::text[])
         ORDER BY (SELECT COUNT(*) FROM unnest($2::text[]) AS terms(pattern) WHERE content ILIKE pattern) DESC
         LIMIT $3`
      : `SELECT id, document_id, document_name, content, page
         FROM knowledge_chunks
         WHERE content ILIKE ANY($1::text[])
         ORDER BY (SELECT COUNT(*) FROM unnest($1::text[]) AS terms(pattern) WHERE content ILIKE pattern) DESC
         LIMIT $2`,
    scope?.mode === 'cloud'
      ? [scope.workspaceId, patterns, Math.max(limit * 4, 24)]
      : [patterns, Math.max(limit * 4, 24)]);
    return result.rows
      .map((row) => ({
        id: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        content: row.content,
        page: row.page ?? undefined,
        embedding: [],
        score: calculateKeywordScore(row.content, terms),
        routes: ['keyword' as const],
      }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

let singleton: VectorStore | undefined;

export function getVectorStore(): VectorStore {
  if (!singleton) {
    singleton = getDatabaseUrl()
      ? new PgVectorStore()
      : new JsonVectorStore();
  }
  return singleton;
}
