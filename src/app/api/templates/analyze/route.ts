import { NextResponse } from 'next/server';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { analyzeTemplateReference } from '@/lib/template-analyzer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const formData = await request.formData();
    const fileValue = formData.get('file');
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : undefined;
    const noteValue = formData.get('note');
    const note = typeof noteValue === 'string' ? noteValue : '';
    const ai = await resolveAiRuntimeConfig(scope);
    const analysis = await analyzeTemplateReference({ file, note, ai });
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板识别失败。';
    const authStatus = apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status: authStatus === 500 ? 400 : authStatus });
  }
}
