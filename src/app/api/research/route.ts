import { NextResponse } from 'next/server';
import { z } from 'zod';

import { runResearchAgent } from '@/lib/research-agent';

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
}).refine((value) => value.includeExternal || value.includeLibrary, {
  message: '至少选择一个检索来源。',
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return NextResponse.json(await runResearchAgent(input));
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : '研究任务执行失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
