import type { ResearchResult } from '@/types/research';

function citationText(ids: string[]): string {
  return ids.map((id) => '[' + id + ']').join(' ');
}

export function buildResearchMarkdown(result: ResearchResult): string {
  return [
    '# ' + result.title,
    '',
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
    '## 参考资料',
    '',
    ...result.evidence.map((item) =>
      '- [' + item.id + '] ' + item.title + (item.sourceUrl ? ' — ' + item.sourceUrl : ''),
    ),
  ].join('\n');
}
