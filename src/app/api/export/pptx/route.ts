import { NextResponse } from 'next/server';

import { buildPresentation } from '@/lib/presentation';
import type { ResearchResult } from '@/types/research';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const result = (await request.json()) as ResearchResult;
    if (!result?.title || !Array.isArray(result.slides) || result.slides.length === 0) {
      return NextResponse.json({ error: '缺少可导出的幻灯片内容。' }, { status: 400 });
    }
    const bytes = await buildPresentation(result);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="research-briefing.pptx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PPT 生成失败。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
