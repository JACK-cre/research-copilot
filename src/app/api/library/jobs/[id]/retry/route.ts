import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { retryIngestionJob } from '@/lib/ingestion-jobs';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const job = await retryIngestionJob(scope, id);
    if (!job) return NextResponse.json({ error: '解析任务不存在。' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析任务重试失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
