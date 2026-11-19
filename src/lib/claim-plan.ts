import { z } from 'zod';

import type { Evidence } from '@/types/research';

export interface ClaimPlanEntry {
  id: string;
  claim: string;
  evidenceIds: string[];
  confidence: number;
  kind: 'fact' | 'analysis' | 'first-party' | 'open-question';
}

const schema = z.object({
  claims: z.array(z.object({
    id: z.string().trim().min(1).max(24),
    claim: z.string().trim().min(8).max(500),
    evidenceIds: z.array(z.string().trim()).max(8).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    kind: z.enum(['fact', 'analysis', 'first-party', 'open-question']).default('analysis'),
  })).max(40),
});

export function normalizeClaimPlan(value: unknown, evidence: Evidence[]): ClaimPlanEntry[] {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return [];
  const ids = new Set(evidence.map(item => item.id));
  const seen = new Set<string>();
  return parsed.data.claims.flatMap((item, index) => {
    const id = item.id || `C${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ ...item, id, evidenceIds: item.evidenceIds.filter(candidate => ids.has(candidate)) }];
  });
}

export function claimPlanContext(claims: ClaimPlanEntry[]): string {
  if (!claims.length) return 'No claim plan was available. Treat user material as first-party facts and do not invent external claims.';
  return claims.map(item => [
    `[${item.id}] ${item.claim}`,
    `kind=${item.kind}; confidence=${item.confidence.toFixed(2)}; evidence=${item.evidenceIds.join(', ') || 'none'}`,
  ].join('\n')).join('\n\n');
}
