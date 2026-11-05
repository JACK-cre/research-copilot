import { NextResponse } from 'next/server';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { analyzeTemplateReference } from '@/lib/template-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 90;

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
