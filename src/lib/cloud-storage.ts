import 'server-only';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ArtifactType, DataScope } from '@/types/platform';

export type StoredObjectDownload =
  | { kind: 'redirect'; url: string }
  | { kind: 'bytes'; bytes: Uint8Array };

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '') || 'file';
}

function assertWorkspacePath(scope: DataScope, value: string): void {
  const normalized = value.replace(/\\/g, '/');
  if (scope.mode !== 'cloud'
    || normalized.startsWith('/')
    || normalized.split('/').includes('..')
    || !normalized.startsWith(scope.workspaceId + '/')) {
    throw new Error('文件路径不属于当前工作空间。');
  }
}

function storageDriver(): 'local' | 's3' {
  return process.env.OBJECT_STORAGE_DRIVER?.trim().toLowerCase() === 's3' ? 's3' : 'local';
}

function storageRoot(): string {
  return path.resolve(process.env.DATA_DIRECTORY?.trim() || path.join(process.cwd(), 'data'), 'files');
}

function localFilePath(key: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) throw new Error('文件路径无效。');
  return resolved;
}

let s3Client: S3Client | undefined;

function s3Config(): { client: S3Client; bucket: string } {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || 'auto';
  if (!bucket) throw new Error('S3_BUCKET 尚未配置。');
  if (!s3Client) {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new Error('S3_ACCESS_KEY_ID 与 S3_SECRET_ACCESS_KEY 必须同时配置。');
    }
    s3Client = new S3Client({
      region,
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    });
  }
  return { client: s3Client, bucket };
}

async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (storageDriver() === 'local') {
    const target = localFilePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return;
  }
  const { client, bucket } = s3Config();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function uploadSourceFile(
  scope: DataScope,
  documentId: string,
  file: File,
): Promise<string> {
  const key = `${scope.workspaceId}/documents/${documentId}/${safeName(file.name)}`;
  assertWorkspacePath(scope, key);
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || 'application/octet-stream');
  return key;
}

export async function uploadArtifact(
  scope: DataScope,
  runId: string,
  type: ArtifactType,
  fileName: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const key = `${scope.workspaceId}/runs/${runId}/${Date.now()}-${type}-${safeName(fileName)}`;
  assertWorkspacePath(scope, key);
  await putObject(key, body, contentType);
  return key;
}

export async function removeStoredObjects(scope: DataScope, keys: string[]): Promise<void> {
  if (!keys.length) return;
  keys.forEach((key) => assertWorkspacePath(scope, key));
  if (storageDriver() === 'local') {
    await Promise.all(keys.map((key) => rm(localFilePath(key), { force: true })));
    return;
  }
  const { client, bucket } = s3Config();
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  }));
}

export async function createStoredObjectDownload(
  scope: DataScope,
  key: string,
): Promise<StoredObjectDownload> {
  assertWorkspacePath(scope, key);
  if (storageDriver() === 'local') {
    return { kind: 'bytes', bytes: new Uint8Array(await readFile(localFilePath(key))) };
  }
  const { client, bucket } = s3Config();
  return {
    kind: 'redirect',
    url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 }),
  };
}

export function getObjectStorageDriver(): 'local' | 's3' {
  return storageDriver();
}
