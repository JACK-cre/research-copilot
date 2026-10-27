import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { getResearchResult, listArtifacts } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const result = await getResearchResult(scope, id);
    if (!result) return NextResponse.json({ error: '研究任务不存在。' }, { status: 404 });
    return NextResponse.json({ result, artifacts: await listArtifacts(scope, id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
