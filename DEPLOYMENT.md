# 生产部署与长期存储

本指南以“轻量应用服务器 + Docker Compose + Caddy”为正式部署方案。仓库中的 `render.yaml` 仅保留给临时预览；Render 免费 Web Service 会休眠，免费 PostgreSQL 有期限，本地文件系统也不能作为长期资料存储，因此不要把免费 Blueprint 当作生产环境。

## 部署后的用户体验

部署完成并绑定域名后，其他用户只需要打开 `https://你的域名`，在网页注册或登录即可使用。用户不需要 GitHub、Node.js、Docker、数据库，也不需要在自己的电脑执行任何代码。

当前生产结构：

```text
Internet
  -> Caddy :80/:443（自动 HTTPS、gzip/zstd、安全响应头）
  -> Next.js :3000（不直接暴露公网）
  -> PostgreSQL + pgvector（不暴露公网）
  -> 本地持久卷或 S3 兼容对象存储
```

项目已经不依赖 Supabase。账户、会话、工作空间、研究历史、向量、个人 Key 和模板都保存在自己的 PostgreSQL 中。

## 一、服务器选择

试运行推荐：

- 2 核 4 GB 内存
- 60 GB 以上 SSD
- Ubuntu 24.04 LTS
- 香港节点可以免备案快速上线
- 中国大陆节点访问更稳定，但域名通常需要完成 ICP 备案

把应用和 PostgreSQL 放在同一台机器时，正式使用建议 4 核 8 GB。不要开放 PostgreSQL 的 `5432` 端口。

## 二、服务器准备

安装 Docker Engine 和 Docker Compose Plugin，并在安全组中只放行：

```text
22/tcp   SSH，建议限制来源 IP
80/tcp   HTTP，证书签发和自动跳转
443/tcp  HTTPS
443/udp  HTTP/3，可选
```

克隆项目后，在仓库根目录创建 `.env.production`。至少填写：

```dotenv
SITE_ADDRESS=research.example.com
PUBLIC_APP_URL=https://research.example.com

POSTGRES_PASSWORD=高强度数据库密码
AUTH_SECRET=至少32位随机字符串
AI_KEY_ENCRYPTION_SECRET=另一条至少32位随机字符串

REGISTRATION_MODE=open
REGISTRATION_INVITE_CODE=

OBJECT_STORAGE_DRIVER=local

AI_ACCESS_MODE=hybrid
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=512

WORKSPACE_STORAGE_LIMIT_MB=4096
```

可以用以下命令生成随机密钥：

```bash
openssl rand -base64 48
```

`AUTH_SECRET` 更换后已有登录会话失效；`AI_KEY_ENCRYPTION_SECRET` 更换后已有个人 API Key 无法解密。这两个值都不能提交到 GitHub。

## 三、启动服务

在仓库根目录执行：

```bash
# 日常更新使用 deploy/update.sh；首次在性能足够的构建机上生成镜像。
docker compose \
  -f deploy/compose.production.yml \
  --env-file .env.production \
  up -d
```

应用容器每次启动都会运行 `scripts/migrate.mjs`，按文件名顺序执行 `database/migrations/` 中尚未运行的迁移。迁移成功后才会启动 Next.js。

检查状态：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production ps
curl -fsS https://research.example.com/api/health
```

健康接口应返回：

```json
{"status":"ok","mode":"cloud","storage":"pgvector"}
```

## 四、域名和 HTTPS

在域名服务商添加：

```text
A     research.example.com     服务器公网 IPv4
AAAA  research.example.com     服务器公网 IPv6（可选）
```

将 `SITE_ADDRESS` 和 `PUBLIC_APP_URL` 设置为同一个正式 HTTPS 域名。DNS 生效后，Caddy 会自动申请并续期证书。

使用大陆服务器时先完成备案；香港或海外服务器通常不需要 ICP 备案，但大陆访问质量取决于线路。

## 五、注册策略

公开测试：

```dotenv
REGISTRATION_MODE=open
```

内测邀请码：

```dotenv
REGISTRATION_MODE=invite
REGISTRATION_INVITE_CODE=你的邀请码
```

停止新增用户：

```dotenv
REGISTRATION_MODE=closed
```

登录和注册接口有数据库限流。公开注册仍建议在反向代理或云防火墙增加 IP 级限流和异常流量告警。

## 六、SMTP 密码重置

配置 SMTP 后，登录页会自动出现“忘记密码”：

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的SMTP账户
SMTP_PASSWORD=SMTP授权码
SMTP_FROM=Research Copilot <no-reply@example.com>
```

重置令牌只在数据库保存 HMAC，30 分钟失效，成功修改密码后会撤销该用户全部旧会话。未配置 SMTP 时，界面不会显示无效的重置入口。

## 七、对象存储

### 本地持久卷

```dotenv
OBJECT_STORAGE_DRIVER=local
```

文件保存在 Docker volume `research_appdata`。适合内测，但必须同时备份该 volume。

### COS、OSS、MinIO 或其他 S3 兼容服务

```dotenv
OBJECT_STORAGE_DRIVER=s3
S3_ENDPOINT=https://你的对象存储端点
S3_REGION=地域标识
S3_BUCKET=research-files
S3_ACCESS_KEY_ID=访问密钥
S3_SECRET_ACCESS_KEY=访问密钥秘密
S3_FORCE_PATH_STYLE=false
```

Bucket 必须保持私有。应用上传后只保存对象 Key，下载时生成 60 秒有效的签名 URL。不同服务商对 Endpoint、Region 和 Path Style 的要求不同，以对应服务商当前文档为准。

## 八、AI 配置与费用

- `AI_ACCESS_MODE=hybrid`：个人 Key 优先，没有个人 Key 时使用平台 Key。
- `AI_ACCESS_MODE=byok`：只允许用户自己的 Key，适合控制平台费用。
- `AI_ACCESS_MODE=platform`：所有用户使用部署者的 Key。

个人 Key 使用 AES-256-GCM 加密，永远不会返回浏览器。生产环境中的用户 Base URL 只允许公网 HTTPS 地址。

当前不限制研究任务次数；平台 Key 模式仍建议监控实际调用量。

## 九、日志和监控

查看应用日志：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production logs -f app
```

查看网关或数据库日志：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production logs -f caddy postgres
```

Compose 已把单个日志文件限制为 10 MB，最多保留 5 个。正式运行建议再接入：

- Sentry：前后端异常和性能
- 云监控：CPU、内存、磁盘、网络和告警
- Loki 或云日志服务：集中检索日志
- Uptime Kuma 或云拨测：定时检查 `/api/health`

## 十、数据库和文件备份

数据库备份示例：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production \
  exec -T postgres pg_dump -U research -d research -Fc > research.dump
```

至少执行：

1. 每日数据库备份到另一块磁盘或对象存储。
2. 每日同步本地文件 volume，或者直接使用带版本控制的对象存储。
3. 每月进行一次实际恢复测试。
4. 监控服务器磁盘余量和数据库连接数。

仅有备份文件但从未恢复验证，不能视为完成备份。

## 十一、更新和回滚

2 GB 轻量服务器不要在机器上执行 `next build` / `docker compose up --build`。GitHub Actions 会在推送到 `main` 后编译 `linux/amd64` 镜像，并发布到 Release `image-latest`。服务器只下载镜像并替换 `app` 容器，通常 1～3 分钟。

首次启用：

1. 打开仓库 Actions，确认 `Build production image` 成功。
2. 打开 https://github.com/JACK-cre/research-copilot/releases/tag/image-latest ，能看到 `research-copilot.tar.gz`。
3. 若使用 GHCR 拉取，把 Package `research-copilot` 设为 Public。国内服务器优先走下面的下载脚本，不必登录 GHCR。

日常更新：

```bash
cd /opt/apps/research-copilot
bash deploy/update.sh
```

脚本会 `git pull` 部署文件，下载预编译镜像，`docker load`，然后只重启 `app`。Postgres 和 Caddy 保持运行。不要执行 `docker compose down`。

检查：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production ps
curl -fsS http://127.0.0.1/api/health
```

应急才在服务器上构建（2 GB 机器可能要 20 分钟以上，也可能因 swap 卡住）：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production build --pull never app
docker compose -f deploy/compose.production.yml --env-file .env.production up -d --no-deps --pull never app worker
```

发布前记录当前 Git 提交。回滚时下载上一版镜像或切换到上一个已验证提交后重新发布 Actions。数据库迁移默认只向前执行，因此破坏性数据库变更需要单独设计回滚脚本。

## 十二、压测

建议从另一台机器使用 k6 或 Artillery，不要在应用服务器本机压测。分开测试：

- 登录、历史记录和模板等普通 API
- pgvector 与关键词混合检索
- PDF 上传和解析
- Markdown/PPTX 导出
- 模拟 AI 响应的研究任务
- 少量真实 AI 请求的端到端延迟

大量真实模型请求会产生费用，也会把第三方模型限流误判成自己的服务器瓶颈。重点观察 P50/P95/P99、错误率、CPU、内存、数据库连接和磁盘 IO。

## 上线检查

- 新用户通过浏览器完成注册、登录和退出
- 用户 A 无法读取用户 B 的资料、版本、模板和个人 Key
- 上传文件后刷新页面仍存在，并且可以下载
- V2 生成后仍可从历史打开 V1
- Markdown 和 PPTX 可以归档和再次下载
- 密码重置邮件中的链接使用正式 HTTPS 域名
- `/api/health` 返回 `mode: cloud`
- PostgreSQL 和对象存储没有开放公共读写
- 日志中没有密码、个人 API Key 或数据库连接串
- 数据库和文件备份完成过实际恢复验证

## 自动备份与恢复

仓库提供：

- `scripts/backup.sh`：备份 PostgreSQL、`/app/data` 和 `.env.production`
- `scripts/restore.sh`：恢复数据库和上传文件
- `deploy/research-copilot-backup.service`
- `deploy/research-copilot-backup.timer`

在服务器安装每日备份：

```bash
sudo cp deploy/research-copilot-backup.service /etc/systemd/system/
sudo cp deploy/research-copilot-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now research-copilot-backup.timer
systemctl list-timers | grep research-copilot
```

手动验证一次：

```bash
cd /opt/apps/research-copilot
sudo bash scripts/backup.sh
ls -lh backups/
```

备份默认保留 14 天，可以通过 `RETENTION_DAYS=30` 调整。
`env-*.backup` 包含密钥，必须限制文件权限并放到加密或受控的备份存储中。

恢复前会要求输入 `RESTORE` 确认，执行：

```bash
cd /opt/apps/research-copilot
sudo bash scripts/restore.sh backups/research-YYYYMMDD-HHMMSS.dump backups/data-YYYYMMDD-HHMMSS.tar.gz
```


## 后台任务与监控

生产环境包含三个应用进程：

- `app`：Next.js Web 和 API
- `worker`：知识库文件解析、OCR、Embedding
- `research-worker`：论文/PPT 研究任务和版本修订

查看全部状态：

```bash
cd /opt/apps/research-copilot
docker compose -f deploy/compose.production.yml --env-file .env.production ps
```

查看各 worker 日志：

```bash
docker compose -f deploy/compose.production.yml --env-file .env.production logs -f worker
docker compose -f deploy/compose.production.yml --env-file .env.production logs -f research-worker
```

健康检查与日志摘要：

```bash
bash scripts/monitor.sh
```

或单独检查：

```bash
curl -sS http://127.0.0.1/api/health
```

返回中的 `queue` 包含知识库队列和研究队列状态。
`degraded: true` 表示有任务正在执行，但对应 worker 心跳超过 2 分钟未更新，应检查 worker 日志。

结构化日志采用单行 JSON，包含 `requestId`、`runId`、`jobId`、`userId`、`workspaceId`，可直接用 `docker logs` 或日志服务检索。
