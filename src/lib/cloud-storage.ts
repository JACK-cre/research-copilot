import 'server-only';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { DataScope, ArtifactType } from '@/types/platform';

const BUCKET = 'research-files';

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'file';
}

function assertWorkspacePath(scope: DataScope, value: string): void {
  if (scope.mode !== 'cloud' || !value.startsWith(scope.workspaceId + '/')) {
    throw new Error('文件路径不属于当前工作空间。');
  }
}

export async function uploadSourceFile(
  scope: DataScope,
  documentId: string,
  file: File,
): Promise<string> {
  const path = `${scope.workspaceId}/documents/${documentId}/${safeName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await getSupabaseAdminClient().storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error('原始文件保存失败：' + error.message);
  return path;
}

export async function uploadArtifact(
  scope: DataScope,
  runId: string,
  type: ArtifactType,
  fileName: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const path = `${scope.workspaceId}/runs/${runId}/${Date.now()}-${safeName(fileName)}`;
  const { error } = await getSupabaseAdminClient().storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw new Error('研究成品归档失败：' + error.message);
  return path;
}

export async function removeStoredObjects(scope: DataScope, paths: string[]): Promise<void> {
  if (!paths.length) return;
  paths.forEach((path) => assertWorkspacePath(scope, path));
  const { error } = await getSupabaseAdminClient().storage.from(BUCKET).remove(paths);
  if (error) throw new Error('云端文件删除失败：' + error.message);
}

export async function createStoredObjectDownload(scope: DataScope, path: string): Promise<string> {
  assertWorkspacePath(scope, path);
  const { data, error } = await getSupabaseAdminClient().storage
    .from(BUCKET)
    .createSignedUrl(path, 60);
  if (error) throw new Error('下载链接创建失败：' + error.message);
  return data.signedUrl;
}
