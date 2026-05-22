**语言：** [English](./README.md) · **简体中文** · [繁體中文](./README.zh-TW.md)

# USProGlove Marketing AI

Next.js + Drizzle（PostgreSQL with pgvector）+ Vercel AI Gateway。包含外联 campaign 管理后台、buy-side 采购流水线，以及带语义检索的内部知识库。

## 本地部署步骤

### 0. 前置依赖

- Node.js 20+（推荐用 `nvm`）
- `pnpm`（`npm i -g pnpm`）
- PostgreSQL 16+，**必须装 `pgvector` 扩展**（知识库依赖）
  - Neon / Supabase 这类托管 PG 已自带，开个项目即可
  - 本机自建：`CREATE EXTENSION IF NOT EXISTS vector;`

### 1. 克隆 & 安装

```bash
git clone https://github.com/Americium3/usproglove-marketing-ai.git
cd usproglove-marketing-ai
pnpm install
```

### 2. 配置环境变量

在仓库根目录创建 `.env.local`。完整 key 列表问账号所有者拿（涉及 Auth0 / Brevo / Hunter / Snov / Google Places / AI Gateway 等密钥）。至少要有：

```
DATABASE_URL=postgres://...           # 必须是支持 pgvector 的 PG
AI_GATEWAY_API_KEY=...                # Vercel AI Gateway，用于 embedding 和 LLM
AUTH0_SECRET=...
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
ADMIN_EMAILS=your@email.com           # 逗号分隔，决定谁能进 /dashboard
```

### 3. **迁移数据库**（首次部署 / schema 更新后必跑）

```bash
pnpm db:migrate
```

该命令读取 `.env.local` 里的 `DATABASE_URL`，依次执行 `drizzle/` 下的 SQL 迁移。如果是全新空库，会建出所有表（含 `knowledge_sources` / `knowledge_chunks` + HNSW 向量索引）。

**注意**：

- 如果 `pgvector` 扩展没装，迁移会在创建 `vector(1536)` 列时报错——先 `CREATE EXTENSION vector;`
- 改了 `src/lib/db/schema.ts` 之后要先 `pnpm db:generate` 生成新的迁移文件，再 `pnpm db:migrate` 应用
- 用 `pnpm db:studio` 可以打开图形化界面看表

### 4. 启动开发服务器

```bash
pnpm dev
```

打开 http://localhost:3000，用 `ADMIN_EMAILS` 里的邮箱登录 Auth0，进 `/dashboard`。

### 5. （可选）填测试数据

```bash
pnpm seed:campaign       # 一条示例营销 campaign
pnpm seed:buyside        # buy-side RFQ pipeline 示例
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | 由 schema 变更生成新迁移 SQL |
| `pnpm db:migrate` | 把迁移应用到数据库 |
| `pnpm db:push` | （慎用）直接 push schema 到 DB，跳过迁移文件 |
| `pnpm db:studio` | 打开 drizzle-kit 的可视化数据库工具 |

## 部署到 Vercel

- 仓库连到 Vercel，环境变量在 Vercel 项目设置里逐个配置（同 `.env.local`）
- 每次 push 自动构建
- 生产数据库的迁移：用 `pnpm db:migrate`（指向生产 `DATABASE_URL`）手动跑一次，或挂到 GitHub Actions
