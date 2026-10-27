import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createOutputTemplate, listOutputTemplates } from '@/lib/templates';

export const runtime = 'nodejs';

const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['report', 'presentation', 'both']),
  description: z.string().trim().max(300).default(''),
  school: z.string().trim().max(120).default(''),
  citationStyle: z.string().trim().min(1).max(80).default('GB/T 7714-2015'),
  instructions: z.string().trim().min(10).max(10000),
});

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
    const input = templateSchema.parse(await request.json());
    return NextResponse.json({ template: await createOutputTemplate(scope, input) }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : '模板保存失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}
