import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload } from '@/lib/cloud-storage';
import { getArtifactStorageRecord } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const artifact = await getArtifactStorageRecord(scope, id);
    if (!artifact) return NextResponse.json({ error: '成品文件不存在。' }, { status: 404 });
    const download = await createStoredObjectDownload(scope, artifact.storagePath);
    if (download.kind === 'redirect') return NextResponse.redirect(download.url);
    const body = download.bytes.buffer.slice(
      download.bytes.byteOffset,
      download.bytes.byteOffset + download.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': artifact.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '成品下载失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
