import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { cancelResearchJob, getResearchJob } from '@/lib/research-jobs';
import { getResearchResult } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const job = await getResearchJob(scope, id);
    if (!job) return NextResponse.json({ error: '研究任务不存在。' }, { status: 404 });
    const result = job.status === 'completed' ? await getResearchResult(scope, job.runId) : null;
    return NextResponse.json({ job, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务读取失败。';
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
    const job = await cancelResearchJob(scope, id);
    if (!job) return NextResponse.json({ error: '研究任务不存在。' }, { status: 404 });
    return NextResponse.json({ cancelled: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务取消失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
