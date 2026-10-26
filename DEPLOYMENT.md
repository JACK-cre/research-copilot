# 公网部署

## Render 一键部署

项目根目录的 `render.yaml` 会创建两个服务：

- `research-copilot`：Next.js 应用
- `research-copilot-db`：PostgreSQL 数据库，由应用自动启用 pgvector

部署步骤：

1. 登录 [Render](https://render.com)，选择 **New > Blueprint**。
2. 连接包含本项目的 GitHub 仓库。
3. Render 识别 `render.yaml` 后，确认创建 Web Service 和 PostgreSQL。
4. `OPENAI_API_KEY`、`OPENALEX_MAILTO` 和 `OPENALEX_API_KEY` 可以先留空。
5. 点击部署，等待健康检查通过。
6. 打开 Render 分配的 `https://...onrender.com` 地址。

未配置 `OPENAI_API_KEY` 时，论文检索、知识库、报告和 PPT 仍可使用，但报告由本地规则生成，向量检索使用本地哈希向量。

不要把 API Key 写入 `.env.example`、源代码或 GitHub 仓库。需要启用模型时，在 Render 的 **Environment** 页面单独填写。

## Docker Compose

其他人也可以在自己的电脑或服务器运行：

```bash
cp .env.docker.example .env
docker compose up --build -d
```

浏览器打开 `http://localhost:3000`。停止服务：

```bash
docker compose down
```

数据库保存在 Docker volume `research_pgdata`，重新构建应用不会清空知识库。

## 局域网访问

Docker 服务默认监听所有网络接口。同一局域网中的设备可访问：

```text
http://运行服务的电脑局域网IP:3000
```

该方式要求主机保持开机，也可能需要在系统防火墙中允许 3000 端口。

## 上线注意事项

- 当前知识库由所有访问者共享，不要上传私密材料。
- 公网正式使用前应增加登录、用户隔离和请求限流。
- 建议先不配置付费模型 Key，确认访问范围后再开启。
- 更换 Embedding 模型或维度后，需要重新生成已有知识库向量。
