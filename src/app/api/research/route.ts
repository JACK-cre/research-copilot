import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import {
  completeResearchRun,
  createResearchRun,
  failResearchRun,
  listResearchRuns,
} from '@/lib/repository';
import { runResearchAgent } from '@/lib/research-agent';
import { resolveOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(240),
  requirements: z.string().trim().max(1200).default(''),
  deliverable: z.enum(['survey', 'proposal', 'briefing']).default('survey'),
  audience: z.enum(['general', 'technical', 'academic']).default('technical'),
  yearFrom: z.number().int().min(1950).max(new Date().getFullYear()).default(2020),
  paperCount: z.number().int().min(3).max(20).default(8),
  includeExternal: z.boolean().default(true),
  includeLibrary: z.boolean().default(true),
  templateId: z.string().trim().min(1).max(120).default('default-academic-paper'),
}).refine((value) => value.includeExternal || value.includeLibrary, {
  message: '至少选择一个检索来源。',
});

export async function POST(request: Request) {
  let runId: string | undefined;
  let scope: Awaited<ReturnType<typeof requireDataScope>> | undefined;
  try {
    const input = requestSchema.parse(await request.json());
    scope = await requireDataScope();
    const ai = await resolveAiRuntimeConfig(scope);
    const template = await resolveOutputTemplate(scope, input.templateId);
    runId = await createResearchRun(scope, input, { aiSource: ai.source, template });
    const result = await runResearchAgent(input, scope, runId, ai, template);
    await completeResearchRun(scope, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : '研究任务执行失败。';
    if (scope && runId) await failResearchRun(scope, runId, message).catch(() => undefined);
    const status = error instanceof z.ZodError
      ? 400
      : message.includes('额度')
        ? 429
        : apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    const scope = await requireDataScope();
    return NextResponse.json({ runs: await listResearchRuns(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '研究历史读取失败。';
    return NextResponse.json({ error: message }, { status: apiErrorStatus(error) });
  }
}
