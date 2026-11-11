import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects, uploadSourceFile } from '@/lib/cloud-storage';
import { createIngestionJob, listIngestionJobs } from '@/lib/ingestion-jobs';
import { MAX_KNOWLEDGE_BATCH_BYTES, MAX_KNOWLEDGE_FILE_BYTES, parseUpload } from '@/lib/documents';
import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { hasWorkspaceStorageCapacity } from '@/lib/repository';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  try {
    const scope = await requireDataScope();
    const documents = await getVectorStore().listDocuments(scope);
    const jobs = await listIngestionJobs(scope);
    const byDocument = new Map(jobs.map((job) => [job.documentId, job]));
    return NextResponse.json({
      documents: documents.map((document) => {
        const job = byDocument.get(document.id);
        return job && (job.status === 'queued' || job.status === 'processing')
          ? { ...document, status: 'processing' as const, chunkCount: job.chunkCount }
          : document;
      }),
      jobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '知识库读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: '请选择文件。' }, { status: 400 });
    if (files.length > 8) return NextResponse.json({ error: '每次最多上传 8 个文件。' }, { status: 400 });

    if (files.some((file) => file.size > MAX_KNOWLEDGE_FILE_BYTES)) {
      return NextResponse.json({ error: '单个文件不能超过 500MB。' }, { status: 413 });
    }
    const incomingBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (incomingBytes > MAX_KNOWLEDGE_BATCH_BYTES) {
      return NextResponse.json({ error: '单次上传总大小不能超过 600MB。' }, { status: 413 });
    }
    if (!await hasWorkspaceStorageCapacity(scope, incomingBytes)) {
      return NextResponse.json({ error: '知识库空间不足，请删除旧资料或提高 WORKSPACE_STORAGE_LIMIT_MB。' }, { status: 413 });
    }

    // Local compatibility mode has no durable database-backed queue. Keep the
    // synchronous path there; hosted mode uses the persistent worker.
    if (scope.mode !== 'cloud') {
      const ai = await resolveAiRuntimeConfig(scope);
      const documents = [];
      for (const file of files) {
        const parsed = await parseUpload(file, ai);
        await getVectorStore().saveDocument(parsed.document, parsed.chunks, scope);
        documents.push(parsed.document);
      }
      return NextResponse.json({ documents, jobs: [] }, { status: 201 });
    }

    const jobs = [];
    const documents = [];
    for (const file of files) {
      const documentId = randomUUID();
      let storagePath: string | undefined;
      try {
        storagePath = await uploadSourceFile(scope, documentId, file);
        const job = await createIngestionJob(scope, {
          documentId,
          fileName: file.name.replace(/[\\/]/g, '_'),
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          storagePath,
        });
        jobs.push(job);
        documents.push({
          id: documentId,
          name: file.name.replace(/[\\/]/g, '_'),
          type: file.type || 'application/octet-stream',
          size: file.size,
          chunkCount: 0,
          createdAt: job.createdAt,
          status: 'processing' as const,
          storagePath,
        });
      } catch (error) {
        if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined);
        throw error;
      }
    }
    return NextResponse.json({ documents, jobs, queued: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文件上传失败。';
    const status = apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status: status === 500 ? 400 : status });
  }
}
