import type { Evidence, ReportSection, SlideSpec } from '@/types/research';

export type ClaimAuditIssue = {
  location: string;
  claim: string;
  kind: 'unsupported' | 'number' | 'weak';
  message: string;
};

export type ClaimAudit = {
  valid: boolean;
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  numericIssues: number;
  issues: ClaimAuditIssue[];
};

const NUMBER_PATTERN = /(?:\d+(?:[.,]\d+)?\s*(?:%|％|倍|秒|毫秒|分钟|小时|万|亿)?)/gu;
const EXTERNAL_CLAIM_PATTERN = /研究表明|实验结果|数据表明|显著|提升|降低|优于|导致|证明|根据(?:文献|资料|研究)/u;

function terms(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,4}/gu) ?? []);
}

function overlap(left: string, right: string) {
  const a = terms(left);
  const b = terms(right);
  if (!a.size || !b.size) return 0;
  let matches = 0;
  for (const item of a) if (b.has(item)) matches += 1;
  return matches / Math.min(a.size, b.size);
}

function sentences(content: string) {
  return content.split(/(?<=[。！？!?；;])\s*|\n+/u).map(item => item.trim()).filter(item => item.length >= 8);
}

function auditContent(content: string, citations: string[], location: string, evidence: Map<string, Evidence>, material: string) {
  const issues: ClaimAuditIssue[] = [];
  const claims = sentences(content);
  for (const claim of claims) {
    const numbers = claim.match(NUMBER_PATTERN) ?? [];
    const needsEvidence = Boolean(numbers.length || EXTERNAL_CLAIM_PATTERN.test(claim));
    if (!needsEvidence) continue;
    const cited = citations.map(id => evidence.get(id)).filter((item): item is Evidence => Boolean(item));
    const supported = cited.some(item => overlap(claim, item.excerpt) >= 0.06);
    if (!cited.length && !material.includes(claim.slice(0, Math.min(18, claim.length)))) {
      issues.push({ location, claim, kind: 'unsupported', message: '该论断包含外部事实或高风险表达，但没有绑定证据。' });
      for (const number of numbers) {
        issues.push({ location, claim, kind: 'number', message: `数字 ${number} 没有在用户材料或引用证据中找到。` });
      }
      continue;
    }
    if (cited.length && !supported) {
      issues.push({ location, claim, kind: 'weak', message: '已绑定的证据与该论断语义关联较弱。' });
    }
    for (const number of numbers) {
      const normalized = number.replace(/\s/g, '');
      if (!material.replace(/\s/g, '').includes(normalized) && !cited.some(item => item.excerpt.replace(/\s/g, '').includes(normalized))) {
        issues.push({ location, claim, kind: 'number', message: `数字 ${number} 没有在用户材料或引用证据中找到。` });
      }
    }
  }
  return { issues, count: claims.filter(claim => Boolean((claim.match(NUMBER_PATTERN) ?? []).length || EXTERNAL_CLAIM_PATTERN.test(claim))).length };
}

export function auditClaims(
  evidence: Evidence[],
  sections: Array<Omit<ReportSection, 'id'> & { id?: string }>,
  slides: SlideSpec[],
  material = '',
): ClaimAudit {
  const byId = new Map(evidence.map(item => [item.id, item]));
  const checked = [
    ...sections.map(section => auditContent(section.content, section.citations, `章节：${section.title}`, byId, material)),
    ...slides.map(slide => auditContent([
      slide.title,
      ...slide.keyPoints,
      ...(slide.visual?.items ?? []).flatMap(item => [item.title, item.description ?? '', item.value ?? '']),
    ].join('。'), slide.citations, `幻灯片：${slide.title}`, byId, material)),
  ];
  const issues = checked.flatMap(item => item.issues);
  const totalClaims = checked.reduce((sum, item) => sum + item.count, 0);
  return {
    valid: issues.every(issue => issue.kind !== 'unsupported' && issue.kind !== 'number'),
    totalClaims,
    supportedClaims: Math.max(0, totalClaims - new Set(issues.map(issue => `${issue.location}:${issue.claim}`)).size),
    unsupportedClaims: issues.filter(issue => issue.kind === 'unsupported').length,
    numericIssues: issues.filter(issue => issue.kind === 'number').length,
    issues: issues.slice(0, 20),
  };
}
