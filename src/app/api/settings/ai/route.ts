import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  deleteAiSettings,
  getAiSettingsSummary,
  saveAiSettings,
} from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';

export const runtime = 'nodejs';

const settingsSchema = z.object({
  apiKey: z.string().trim().min(20).max(500).optional(),
  baseURL: z.string().trim().url().max(500),
  chatModel: z.string().trim().min(1).max(120),
  embeddingModel: z.string().trim().min(1).max(120),
  embeddingDimensions: z.literal(384),
});

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ settings: await getAiSettingsSummary(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 配置读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const scope = await requireDataScope();
    const input = settingsSchema.parse(await request.json());
    await saveAiSettings(scope, input);
    return NextResponse.json({ settings: await getAiSettingsSummary(scope) });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : 'AI 配置保存失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}

export async function DELETE() {
  try {
    const scope = await requireDataScope();
    await deleteAiSettings(scope);
    return NextResponse.json({ settings: await getAiSettingsSummary(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 配置删除失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
