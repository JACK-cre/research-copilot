import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { readTemplatePayload } from '@/lib/template-form';
import { createOutputTemplate, listOutputTemplates } from '@/lib/templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ templates: await listOutputTemplates(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const input = await readTemplatePayload(request);
    return NextResponse.json({ template: await createOutputTemplate(scope, input) }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : '模板保存失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}
