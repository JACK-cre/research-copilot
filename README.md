# Research Copilot

一个 TypeScript 研究工作台：输入主题与要求，通过 MCP 检索论文、图书、网页和个人知识库，生成带证据引用的研究稿、来源清单以及可下载的 PPTX。

## 当前能力

- OpenAlex、Crossref、Google Books、Internet Archive 与 Wikipedia 多源检索
- 关键词预筛与对话模型重排，使用真实相关性分数并丢弃无关结果
- PDF、Markdown、TXT 解析、切分与向量化
- 在知识库中展开查看文档的关键索引证据段落
- PostgreSQL + pgvector 语义召回、关键词召回和融合排序
- 自有邮箱密码账户、HttpOnly 数据库会话和私有工作空间
- 本地持久卷或 S3 兼容对象存储，可连接 COS、OSS、MinIO、R2 和 S3
- 研究任务、证据、报告、PPT 和导出文件持久化
- 通过补充要求生成 V2、V3，并保留每一个旧版本
- 内置学术论文、毕业论文、技术报告和答辩模板
- 上传 DOCX/PDF 或直接描述要求，自动提炼可编辑的输出模板
- 自定义模板跨会话保存，支持点击进入可视化编辑
- 支持不选择模板，直接按照任务要求自动规划输出结构
- 用户可加密保存自己的 OpenAI 兼容 API Key
- 导出 Markdown 和真正的 `.pptx` 文件
- 可选 SMTP 密码重置、开放注册、邀请码注册或关闭注册

## 本地启动

要求 Node.js 22 以上。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。没有数据库时运行兼容模式，适合查看界面和基础研究流程。

完整多用户模式使用 Docker：

```bash
cp .env.docker.example .env
docker compose up --build -d
```

容器启动时会自动执行 `database/migrations/`。配置 `DATABASE_URL` 和至少 32 位的 `AUTH_SECRET` 后，用户可以直接在网页注册、登录和使用，不需要在自己的电脑运行代码。

## 部署给其他人使用

生产部署文件位于 `deploy/`：

- Caddy 自动申请和续期 HTTPS 证书
- Next.js Node 22 容器
- PostgreSQL 17 + pgvector
- 数据库、上传文件和证书持久卷
- 容器健康检查和日志轮转

部署后，其他用户的使用流程只有：

```text
打开域名 -> 注册/登录 -> 上传资料 -> 开始研究 -> 导出论文或 PPT
```

服务器、防火墙、域名、对象存储、备份和日志步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 运行模式

- **兼容模式**：没有 `DATABASE_URL` 或 `AUTH_SECRET`，单用户本地演示，不保存账户和研究历史。
- **托管模式**：配置数据库和认证密钥，启用账户、工作空间隔离、长期文件、研究历史、模板、版本和个人 Key。

数据库结构位于 `database/migrations/`，Docker 镜像每次启动都会幂等执行未运行的迁移。

## 注册与密码重置

```dotenv
DATABASE_URL=postgresql://...
AUTH_SECRET=至少32位随机字符串
REGISTRATION_MODE=open
REGISTRATION_INVITE_CODE=
```

`REGISTRATION_MODE` 支持：

- `open`：任何人都可以注册
- `invite`：必须填写 `REGISTRATION_INVITE_CODE`
- `closed`：只允许已有账户登录

配置 SMTP 后登录页自动显示“忘记密码”：

```dotenv
PUBLIC_APP_URL=https://research.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Research Copilot <no-reply@example.com>
```

## 文件存储

本地持久卷：

```dotenv
OBJECT_STORAGE_DRIVER=local
DATA_DIRECTORY=/app/data
```

S3 兼容存储：

```dotenv
OBJECT_STORAGE_DRIVER=s3
S3_ENDPOINT=https://...
S3_REGION=...
S3_BUCKET=research-files
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

对象始终使用工作空间 ID 作为路径前缀，下载前会再次校验当前登录用户的工作空间。

## 模型配置

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=384
AI_ACCESS_MODE=hybrid
AI_KEY_ENCRYPTION_SECRET=至少32位随机字符串
```

- `hybrid`：个人 Key 优先，未配置时使用平台 Key
- `byok`：只使用用户个人 Key
- `platform`：统一使用平台 Key

个人 Key 使用 AES-256-GCM 加密，`AI_KEY_ENCRYPTION_SECRET` 投产后不能随意更换。更换 Embedding 模型后需要重新上传和向量化旧资料。

对话模型与 Embedding 可以使用不同服务商。例如对话使用 DeepSeek，中文向量使用支持 OpenAI Embeddings 协议且可输出 384 维的 `jina-embeddings-v3`。如果不配置 Embedding 服务，知识库会退化为严格关键词检索，不再把哈希碰撞当成语义证据。

## MCP Server

```bash
npm run mcp
```

提供 `search_sources`、`search_papers`、`search_knowledge` 和 `list_library` 等工具。Web 研究流程通过进程内 MCP transport 使用同一套工具。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 目录

```text
database/migrations/   普通 PostgreSQL + pgvector 迁移
deploy/                Caddy 与生产 Docker Compose
scripts/               数据库迁移脚本
src/app/api/           认证、研究、知识库与导出 API
src/components/        登录和研究工作台界面
src/lib/               认证、存储、检索、RAG 与生成逻辑
src/mcp/               MCP Server 与 Client
examples/              可上传的示例资料
```

生成内容定位为有来源的研究草稿和汇报材料。方法、实验结果和关键引用应由使用者在正式发布前复核。
