import { NextResponse } from 'next/server';

import { parseUpload } from '@/lib/documents';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ documents: await getVectorStore().listDocuments() });
  } catch (error) {
    const message = error instanceof Error ? error.message : '知识库读取失败。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: '请选择文件。' }, { status: 400 });
    }
    if (files.length > 8) {
      return NextResponse.json({ error: '每次最多上传 8 个文件。' }, { status: 400 });
    }

    const documents = [];
    for (const file of files) {
      const parsed = await parseUpload(file);
      await getVectorStore().saveDocument(parsed.document, parsed.chunks);
      documents.push(parsed.document);
    }
    return NextResponse.json({ documents }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文件处理失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
