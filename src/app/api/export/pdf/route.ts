import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects, uploadArtifact } from '@/lib/cloud-storage';
import { buildResearchPdf } from '@/lib/pdf-export';
import { createArtifactRecord, getResearchResult, hasWorkspaceStorageCapacity } from '@/lib/repository';
import type { ResearchResult } from '@/types/research';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const submitted = await request.json() as ResearchResult;
    const result = scope.mode === 'cloud' ? await getResearchResult(scope, submitted?.id) : submitted;
    if (!result?.title || !Array.isArray(result.sections)) {
      return NextResponse.json({ error: '缺少可导出的研究文稿。' }, { status: 400 });
    }
    const bytes = await buildResearchPdf(result);
    const fileName = `research-report-v${result.version ?? 1}.pdf`;
    const contentType = 'application/pdf';
    if (scope.mode === 'cloud') {
      if (!await hasWorkspaceStorageCapacity(scope, bytes.byteLength)) return NextResponse.json({ error: '工作空间容量不足。' }, { status: 413 });
      let storagePath: string | undefined;
      try {
        storagePath = await uploadArtifact(scope, result.id, 'pdf', fileName, bytes, contentType);
        await createArtifactRecord({ scope, runId: result.id, type: 'pdf', fileName, storagePath, size: bytes.byteLength, contentType });
      } catch (error) {
        if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined);
        throw error;
      }
    }
    return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'PDF 生成失败。' }, { status: apiErrorStatus(error) });
  }
}
