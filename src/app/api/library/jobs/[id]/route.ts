import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { cancelIngestionJob, getIngestionJob } from '@/lib/ingestion-jobs';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const job = await getIngestionJob(scope, id);
    if (!job) return NextResponse.json({ error: '解析任务不存在。' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析任务读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const job = await cancelIngestionJob(scope, id);
    if (!job) return NextResponse.json({ error: '解析任务不存在。' }, { status: 404 });
    // If the worker had already written chunks, remove that partial document.
    if (job.status === 'cancelled') await getVectorStore().deleteDocument(job.documentId, scope).catch(() => undefined);
    return NextResponse.json({ cancelled: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析任务取消失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
