import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveAiRuntimeConfig } from '@/lib/ai-settings';
import { apiErrorStatus, requireDataScope } from '@/lib/auth';
import {
  completeResearchRun,
  createResearchRun,
  failResearchRun,
  getResearchResult,
} from '@/lib/repository';
import { refineResearchAgent } from '@/lib/research-agent';
import { resolveOutputTemplate } from '@/lib/templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

const refineSchema = z.object({
  instruction: z.string().trim().min(2).max(3000),
  target: z.enum(['all', 'report', 'slides']).default('all'),
  templateId: z.string().trim().max(120).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let runId: string | undefined;
  let scope: Awaited<ReturnType<typeof requireDataScope>> | undefined;
  try {
    scope = await requireDataScope();
    const input = refineSchema.parse(await request.json());
    const { id } = await params;
    const previous = await getResearchResult(scope, id);
    if (!previous) return NextResponse.json({ error: '待修改的研究版本不存在。' }, { status: 404 });
    const ai = await resolveAiRuntimeConfig(scope);
    const template = await resolveOutputTemplate(
      scope,
      input.templateId ?? previous.template?.id ?? previous.request.templateId,
    );
    const version = (previous.version ?? 1) + 1;
    const nextRequest = {
      ...previous.request,
      requirements: [previous.request.requirements, input.instruction].filter(Boolean).join('\n'),
      templateId: template?.id,
    };
    runId = await createResearchRun(scope, nextRequest, {
      aiSource: ai.source,
      template,
      parentRunId: previous.id,
      version,
      revisionInstruction: input.instruction,
      revisionTarget: input.target,
    });
    const result = await refineResearchAgent({
      previous,
      instruction: input.instruction,
      target: input.target,
      runId,
      ai,
      template,
    });
    await completeResearchRun(scope, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : '版本修改失败。';
    if (scope && runId) await failResearchRun(scope, runId, message).catch(() => undefined);
    const status = error instanceof z.ZodError
      ? 400
      : message.includes('额度') ? 429 : apiErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
