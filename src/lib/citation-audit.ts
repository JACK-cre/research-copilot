import type { Evidence, ReportSection, SlideSpec } from '@/types/research';

export interface CitationAuditIssue {
  location: string;
  citation: string;
  kind: 'missing' | 'duplicate' | 'weak';
  message: string;
}

export interface CitationAudit {
  valid: boolean;
  issues: CitationAuditIssue[];
  citedEvidence: number;
  totalEvidence: number;
}

function lexicalOverlap(left: string, right: string): number {
  const terms = (value: string) => new Set(
    (value.toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,4}/gu) ?? []).filter(Boolean),
  );
  const leftTerms = terms(left);
  const rightTerms = terms(right);
  if (!leftTerms.size || !rightTerms.size) return 0;
  let matches = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) matches += 1;
  return matches / Math.min(leftTerms.size, rightTerms.size);
}

function auditCitationList(
  citations: string[],
  content: string,
  evidenceById: Map<string, Evidence>,
  location: string,
): CitationAuditIssue[] {
  const issues: CitationAuditIssue[] = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    if (seen.has(citation)) {
      issues.push({ location, citation, kind: 'duplicate', message: '同一位置重复引用。' });
      continue;
    }
    seen.add(citation);
    const evidence = evidenceById.get(citation);
    if (!evidence) {
      issues.push({ location, citation, kind: 'missing', message: '引用了不存在的证据 ID。' });
      continue;
    }
    if (content.trim().length >= 20 && lexicalOverlap(content, evidence.excerpt) < 0.015) {
      issues.push({ location, citation, kind: 'weak', message: '引用与正文词汇关联较弱，建议人工复核。' });
    }
  }
  return issues;
}

export function auditCitations(
  evidence: Evidence[],
  sections: ReportSection[],
  slides: SlideSpec[],
): CitationAudit {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const issues = [
    ...sections.flatMap((section) => auditCitationList(section.citations, section.content, evidenceById, `章节：${section.title}`)),
    ...slides.flatMap((slide) => auditCitationList(slide.citations, slide.keyPoints.join(' '), evidenceById, `幻灯片：${slide.title}`)),
  ];
  const cited = new Set([...sections.flatMap((section) => section.citations), ...slides.flatMap((slide) => slide.citations)]);
  return {
    valid: !issues.some((issue) => issue.kind === 'missing'),
    issues,
    citedEvidence: [...cited].filter((id) => evidenceById.has(id)).length,
    totalEvidence: evidence.length,
  };
}
