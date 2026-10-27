import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { deleteOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';

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
