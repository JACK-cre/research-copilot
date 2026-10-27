# Research Copilot

一个 TypeScript 研究工作台：输入主题与要求，通过 MCP 检索公开论文和本地知识库，生成带证据引用的调研稿、论文清单以及可下载的 PPTX。

## 当前能力

- 通过 OpenAlex 检索并筛选论文，服务不可用时自动使用示例语料
- 上传 PDF、Markdown、TXT，自动解析、切分并向量化
- 默认使用本地 JSON 向量存储，也可切换 PostgreSQL + pgvector
- Supabase 邮箱/GitHub 登录、私有工作空间和行级安全策略
- 原始资料、Markdown、PPTX 使用私有对象存储长期归档
- 研究任务、检索证据、报告和幻灯片大纲可持久化并从历史记录恢复
- 通过 MCP 工具执行论文检索、知识库检索和资料列表查询
- 生成结构化研究综述、证据引用、幻灯片大纲和讲稿
- 导出 Markdown 报告和真正的 `.pptx` 文件
- 未配置模型时使用确定性本地生成器，配置兼容 OpenAI 的接口后启用模型生成

## 启动

要求 Node.js 20 以上。

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。无需 API Key 即可运行；第一次可在“知识库”中上传 `examples/research-note.md`，然后执行默认研究主题。

## 让其他人直接访问

仓库包含 Render Blueprint 和完整 Docker 镜像配置。部署到 Render 后会获得可直接分享的 `https://...onrender.com` 公网地址，并自动连接云端 PostgreSQL + pgvector。

具体步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

Render 配置默认选择免费规格，适合演示。长期使用推荐让 Render 只运行应用，把认证、PostgreSQL、pgvector 和私有文件迁移到 Supabase Pro。完整步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 运行模式

- **兼容模式**：未填写完整 Supabase 配置时，保持原有单用户体验；本地使用 JSON 或 `DATABASE_URL`。
- **私有云模式**：同时配置 Supabase URL、Anon Key、Service Role Key 和数据库连接后，强制登录并启用工作空间隔离、原文件保存、研究历史和成品归档。

数据库结构和 RLS 策略位于 `supabase/migrations/202610270001_research_platform.sql`。

## 模型配置

在 `.env.local` 中填写：

```dotenv
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=384
```

`OPENAI_BASE_URL` 可指向兼容 OpenAI Chat Completions 和 Embeddings 的服务。报告生成失败时会回退到本地生成器；Embedding 失败时上传会停止并显示错误，避免把不同算法的向量混入同一知识库。

知识库检索只使用与当前 `EMBEDDING_MODEL` 和维度一致的资料。启用真实 Embedding 或更换模型后，请重新上传旧资料。

API Key 只允许放在服务端环境变量中，不要使用 `NEXT_PUBLIC_` 前缀。OpenAI API 计费与 ChatGPT 订阅相互独立，建议同时设置平台预算告警和应用内每日任务额度。

## 使用 pgvector

默认知识库保存在 `data/library.json`。本机同时启动应用和 pgvector：

```bash
cp .env.docker.example .env
docker compose up --build -d
```

首次读写时会自动创建 `vector` 扩展和数据表。切换嵌入维度后，需要重建已有向量表。

## MCP Server

独立启动 stdio MCP Server：

```bash
npm run mcp
```

提供三个工具：

- `search_papers`：检索 OpenAlex 论文
- `search_knowledge`：向量检索本地知识库
- `list_library`：列出已索引文档

Web 研究流程使用同一套 MCP Server，通过进程内 transport 调用，避免 MCP 只作为未接入的演示代码存在。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 目录

```text
src/app/api/           API 与文件导出
src/components/        研究工作台界面
src/lib/               检索、RAG、生成、PPT 渲染
src/mcp/               MCP Server 与 Client
src/types/             研究任务数据契约
examples/              可上传的示例知识资料
```

生成内容定位为有来源的研究草稿和汇报材料。方法、实验结果和关键引用应由使用者在正式发布前复核。
