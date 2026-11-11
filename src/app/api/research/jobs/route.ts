import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { listActiveResearchJobs } from '@/lib/research-jobs';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ jobs: await listActiveResearchJobs(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
