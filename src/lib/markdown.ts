import type { Evidence, Paper, ResearchResult } from '@/types/research';

function citationText(ids: string[]): string {
  return ids.map((id) => '[' + id + ']').join(' ');
}

function formatReference(item: Evidence, paper: Paper | undefined, style: string): string {
  if (!paper) return item.title + (item.sourceUrl ? ' — ' + item.sourceUrl : '');
  const authors = paper.authors.map((author) => author.name).join(', ') || '作者不详';
  const url = paper.doi ? 'https://doi.org/' + paper.doi.replace(/^https?:\/\/doi\.org\//, '') : paper.url;
  const normalized = style.toUpperCase();
  if (normalized.includes('APA')) return `${authors} (${paper.year}). ${paper.title}. ${url}`;
  if (normalized.includes('IEEE')) return `${authors}, “${paper.title},” ${paper.year}. [Online]. Available: ${url}`;
  return `${authors}. ${paper.title}[J/OL]. ${paper.year}. ${url}`;
}

export function buildResearchMarkdown(result: ResearchResult): string {
  return [
    '# ' + result.title,
    '',
    ...(result.template
      ? [`> 模板：${result.template.name} · 引用格式：${result.template.citationStyle} · 版本：V${result.version ?? 1}`, '']
      : []),
    '> ' + result.thesis,
    '',
    ...result.sections.flatMap((section) => [
      '## ' + section.title,
      '',
      section.content,
      '',
      section.citations.length ? '来源：' + citationText(section.citations) : '',
      '',
    ]),
    '## 参考资料' + (result.template ? `（${result.template.citationStyle}）` : ''),
    '',
    ...result.evidence.map((item) => {
      const paper = item.kind === 'paper'
        ? result.papers.find((candidate) => candidate.title === item.title)
        : undefined;
      return '- [' + item.id + '] ' + formatReference(item, paper, result.template?.citationStyle ?? 'GB/T 7714-2015');
    }),
  ].join('\n');
}
