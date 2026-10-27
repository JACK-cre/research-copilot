import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects, uploadArtifact } from '@/lib/cloud-storage';
import { buildResearchMarkdown } from '@/lib/markdown';
import {
  createArtifactRecord,
  getResearchResult,
  hasWorkspaceStorageCapacity,
} from '@/lib/repository';
import type { ResearchResult } from '@/types/research';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const submitted = (await request.json()) as ResearchResult;
    const result = scope.mode === 'cloud'
      ? await getResearchResult(scope, submitted?.id)
      : submitted;
    if (!result?.title || !Array.isArray(result.sections)) {
      return NextResponse.json({ error: '缺少可导出的研究文稿。' }, { status: 400 });
    }

    const fileName = `research-report-v${result.version ?? 1}.md`;
    const contentType = 'text/markdown';
    const bytes = new TextEncoder().encode(buildResearchMarkdown(result));
    if (scope.mode === 'cloud') {
      if (!await hasWorkspaceStorageCapacity(scope, bytes.byteLength)) {
        return NextResponse.json({ error: '工作空间容量不足，请删除旧资料或提高存储额度。' }, { status: 413 });
      }
      let storagePath: string | undefined;
      try {
        storagePath = await uploadArtifact(scope, result.id, 'markdown', fileName, bytes, contentType);
        await createArtifactRecord({ scope, runId: result.id, type: 'markdown', fileName, storagePath, size: bytes.byteLength, contentType });
      } catch (error) {
        if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined);
        throw error;
      }
    }
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType + ';charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文稿生成失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
