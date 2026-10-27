# 生产部署与长期存储

## 是否需要购买云服务器

不需要。当前阶段推荐使用托管服务：

- Render：运行 Next.js Docker 应用
- Supabase：Auth、PostgreSQL、pgvector、私有 Storage 和数据库备份
- OpenAI 兼容服务：可选的报告生成与 Embedding

这种方式不需要维护 Linux、数据库升级、防火墙和磁盘备份。只有在访问量明显增大、需要中国大陆网络优化或有合规要求时，再考虑腾讯云、阿里云或 AWS 自建服务。

Render 免费 Web Service 不会因为 30 天自动删除，但会在空闲后休眠。30 天限制来自免费 Render PostgreSQL。重要资料不应继续保存在免费 Render 数据库中。

## 一、创建 Supabase

1. 在 Supabase 创建项目。数据库区域尽量选择靠近 Render 服务的区域。
2. 长期保存重要资料时选择付费方案，并确认数据库备份策略。
3. 打开 **SQL Editor**，执行 `supabase/migrations/202610270001_research_platform.sql`。
4. SQL 会创建用户资料、工作空间、成员、文档、向量片段、研究历史、成品文件、RLS 策略和私有 `research-files` Bucket。
5. 在 **Authentication > URL Configuration** 中设置：

```text
Site URL: https://research-copilot-lnry.onrender.com
Redirect URLs:
https://research-copilot-lnry.onrender.com/auth/callback
http://localhost:3000/auth/callback
```

6. 邮箱登录默认可用。若要启用 GitHub 登录，在 Supabase Auth Providers 中配置 GitHub OAuth，并将 `NEXT_PUBLIC_GITHUB_AUTH_ENABLED` 设置为 `true`。

## 二、获取 Supabase 配置

从 **Project Settings > API** 获取：

- Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
- Anon/Publishable Key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service Role Key -> `SUPABASE_SERVICE_ROLE_KEY`

从 **Connect > Connection string** 获取 Supavisor Pooler 连接字符串：

- Transaction 或 Session Pooler -> `SUPABASE_DATABASE_URL`

不要使用只支持 IPv6、而 Render 无法连接的 Direct Connection。数据库密码中的特殊字符必须进行 URL 编码。

`SUPABASE_SERVICE_ROLE_KEY` 和 `SUPABASE_DATABASE_URL` 都是高权限秘密，只能放在 Render Environment，不能提交到 GitHub，也不能加 `NEXT_PUBLIC_` 前缀。

## 三、配置 Render

打开 Render 的 `research-copilot` Web Service，进入 **Environment**，填写：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的-anon-key
SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key
SUPABASE_DATABASE_URL=postgresql://...
NEXT_PUBLIC_GITHUB_AUTH_ENABLED=false

DAILY_RESEARCH_LIMIT=20
WORKSPACE_STORAGE_LIMIT_MB=250
```

四个 Supabase 核心变量必须一起填写。保存后选择 **Manual Deploy > Deploy latest commit**。本项目会在服务端运行时读取公开配置，再安全地传给登录界面；高权限 Key 不会下发到浏览器。

部署完成后访问：

```text
https://research-copilot-lnry.onrender.com/api/health
```

应返回包含以下字段的 JSON：

```json
{"status":"ok","mode":"cloud","storage":"pgvector"}
```

确认新用户可以注册、上传、刷新后仍能看到资料和研究历史，再删除或等待旧 Render 免费数据库到期。

## 四、配置 AI

应用不配置模型也能运行，但使用本地规则生成报告和本地哈希向量。生产环境建议在 Render Environment 填写：

```dotenv
OPENAI_API_KEY=你的服务端密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=384
```

注意：

- Key 只保存在 Render，不写入 GitHub、浏览器或数据库。
- 启用真实 Embedding 后，应重新上传使用本地哈希向量处理过的资料。系统会忽略模型不一致的旧向量，避免混用两种向量空间。
- 更换 Embedding 模型或维度必须重新向量化已有资料。
- Embedding 调用失败时，上传会直接报错而不会写入低质量回退向量；报告生成失败时仍会使用本地生成器完成任务。
- 通过 `DAILY_RESEARCH_LIMIT` 限制每名用户每天的研究次数，防止公开站点产生失控费用。
- `WORKSPACE_STORAGE_LIMIT_MB` 同时统计原始资料和已归档的 Markdown/PPTX。

OpenAI 官方快速入门：https://developers.openai.com/api/docs/quickstart

## 五、长期备份

“付费数据库”不等于“永远不会丢数据”。重要资料建议：

1. 使用 Supabase 的数据库自动备份。
2. 每周额外执行一次 `pg_dump`，保存到不同供应商的对象存储。
3. 定期导出 `research-files` Bucket 到 Cloudflare R2、S3 或本地加密磁盘。
4. 每月至少做一次恢复测试，而不是只检查备份文件是否存在。
5. Service Role Key 泄露后立即轮换。

## 六、本地开发

只测试基础功能时：

```bash
cp .env.example .env.local
npm install
npm run dev
```

要在本地测试完整云端登录，把 Supabase 变量填入 `.env.local`，并确保 Supabase Redirect URLs 包含 `http://localhost:3000/auth/callback`。

Docker Compose 仍可用于完全本地的应用和 pgvector：

```bash
cp .env.docker.example .env
docker compose up --build -d
```

Compose 数据保存在 Docker volume `research_pgdata`，但兼容模式没有用户隔离，也不会保存原始文件。

## 上线检查

- 注册、登录、退出和密码重置可用
- 用户 A 无法看到用户 B 的文档和研究历史
- 上传后能下载原始文件，刷新页面后资料仍存在
- 研究完成后能从“研究历史”重新打开
- Markdown 和 PPTX 能生成并在私有 Storage 归档
- `/api/health` 返回 `mode: cloud`
- Render 和 Supabase 均配置预算或用量告警
- 数据库备份和对象存储备份已实际恢复验证
