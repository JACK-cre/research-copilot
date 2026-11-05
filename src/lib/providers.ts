export interface ModelProvider {
  id: string;
  name: string;
  kind: 'chat' | 'embedding' | 'both';
  baseURL: string;
  keyUrl: string;
  docsUrl?: string;
  chatModels: string[];
  embeddingModels: string[];
  embeddingNotes: string;
  vectorDbNotes: string;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'zhipu',
    name: '智谱 GLM',
    kind: 'both',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/start/quick-start',
    chatModels: ['glm-5.3', 'glm-4.7-flash', 'glm-4.5-flash'],
    embeddingModels: ['embedding-3', 'embedding-2'],
    embeddingNotes: '走 OpenAI 兼容 /embeddings。不要手填维度，使用接口返回的原生维度；换模型后必须重新上传知识库。',
    vectorDbNotes: 'pgvector 按返回向量长度存储。embedding-3 常见 2048 维，embedding-2 常见 1024 维。同一知识库不要混用模型。',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'chat',
    baseURL: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/',
    chatModels: ['deepseek-chat', 'deepseek-reasoner'],
    embeddingModels: [],
    embeddingNotes: 'DeepSeek 目前没有官方 Embedding 接口，知识库请改用智谱 embedding-3、Jina 或 OpenAI。',
    vectorDbNotes: '对话可以用 DeepSeek，向量必须另配服务。pgvector 不接受“对话模型名”当 embedding 模型。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'both',
    baseURL: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/guides/embeddings',
    chatModels: ['gpt-4.1-mini', 'gpt-4o-mini'],
    embeddingModels: ['text-embedding-3-small', 'text-embedding-3-large'],
    embeddingNotes: '调用 /v1/embeddings。可选 dimensions，但本项目按接口实际返回值入库，不强制 1536/512。',
    vectorDbNotes: '换 embedding 模型等于换向量空间。旧资料需要重新向量化，否则语义检索会对不齐。',
  },
  {
    id: 'jina',
    name: 'Jina',
    kind: 'embedding',
    baseURL: 'https://api.jina.ai/v1',
    keyUrl: 'https://jina.ai/api-dashboard/',
    docsUrl: 'https://jina.ai/embeddings/',
    chatModels: [],
    embeddingModels: ['jina-embeddings-v3', 'jina-embeddings-v2-base-zh'],
    embeddingNotes: '只适合做向量，不适合当对话模型。中文检索可用 jina-embeddings-v3 或 v2-base-zh。',
    vectorDbNotes: 'Jina 与智谱/OpenAI 向量不兼容。pgvector 用 embedding_model + 维度隔离；切换后请重新上传资料。',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    kind: 'both',
    baseURL: 'https://api.siliconflow.cn/v1',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',
    chatModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    embeddingModels: ['BAAI/bge-m3', 'Qwen/Qwen3-Embedding-8B'],
    embeddingNotes: 'OpenAI 兼容。对话和向量可以同一 Key、不同模型名。请填写硅基控制台里的完整模型代码。',
    vectorDbNotes: 'bge-m3 常见 1024 维。不要把聊天模型名填进 Embedding 模型框。',
  },
];

export function matchProvider(baseURL: string): ModelProvider | undefined {
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return MODEL_PROVIDERS.find((provider) => {
      try {
        return new URL(provider.baseURL).hostname.toLowerCase() === host;
      } catch {
        return false;
      }
    });
  } catch {
    return undefined;
  }
}

export function embeddingRequirement(baseURL: string, model: string): string {
  if (model === 'local-hash-v1') {
    return '当前未连接 Embedding 服务，知识库只做严格关键词检索，不会把哈希向量当成语义证据。';
  }
  const provider = matchProvider(baseURL);
  if (provider) return `${provider.embeddingNotes} ${provider.vectorDbNotes}`;
  return '请使用 OpenAI 兼容的 /embeddings 接口。维度以服务商返回值为准，写入 pgvector 后同一知识库不要混用不同模型。';
}
