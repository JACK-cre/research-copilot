import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects } from '@/lib/cloud-storage';
import { deleteResearchRun, getResearchResult, listArtifacts } from '@/lib/repository';

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const deleted = await deleteResearchRun(scope, id);
    if (!deleted.deleted) {
      return NextResponse.json({ error: '研究任务不存在。' }, { status: 404 });
    }

    let cleanupWarning: string | undefined;
    if (deleted.artifactStoragePaths.length) {
      try {
        await removeStoredObjects(scope, deleted.artifactStoragePaths);
      } catch (error) {
        console.error('Research artifacts could not be removed after run deletion.', error);
        cleanupWarning = '研究记录已删除，但部分导出文件未能立即清理。';
      }
    }
    return NextResponse.json({ deleted: true, warning: cleanupWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究任务删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
