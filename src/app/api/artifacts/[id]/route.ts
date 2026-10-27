import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload } from '@/lib/cloud-storage';
import { getArtifactStoragePath } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const path = await getArtifactStoragePath(scope, id);
    if (!path) return NextResponse.json({ error: '成品文件不存在。' }, { status: 404 });
    return NextResponse.redirect(await createStoredObjectDownload(scope, path));
  } catch (error) {
    const message = error instanceof Error ? error.message : '成品下载失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
