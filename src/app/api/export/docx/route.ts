import { NextResponse } from 'next/server';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { buildResearchDocx } from '@/lib/docx-export';
import { createArtifactRecord, getResearchResult, hasWorkspaceStorageCapacity } from '@/lib/repository';
import { removeStoredObjects, uploadArtifact } from '@/lib/cloud-storage';
import type { ResearchResult } from '@/types/research';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const submitted = await request.json() as ResearchResult;
    const result = scope.mode === 'cloud' ? await getResearchResult(scope, submitted?.id) : submitted;
    if (!result?.title || !Array.isArray(result.sections)) return NextResponse.json({ error: '缺少可导出的研究文稿。' }, { status: 400 });
    const bytes = await buildResearchDocx(result);
    const fileName = `research-report-v${result.version ?? 1}.docx`;
    if (scope.mode === 'cloud') {
      if (!await hasWorkspaceStorageCapacity(scope, bytes.byteLength)) return NextResponse.json({ error: '工作空间容量不足。' }, { status: 413 });
      let storagePath: string | undefined;
      try {
        storagePath = await uploadArtifact(scope, result.id, 'docx', fileName, bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        await createArtifactRecord({ scope, runId: result.id, type: 'docx', fileName, storagePath, size: bytes.byteLength, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      } catch (error) { if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined); throw error; }
    }
    return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DOCX 生成失败。' }, { status: apiErrorStatus(error) });
  }
}
