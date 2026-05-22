**語言：** [English](./README.md) · [简体中文](./README.zh-CN.md) · **繁體中文**

# USProGlove Marketing AI

Next.js + Drizzle（PostgreSQL with pgvector）+ Vercel AI Gateway。包含外聯 campaign 管理後台、buy-side 採購流水線，以及帶語義檢索的內部知識庫。

## 本地部署步驟

### 0. 前置依賴

- Node.js 20+（推薦使用 `nvm`）
- `pnpm`（`npm i -g pnpm`）
- PostgreSQL 16+，**必須安裝 `pgvector` 擴充功能**（知識庫依賴）
  - Neon / Supabase 等託管 PG 已內建，開個專案即可
  - 本機自架：`CREATE EXTENSION IF NOT EXISTS vector;`

### 1. Clone & 安裝

```bash
git clone https://github.com/Americium3/usproglove-marketing-ai.git
cd usproglove-marketing-ai
pnpm install
```

### 2. 設定環境變數

在 repo 根目錄建立 `.env.local`。完整 key 清單向帳號所有者索取（涉及 Auth0 / Brevo / Hunter / Snov / Google Places / AI Gateway 等密鑰）。至少需要：

```
DATABASE_URL=postgres://...           # 必須是支援 pgvector 的 PG
AI_GATEWAY_API_KEY=...                # Vercel AI Gateway，用於 embedding 與 LLM
AUTH0_SECRET=...
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
ADMIN_EMAILS=your@email.com           # 逗號分隔，決定誰能進 /dashboard
```

### 3. **執行資料庫遷移**（首次部署 / schema 更新後必跑）

```bash
pnpm db:migrate
```

此指令會讀取 `.env.local` 內的 `DATABASE_URL`，依序執行 `drizzle/` 底下的 SQL migrations。若是全新空庫，會建立所有資料表（含 `knowledge_sources` / `knowledge_chunks` 加上 HNSW 向量索引）。

**注意**：

- 如果 `pgvector` 擴充功能未安裝，migration 在建立 `vector(1536)` 欄位時會失敗——請先執行 `CREATE EXTENSION vector;`
- 修改 `src/lib/db/schema.ts` 之後，先跑 `pnpm db:generate` 產出新的 migration 檔，再 `pnpm db:migrate` 套用
- `pnpm db:studio` 會開啟圖形化資料庫瀏覽工具

### 4. 啟動開發伺服器

```bash
pnpm dev
```

開啟 http://localhost:3000，使用 `ADMIN_EMAILS` 清單裡的信箱登入 Auth0，即可進入 `/dashboard`。

### 5. （可選）填入示範資料

```bash
pnpm seed:campaign       # 一筆示範外聯 campaign
pnpm seed:buyside        # buy-side RFQ pipeline 示範
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm build` | 正式建置 |
| `pnpm typecheck` | TypeScript 檢查 |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | 由 schema 變更產生新的 migration SQL |
| `pnpm db:migrate` | 將 migration 套用至資料庫 |
| `pnpm db:push` | （請謹慎使用）直接把 schema 推到資料庫，跳過 migration 檔 |
| `pnpm db:studio` | 開啟 drizzle-kit 的視覺化資料庫工具 |

## 部署到 Vercel

- 將 repo 連到 Vercel；在 Vercel 專案設定裡逐一設定環境變數（與 `.env.local` 對齊）
- 每次 push 會自動建置
- 正式資料庫的 migration：以 `pnpm db:migrate`（指向正式環境 `DATABASE_URL`）手動執行一次，或接到 GitHub Actions
