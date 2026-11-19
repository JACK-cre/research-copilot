import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVectorStore } from './vector-store';
import type { KnowledgeChunk, KnowledgeDocument } from '@/types/research';

const { query, release, poolQuery } = vi.hoisted(() => ({query:vi.fn(), release:vi.fn(), poolQuery:vi.fn()}));
vi.mock('./platform-config', () => ({getDatabaseUrl:() => 'test', getEmbeddingIdentity:() => ({})}));
vi.mock('./db', () => ({getDatabasePool:() => ({connect:async () => ({query,release}),query:poolQuery})}));
const scope = { mode:'cloud' as const, userId:'user', workspaceId:'workspace' };
const doc: KnowledgeDocument = { id:'doc', name:'实验记录', type:'text/plain', size:8000, chunkCount:703, createdAt:new Date(0).toISOString(), storagePath:'test' };
const chunks: KnowledgeChunk[] = Array.from({length:703}, (_,i) => ({id:`doc:${i}`, documentId:doc.id, documentName:doc.name, page:3, section:'方法', chunkIndex:i, content:`段落 ${i}`, embedding:[0.5]}));

describe('Postgres ingestion contract', () => {
  beforeEach(() => { query.mockReset().mockResolvedValue({}); release.mockClear(); });
  it('writes 703 chunks in 15 parameterized inserts within one transaction', async () => {
    await getVectorStore().saveDocument(doc, chunks, scope);
    const inserts = query.mock.calls.filter(([q]) => q.startsWith('INSERT INTO document_chunks'));
    expect(inserts).toHaveLength(15);
    expect(inserts[0][1].slice(0,10)).toEqual(['doc:0','doc','实验记录','段落 0',3,'方法',0,null,'[0.5]','workspace']);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('rolls back the replacement if a later batch fails', async () => {
    let batches = 0;
    query.mockImplementation(async sql => { if (sql.startsWith('INSERT INTO document_chunks') && ++batches === 2) throw Error('write failed'); });
    await expect(getVectorStore().saveDocument(doc, chunks, scope)).rejects.toThrow('write failed');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('only extends hits with the same document, page and section in the workspace', async () => {
    const hit = {...chunks[0],score:0.8};
    for (const [page, section, expected] of [[3,'方法','下文'],[4,'方法',undefined],[3,'结论',undefined]] as const) {
      poolQuery.mockResolvedValueOnce({rows:[{...chunks[1],page,section,content:'下文'}]});
      const [result] = await getVectorStore().followingChunks([hit], scope);
      expect(result.followingText).toBe(expected);
      expect(poolQuery.mock.calls.at(-1)?.[1]).toEqual([['doc:1'],'workspace']);
    }
  });
});
