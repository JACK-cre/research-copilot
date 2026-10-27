import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload, removeStoredObjects } from '@/lib/cloud-storage';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const document = await getVectorStore().getDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    if (!document.storagePath) return NextResponse.json({ error: '该资料没有保存原始文件。' }, { status: 404 });
    return NextResponse.redirect(await createStoredObjectDownload(scope, document.storagePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料下载失败。';
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
    const document = await getVectorStore().deleteDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    if (document.storagePath) await removeStoredObjects(scope, [document.storagePath]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
