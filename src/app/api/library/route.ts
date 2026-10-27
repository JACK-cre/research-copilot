import { NextResponse } from 'next/server';

import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects, uploadSourceFile } from '@/lib/cloud-storage';
import { parseUpload } from '@/lib/documents';
import { hasWorkspaceStorageCapacity } from '@/lib/repository';
import { getVectorStore } from '@/lib/vector-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ documents: await getVectorStore().listDocuments(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '知识库读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireDataScope();
    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: '请选择文件。' }, { status: 400 });
    }
    if (files.length > 8) {
      return NextResponse.json({ error: '每次最多上传 8 个文件。' }, { status: 400 });
    }

    const incomingBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (!await hasWorkspaceStorageCapacity(scope, incomingBytes)) {
      return NextResponse.json({ error: '知识库空间不足，请删除旧资料或提高 WORKSPACE_STORAGE_LIMIT_MB。' }, { status: 413 });
    }

    const documents = [];
    for (const file of files) {
      const parsed = await parseUpload(file);
      let storagePath: string | undefined;
      try {
        if (scope.mode === 'cloud') {
          storagePath = await uploadSourceFile(scope, parsed.document.id, file);
          parsed.document.storagePath = storagePath;
        }
        await getVectorStore().saveDocument(parsed.document, parsed.chunks, scope);
      } catch (error) {
        if (storagePath) await removeStoredObjects(scope, [storagePath]).catch(() => undefined);
        throw error;
      }
      documents.push(parsed.document);
    }
    return NextResponse.json({ documents }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '文件处理失败。';
    const status = apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status: status === 500 ? 400 : status });
  }
}
