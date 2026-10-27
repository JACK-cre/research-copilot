import type { RevisionTarget } from '@/types/platform';
import type { GeneratedResearchOutput, ResearchResult } from '@/types/research';

function previousOutput(previous: ResearchResult): GeneratedResearchOutput {
  return {
    title: previous.title,
    thesis: previous.thesis,
    sections: previous.sections.map(({ title, content, citations }) => ({ title, content, citations })),
    slides: previous.slides.map(({ type, title, keyPoints, citations, speakerNotes }) => ({
      type,
      title,
      keyPoints,
      citations,
      speakerNotes,
    })),
  };
}

export function buildLocalRevision(
  previous: ResearchResult,
  instruction: string,
  target: RevisionTarget,
): GeneratedResearchOutput {
  const output = previousOutput(previous);
  const citations = previous.evidence.slice(0, 3).map((item) => item.id);
  if (target !== 'slides') {
    output.thesis = previous.thesis + ' 本版进一步围绕“' + instruction + '”扩展分析范围与证据讨论。';
    const evidenceExpansions = previous.evidence.slice(0, 3).map((item, index) => ({
      title: '扩展视角 ' + (index + 1) + '：' + item.title,
      content: '针对本轮要求“' + instruction + '”，可从该证据继续展开：' + item.excerpt + '。这一视角需要与全文已有判断交叉验证，并在正式使用前复核原始来源。',
      citations: [item.id],
    }));
    output.sections = [...output.sections, {
      title: '本轮修订重点',
      content: '本版明确按以下要求调整内容与组织方式：' + instruction + '。以下新增部分基于已有证据扩展方向，未获得模型支持的推断仍需人工确认。',
      citations,
    }, ...evidenceExpansions];
  }
  if (target !== 'report') {
    const conclusion = output.slides.slice(-1);
    output.slides = [...output.slides.slice(0, -1).slice(0, 9), {
      type: 'evidence',
      title: '本轮补充重点',
      keyPoints: [instruction, '围绕已有证据扩展分析方向', '新增内容保持引用可追溯'],
      citations,
      speakerNotes: '说明本轮补充要求以及对应修改。',
    }, ...previous.evidence.slice(0, 2).map((item) => ({
      type: 'evidence' as const,
      title: '补充证据：' + item.title,
      keyPoints: [item.excerpt],
      citations: [item.id],
      speakerNotes: '结合本轮要求说明该证据带来的新增判断。',
    })), ...conclusion];
  }
  return output;
}
