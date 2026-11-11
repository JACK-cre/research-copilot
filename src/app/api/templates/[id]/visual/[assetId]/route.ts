import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload } from '@/lib/cloud-storage';
import { getOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id, assetId } = await params;
    const template = await getOutputTemplate(scope, id);
    const element = template?.blueprint?.slides.flatMap((slide) => slide.elements ?? []).find((item) => item.id === assetId);
    if (!element?.imageStoragePath) return NextResponse.json({ error: '模板图片不存在。' }, { status: 404 });
    const download = await createStoredObjectDownload(scope, element.imageStoragePath);
    if (download.kind === 'redirect') return NextResponse.redirect(download.url);
    const body = download.bytes.buffer.slice(download.bytes.byteOffset, download.bytes.byteOffset + download.bytes.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板图片读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
