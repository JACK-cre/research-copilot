import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { removeStoredObjects, uploadStudyImage } from '@/lib/cloud-storage';
import { refreshStudyMemory } from '@/lib/conversation-memory';
import { bytesToDataUrl, normalizeStudyImage } from '@/lib/study-image-file';
import { assertStudyImageBatch, studyImageCaption } from '@/lib/study-images';
import { appendStudyTurn, getStudyConversation, getStudyMessages, hasWorkspaceStorageCapacity, listStudyConversations } from '@/lib/repository';
import { runStudyTurn } from '@/lib/study-agent';
import type { DataScope, StudyMessageAttachment } from '@/types/platform';

export const runtime = 'nodejs';
export const maxDuration = 120;

const jsonBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().max(50000).default(''),
  useLibrary: z.boolean().default(false),
  useWeb: z.boolean().default(false),
});

type StudyTurnInput = {
  conversationId?: string;
  message: string;
  useLibrary: boolean;
  useWeb: boolean;
  files: File[];
};

async function parseStudyTurnRequest(request: Request): Promise<StudyTurnInput> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const conversationIdRaw = String(form.get('conversationId') || '').trim();
    const conversationId = conversationIdRaw
      ? z.string().uuid().parse(conversationIdRaw)
      : undefined;
    const files = form.getAll('images').filter((item): item is File => item instanceof File && item.size > 0);
    return {
      conversationId,
      message: String(form.get('message') || ''),
      useLibrary: String(form.get('useLibrary') || '') === 'true',
      useWeb: String(form.get('useWeb') || '') === 'true',
      files,
    };
  }

  const parsed = jsonBodySchema.parse(await request.json());
  return { ...parsed, files: [] };
}

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ conversations: await listStudyConversations(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '对话列表读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  let scope: DataScope | undefined;
  const uploaded: string[] = [];
  try {
    const input = await parseStudyTurnRequest(request);
    assertStudyImageBatch(input.files.length);
    scope = await requireDataScope();
    const ai = await resolveAiRuntimeConfig(scope);
    const conversationId = input.conversationId ?? randomUUID();
    const attachments: StudyMessageAttachment[] = [];
    const images: Array<{ name: string; mimeType: string; dataUrl: string }> = [];

    if (input.files.length) {
      const incomingBytes = input.files.reduce((sum, file) => sum + file.size, 0);
      if (!await hasWorkspaceStorageCapacity(scope, incomingBytes)) {
        return NextResponse.json({ error: '工作空间容量不足，请删除旧资料或提高存储额度。' }, { status: 413 });
      }
      for (const file of input.files) {
        const normalized = await normalizeStudyImage(file);
        const storagePath = await uploadStudyImage(scope, conversationId, normalized);
        uploaded.push(storagePath);
        attachments.push({
          id: randomUUID(),
          name: normalized.name,
          mimeType: normalized.mimeType,
          storagePath,
          size: normalized.bytes.byteLength,
        });
        images.push({
          name: normalized.name,
          mimeType: normalized.mimeType,
          dataUrl: bytesToDataUrl(normalized.bytes, normalized.mimeType),
        });
      }
    }

    const message = studyImageCaption(input.message, attachments.length);
    if (!message) {
      return NextResponse.json({ error: '请输入内容或插入图片。' }, { status: 400 });
    }

    const prior = input.conversationId ? await getStudyMessages(scope, input.conversationId) : [];
    const current = input.conversationId ? await getStudyConversation(scope, input.conversationId) : null;
    const assistant = await runStudyTurn({
      ai,
      scope,
      history: prior,
      message,
      useLibrary: input.useLibrary,
      useWeb: input.useWeb,
      memorySummary: current?.memorySummary,
      images,
    });
    const saved = await appendStudyTurn(scope, {
      conversationId,
      userMessage: message,
      attachments,
      assistant,
    });
    const memorySummary = await refreshStudyMemory(scope, saved.conversationId, ai);
    return NextResponse.json({ ...saved, memorySummary });
  } catch (error) {
    if (scope && uploaded.length) {
      await removeStoredObjects(scope, uploaded).catch(() => undefined);
    }
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : '对话失败。';
    const status = error instanceof z.ZodError ? 400 : apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
