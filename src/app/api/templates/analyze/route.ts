import { NextResponse } from 'next/server';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { analyzeTemplateReference } from '@/lib/template-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 180;

const MAX_TEMPLATE_FILE_BYTES = 300 * 1024 * 1024;
const MAX_TEMPLATE_TOTAL_BYTES = 500 * 1024 * 1024;

function asFile(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File && value.size > 0 ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const formData = await request.formData();
    const noteValue = formData.get('note');
    const note = typeof noteValue === 'string' ? noteValue : '';
    const ai = await resolveAiRuntimeConfig(scope);
    const files = [
      asFile(formData.get('file')),
      asFile(formData.get('paper')),
      asFile(formData.get('slides')),
    ].filter((file): file is File => Boolean(file));
    if (files.some((file) => file.size > MAX_TEMPLATE_FILE_BYTES)) {
      return NextResponse.json({ error: '单个模板文件不能超过 300MB。' }, { status: 413 });
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TEMPLATE_TOTAL_BYTES) {
      return NextResponse.json({ error: '模板文件总大小不能超过 500MB。' }, { status: 413 });
    }
    const analysis = await analyzeTemplateReference({
      file: asFile(formData.get('file')),
      paperFile: asFile(formData.get('paper')),
      slidesFile: asFile(formData.get('slides')),
      note,
      ai,
    });
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板识别失败。';
    const authStatus = apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status: authStatus === 500 ? 400 : authStatus });
  }
}
