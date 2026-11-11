import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { readStoredObjectBytes } from '@/lib/cloud-storage';
import { createIngestionJob } from '@/lib/ingestion-jobs';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const document = await getVectorStore().getDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    if (!document.storagePath) return NextResponse.json({ error: '该资料没有原始文件，无法重建索引。' }, { status: 400 });
    // Verify the original source is readable before removing its current index.
    await readStoredObjectBytes(scope, document.storagePath);
    await getVectorStore().deleteDocument(id, scope);
    const job = await createIngestionJob(scope, {
      documentId: document.id,
      fileName: document.name,
      mimeType: document.type,
      size: document.size,
      storagePath: document.storagePath,
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '重建索引失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
