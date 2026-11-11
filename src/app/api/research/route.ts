import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createResearchRun, listResearchRuns } from '@/lib/repository';
import { createResearchJob } from '@/lib/research-jobs';
import { resolveOutputTemplate } from '@/lib/templates';
import { logEvent, requestContext } from '@/lib/observability';

export const runtime = 'nodejs';
export const maxDuration = 30;

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(500),
  requirements: z.string().trim().max(50000).default(''),
  deliverable: z.enum(['survey', 'proposal', 'briefing']).default('survey'),
  audience: z.enum(['general', 'technical', 'academic']).default('technical'),
  yearFrom: z.number().int().min(1900).max(new Date().getFullYear()).default(2020),
  paperCount: z.number().int().min(3).max(40).default(8),
  includeExternal: z.boolean().default(true),
  includeLibrary: z.boolean().default(true),
  templateId: z.string().trim().max(120).optional().default(''),
}).refine((value) => value.includeExternal || value.includeLibrary, {
  message: '至少选择一个检索来源。',
});

export async function POST(request: Request) {
  const context = requestContext(request);
  try {
    const input = requestSchema.parse(await request.json());
    const scope = await requireDataScope();
    const ai = await resolveAiRuntimeConfig(scope);
    const template = await resolveOutputTemplate(scope, input.templateId);
    const runId = await createResearchRun(scope, input, { aiSource: ai.source, template });
    if (scope.mode !== 'cloud') {
      // Local compatibility mode remains synchronous because it has no durable
      // queue database.
      const { runResearchAgent } = await import('@/lib/research-agent');
      const result = await runResearchAgent(input, scope, runId, ai, template);
      const { completeResearchRun } = await import('@/lib/repository');
      await completeResearchRun(scope, result);
      return NextResponse.json({ ...result, queued: false });
    }
    const job = await createResearchJob(scope, {
      runId,
      kind: 'research',
      payload: { request: input },
      template,
    });
    logEvent('research.job.created', { ...context, runId, jobId: job.id, userId: scope.userId, workspaceId: scope.workspaceId });
    return NextResponse.json({ queued: true, job, runId }, { status: 202 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : '研究任务创建失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
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
