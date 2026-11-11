import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import { createResearchRun, getResearchResult } from '@/lib/repository';
import { createResearchJob } from '@/lib/research-jobs';
import { resolveOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';
export const maxDuration = 30;

const refineSchema = z.object({
  instruction: z.string().trim().min(2).max(50000),
  target: z.enum(['all', 'report', 'slides']).default('all'),
  templateId: z.string().trim().max(120).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const scope = await requireDataScope();
    const input = refineSchema.parse(await request.json());
    const { id } = await params;
    const previous = await getResearchResult(scope, id);
    if (!previous) return NextResponse.json({ error: '待修改的研究版本不存在。' }, { status: 404 });
    const ai = await resolveAiRuntimeConfig(scope);
    const template = await resolveOutputTemplate(scope, input.templateId ?? previous.template?.id ?? previous.request.templateId);
    const nextRequest = {
      ...previous.request,
      requirements: [previous.request.requirements, input.instruction].filter(Boolean).join('\n'),
      templateId: template?.id,
    };
    const runId = await createResearchRun(scope, nextRequest, {
      aiSource: ai.source,
      template,
      parentRunId: previous.id,
      version: (previous.version ?? 1) + 1,
      revisionInstruction: input.instruction,
      revisionTarget: input.target,
    });
    if (scope.mode !== 'cloud') {
      const { refineResearchAgent } = await import('@/lib/research-agent');
      const result = await refineResearchAgent({ previous, instruction: input.instruction, target: input.target, runId, ai, template });
      const { completeResearchRun } = await import('@/lib/repository');
      await completeResearchRun(scope, result);
      return NextResponse.json({ ...result, queued: false });
    }
    const job = await createResearchJob(scope, {
      runId,
      kind: 'refine',
      payload: { previousRunId: previous.id, instruction: input.instruction, target: input.target },
      template,
    });
    return NextResponse.json({ queued: true, job, runId }, { status: 202 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : '版本修改任务创建失败。';
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : apiErrorStatus(error) });
  }
}
