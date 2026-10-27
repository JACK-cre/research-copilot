import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const { id } = await params;
    const store = getVectorStore();
    const document = await store.getDocument(id, scope);
    if (!document) return NextResponse.json({ error: '资料不存在。' }, { status: 404 });
    const chunks = await store.listDocumentChunks(id, 8, scope);
    return NextResponse.json({ document, chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : '证据片段读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
