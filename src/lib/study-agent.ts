import { createChatJsonCompletion, createChatTextCompletion, createChatVisionCompletion, isVisionChatModel } from '@/lib/chat-client';
import { buildChatMemoryPreamble, formatMemoryTranscript, splitConversationMemory } from '@/lib/conversation-memory';
import { normalizeStudyAction } from '@/lib/generated-output';
import { callResearchTool } from '@/mcp/client';
import { studyAttachmentLabel } from '@/lib/study-images';
import { excerpt } from '@/lib/text';
import type { AiRuntimeConfig, DataScope, StudyCitation, StudyMessage, StudyToolTrace } from '@/types/platform';
import type { Paper, ResearchIntent } from '@/types/research';
import type { KnowledgeSearchResult } from '@/lib/vector-store';

export const MAX_TOOL_ROUNDS = 6;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function detectChatIntent(message: string): ResearchIntent {
  if (/读后感|书评|读书/.test(message)) return 'book_review';
  if (/论文|综述|算法|模型|实验|arxiv|文献/.test(message)) return 'academic';
  return 'general';
}

async function runStudyTool(
  name: string,
  args: Record<string, unknown>,
  input: { scope?: DataScope; ai: AiRuntimeConfig; useLibrary: boolean; useWeb: boolean },
): Promise<{ summary: string; observations: string; citations: StudyCitation[] }> {
  if (name === 'list_library') {
    const documents = await callResearchTool<Array<{ name: string; chunkCount: number }>>('list_library', {}, input.scope);
    return {
      summary: `知识库 ${documents.length} 份文档`,
      observations: documents.length
        ? documents.map((document) => `${document.name}（${document.chunkCount} 块）`).join('\n')
        : '知识库为空。',
      citations: [],
    };
  }
  if (name === 'search_knowledge') {
    if (!input.useLibrary) return { summary: '未启用知识库', observations: '用户关闭了知识库检索。', citations: [] };
    const query = asString(args.query) || asString(args.q);
    if (query.length < 2) return { summary: '查询过短', observations: '需要更具体的问题。', citations: [] };
    const matches = await callResearchTool<KnowledgeSearchResult[]>('search_knowledge', {
      query,
      keywordQuery: query,
      limit: 6,
    }, input.scope);
    return {
      summary: `知识库命中 ${matches.length} 条`,
      observations: matches.map((match, index) => `[K${index + 1}] ${match.documentName}: ${excerpt(match.content, 280)}`).join('\n\n') || '没有达到相关性标准的知识库片段。',
      citations: matches.map((match, index) => ({ id: `K${index + 1}`, title: match.documentName })),
    };
  }
  if (name === 'search_sources' || name === 'search_arxiv') {
    if (!input.useWeb) return { summary: '未启用外部检索', observations: '用户关闭了外部资料检索。', citations: [] };
    const query = asString(args.query) || asString(args.q);
    if (query.length < 2) return { summary: '查询过短', observations: '需要更具体的主题。', citations: [] };
    if (name === 'search_arxiv') {
      const result = await callResearchTool<{ papers: Paper[]; warning?: string }>('search_arxiv', {
        query,
        limit: 8,
      }, input.scope);
      return {
        summary: `arXiv ${result.papers.length} 篇`,
        observations: result.papers.map((paper, index) => `[A${index + 1}] ${paper.title} (${paper.year}): ${excerpt(paper.abstract, 220)} ${paper.url}`).join('\n\n') || result.warning || 'arXiv 没有可用结果。',
        citations: result.papers.map((paper, index) => ({ id: `A${index + 1}`, title: paper.title, url: paper.url })),
      };
    }
    const result = await callResearchTool<{ papers: Paper[]; warnings: string[] }>('search_sources', {
      queries: [query],
      intent: detectChatIntent(query),
      yearFrom: 1900,
      limit: 12,
    }, input.scope);
    return {
      summary: `外部来源 ${result.papers.length} 条`,
      observations: result.papers.slice(0, 8).map((paper, index) => `[S${index + 1}] ${paper.title}: ${excerpt(paper.abstract, 220)}`).join('\n\n') || result.warnings.join('\n') || '没有可用外部来源。',
      citations: result.papers.slice(0, 8).map((paper, index) => ({ id: `S${index + 1}`, title: paper.title, url: paper.url })),
    };
  }
  if (name === 'fetch_url') {
    if (!input.useWeb) return { summary: '未启用外部检索', observations: '用户关闭了网页读取。', citations: [] };
    const url = asString(args.url);
    const page = await callResearchTool<{ url: string; title: string; text: string }>('fetch_url', { url }, input.scope);
    return {
      summary: `已读取 ${page.title}`,
      observations: `${page.title}\n${page.url}\n${excerpt(page.text, 1800)}`,
      citations: [{ id: 'W1', title: page.title, url: page.url }],
    };
  }
  throw new Error(`未知工具：${name}`);
}


export type StudyTurnImage = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

const VISION_REQUIRED_ERROR = '当前对话模型不支持识图。请在配置中心把对话模型改成 glm-5.3-flash（智谱原生多模态）后再发送图片。';

function formatHistoryContent(item: StudyMessage): string {
  const label = studyAttachmentLabel((item.attachments ?? []).map((file) => file.name));
  if (!label) return item.content;
  return item.content.trim() ? `${item.content}\n${label}` : label;
}

async function describeStudyImages(input: {
  ai: AiRuntimeConfig;
  message: string;
  images: StudyTurnImage[];
}): Promise<string> {
  const names = studyAttachmentLabel(input.images.map((image) => image.name));
  const description = await createChatVisionCompletion({
    ai: input.ai,
    system: '你是看图助手。用中文描述图片中的可见内容、文字和关键细节，不要编造看不见的信息，也不要回答用户的其他问题。',
    prompt: input.message.trim() || '请描述这些图片。',
    images: input.images.map((image) => image.dataUrl),
    timeoutMs: 120_000,
  });
  return [names, `识图结果：\n${description.trim()}`].filter(Boolean).join('\n');
}

export function isFreeChatMode(input: { useLibrary: boolean; useWeb: boolean }): boolean {
  return !input.useLibrary && !input.useWeb;
}

async function runFreeChatTurn(input: {
  ai: AiRuntimeConfig;
  history: StudyMessage[];
  message: string;
  memorySummary?: string;
  images?: StudyTurnImage[];
}): Promise<{ content: string; citations: StudyCitation[]; toolTrace: StudyToolTrace[] }> {
  const { recent } = splitConversationMemory(input.history);
  const preamble = buildChatMemoryPreamble(input.memorySummary ?? '');
  const system = [
    '你是 Research Copilot 的日常对话助手。',
    '用自然、简洁的中文回答，除非用户要求其他语言。',
    '不要检索知识库或互联网，也不要假装查过资料。',
    '不要编造参考文献、链接、论文编号或数据。',
    '可以闲聊、解释概念、改写句子、给学习建议；不确定就直说。',
    '如果用户发了图片，根据可见内容回答；看不清就直说。',
    preamble,
  ].filter(Boolean).join('\n');
  const history = recent.map((item) => ({ role: item.role, content: formatHistoryContent(item) }));
  const images = input.images ?? [];
  if (images.length) {
    if (!isVisionChatModel(input.ai.chatModel)) {
      throw new Error(VISION_REQUIRED_ERROR);
    }
    const content = await createChatVisionCompletion({
      ai: input.ai,
      system,
      history,
      prompt: input.message,
      images: images.map((image) => image.dataUrl),
      timeoutMs: 120_000,
    });
    return { content, citations: [], toolTrace: [] };
  }
  const content = await createChatTextCompletion({
    ai: input.ai,
    system,
    messages: [
      ...history,
      { role: 'user' as const, content: input.message },
    ],
    temperature: 0.7,
  });
  return { content, citations: [], toolTrace: [] };
}

export async function runStudyTurn(input: {
  ai: AiRuntimeConfig;
  scope?: DataScope;
  history: StudyMessage[];
  message: string;
  useLibrary: boolean;
  useWeb: boolean;
  memorySummary?: string;
  images?: StudyTurnImage[];
}): Promise<{ content: string; citations: StudyCitation[]; toolTrace: StudyToolTrace[] }> {
  if (!input.ai.apiKey) {
    throw new Error('请先在配置中心填写对话模型 API Key，才能使用对话。');
  }

  if (isFreeChatMode(input)) {
    return runFreeChatTurn(input);
  }

  const toolTrace: StudyToolTrace[] = [];
  const citations: StudyCitation[] = [];
  const { recent } = splitConversationMemory(input.history);
  const preamble = buildChatMemoryPreamble(input.memorySummary ?? '');
  const images = input.images ?? [];
  let imageNotes = '';
  if (images.length) {
    if (isVisionChatModel(input.ai.chatModel)) {
      try {
        imageNotes = await describeStudyImages({
          ai: input.ai,
          message: input.message,
          images,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : '识图失败';
        if (!input.message.trim()) throw error instanceof Error ? error : new Error(detail);
        imageNotes = `${studyAttachmentLabel(images.map((image) => image.name))}。识图失败：${detail}`;
      }
    } else if (!input.message.trim()) {
      throw new Error(VISION_REQUIRED_ERROR);
    } else {
      imageNotes = `${studyAttachmentLabel(images.map((image) => image.name))}。当前模型不支持识图，请结合文字要求作答，不要假装看过图片。`;
    }
  }
  const transcript = [
    preamble,
    formatMemoryTranscript(recent),
    `User: ${input.message}`,
    imageNotes,
  ].filter(Boolean).join('\n');

  let observations = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const parsed = await createChatJsonCompletion({
      ai: input.ai,
      system: [
        'You are a study tutor for Research Copilot. Return JSON only. You may use tools in a ReAct loop, but stop and answer once you have enough evidence.',
        'You may call tools to ground answers in the user knowledge base or public sources.',
        'Never invent citations. If evidence is weak, say so.',
        'Write the final answer in Chinese unless the user asks otherwise.',
        input.useLibrary ? 'Knowledge base tools are allowed.' : 'Do not call search_knowledge or list_library.',
        input.useWeb ? 'External tools are allowed.' : 'Do not call search_sources, search_arxiv, or fetch_url.',
        images.length ? 'The user sent images. Use the 识图结果; do not invent visual details that were not described.' : '',
      ].join(' '),
      user: [
        'Available tools: list_library, search_knowledge, search_sources, search_arxiv, fetch_url.',
        'If you need a tool, return {"type":"tool","name":"search_knowledge","arguments":{"query":"..."}}.',
        'If you can answer, return {"type":"final","content":"markdown","citations":["K1"]}.',
        'Conversation:',
        transcript,
        observations ? '\nTool observations:\n' + observations : '',
      ].join('\n'),
      temperature: 0.3,
      maxTokens: 4096,
    });
    const action = normalizeStudyAction(parsed);
    if (action.type === 'final' && action.content.trim()) {
      const cited = action.citations.length
        ? citations.filter((item) => action.citations.includes(item.id))
        : citations.slice(0, 8);
      return { content: action.content.trim(), citations: cited, toolTrace };
    }
    if (action.type !== 'tool' || !action.name) {
      if (action.content.trim()) {
        return { content: action.content.trim(), citations: citations.slice(0, 8), toolTrace };
      }
      continue;
    }
    try {
      const result = await runStudyTool(action.name, action.arguments, input);
      toolTrace.push({ name: action.name, summary: result.summary });
      citations.push(...result.citations);
      observations += `\n[${action.name}] ${result.summary}\n${result.observations}\n`;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '工具失败';
      toolTrace.push({ name: action.name, summary: detail });
      observations += `\n[${action.name}] ERROR: ${detail}\n`;
    }
  }

  return {
    content: '我已经检索了相关资料，但还不能给出完整结论。请把问题再具体一点，或先上传对应资料到知识库。',
    citations: citations.slice(0, 8),
    toolTrace,
  };
}
