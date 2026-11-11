import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createStoredObjectDownload, removeStoredObjects, uploadArtifact } from '@/lib/cloud-storage';
import { buildPresentation } from '@/lib/presentation';
import {
  createArtifactRecord,
  getResearchResult,
  hasWorkspaceStorageCapacity,
} from '@/lib/repository';
import type { ResearchResult } from '@/types/research';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const submitted = (await request.json()) as ResearchResult;
    let result = scope.mode === 'cloud'
      ? await getResearchResult(scope, submitted?.id)
      : submitted;
    if (!result?.title || !Array.isArray(result.slides) || result.slides.length === 0) {
      return NextResponse.json({ error: '缺少可导出的幻灯片内容。' }, { status: 400 });
    }
    // Resolve object-storage-backed template images before rendering. Legacy
    // templates still carry inline data URLs and work unchanged.
    if (scope.mode === 'cloud' && result.template?.blueprint) {
      const hydratedTemplate = {
        ...result.template,
        blueprint: {
          ...result.template.blueprint,
          slides: await Promise.all(result.template.blueprint.slides.map(async (slide) => ({
            ...slide,
            elements: await Promise.all((slide.elements ?? []).map(async (element) => {
              if (!element.imageStoragePath || element.imageDataUrl) return element;
              const download = await createStoredObjectDownload(scope, element.imageStoragePath);
              if (download.kind !== 'bytes') return element;
              return {
                ...element,
                imageDataUrl: `data:image/png;base64,${Buffer.from(download.bytes).toString('base64')}`,
              };
            })),
          }))),
        },
      };
      result = { ...result, template: hydratedTemplate };
    }
    const bytes = await buildPresentation(result);
    if (scope.mode === 'cloud') {
      if (!await hasWorkspaceStorageCapacity(scope, bytes.byteLength)) {
        return NextResponse.json({ error: '工作空间容量不足，请删除旧资料或提高存储额度。' }, { status: 413 });
      }
      const fileName = `research-briefing-v${result.version ?? 1}.pptx`;
      const contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      let storagePath: string | undefined;
      try {
        storagePath = await uploadArtifact(scope, result.id, 'pptx', fileName, bytes, contentType);
        await createArtifactRecord({ scope, runId: result.id, type: 'pptx', fileName, storagePath, size: bytes.byteLength, contentType });
      } catch (error) {
        if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined);
        throw error;
      }
    }
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="research-briefing-v${result.version ?? 1}.pptx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PPT 生成失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
