import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { readTemplatePayload } from '@/lib/template-form';
import { deleteOutputTemplate, updateOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const input = await readTemplatePayload(request);
    const template = await updateOutputTemplate(scope, id, input);
    if (!template) return NextResponse.json({ error: '模板不存在或不可修改。' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : '模板修改失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    if (!await deleteOutputTemplate(scope, id)) {
      return NextResponse.json({ error: '模板不存在或不可删除。' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
