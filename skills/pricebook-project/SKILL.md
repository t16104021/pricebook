---
name: pricebook-project
description: "Use when modifying, debugging, explaining, deploying, or reviewing the /Users/jimmy/Documents/peactice pricebook app: product/customer pricing UI, Supabase Auth/database payloads, GitHub Pages frontend deployment, Capacitor iOS native app packaging, Supabase Edge Function LINE price queries, Gemini/OpenAI AI reply wording, Excel import/export, timeline/recent-change behavior, and project-specific verification/commit steps."
---

# Pricebook Project

## 中文說明

這個 Skill
是給「產品售價管理」專案使用的專屬開發指南。當工作內容跟前端後台、Supabase
資料庫、LINE 查價機器人、Gemini/OpenAI AI 回覆、Excel
匯入匯出、近期異動或歷史紀錄有關時，優先使用這份 Skill。

目標是讓後續開發保持一致：

- 改前端時知道要看 `index.html`、`app.js`、`styles.css`。
- 改 LINE 查價時知道要看 `supabase/functions/line-price-query`。
- 改 iPhone/iPad App 包裝時知道要看
  `capacitor.config.json`、`NATIVE-APP.md`、`ios/`。
- 不把任何 secret、token、API key 寫進 GitHub 或前端。
- AI 回覆只能做文字表達，不可以成為價格資料來源。
- 修改後要跑對應驗證，必要時再部署 Supabase Function 或推送 GitHub Pages。

## Overview

Use this skill for work on the product price manager in
`/Users/jimmy/Documents/peactice`. Keep changes scoped, preserve data isolation,
and verify both the browser frontend and the LINE/Supabase function path when
relevant.

For the detailed map of files, data shapes, secrets, and current design
decisions, read `references/project-map.md`.

## Core Rules

- 中文重點：這個專案的資料核心是 Supabase 的
  `pricebook_data.payload`。前端登入帳號只看自己的資料；LINE bot 則讀取
  `PRICEBOOK_OWNER_ID` 指定的資料列。
- Treat `pricebook_data.payload` as the shared product data source.
- Preserve per-account isolation: frontend users read/write only their own
  Supabase Auth row; the LINE bot reads the configured `PRICEBOOK_OWNER_ID` row.
- Never put secrets in frontend code, docs, GitHub, or chat. Secrets live in
  Supabase Edge Function Secrets.
- Keep fixed deterministic LINE replies as the source of truth; AI replies are
  optional wording only.
- Do not send product base price, price dates, last update dates, or the full
  database to LLM providers.
- Use existing plain HTML/CSS/JS patterns unless a user explicitly requests a
  framework.
- Before editing, check for uncommitted user changes with `git status --short`.

## Common Workflows

### Frontend UI/Data Changes

中文流程：

1. 先看 `index.html`、`app.js`、`styles.css`。
2. 新的使用者設定要放在 `data.settings`，跟著 payload 存進 Supabase。
3. 如果新增產品資料欄位，要確認 Excel 匯入/匯出是否也需要同步。
4. 前端改完至少跑 `node --check app.js` 和格式檢查。
5. 要更新正式網頁時，commit 後 push 到 GitHub。

- Inspect `index.html`, `app.js`, and `styles.css`.
- Keep the first screen as the usable app, not a landing page.
- Store user-facing settings under `data.settings` inside `payload`.
- Keep Excel import/export compatible with new fields when the field belongs to
  product data.
- Verify at minimum:
  - `node --check app.js`
  - `deno fmt --check app.js index.html styles.css`
- If the user wants the live GitHub Pages site updated, commit and push after
  verification.

### Supabase/LINE Function Changes

中文流程：

1. 先看 `supabase/functions/line-price-query`。
2. 行為改動要先補或更新 Deno test。
3. 不要破壞 LINE signature 驗證、允許 userId 檢查、webhook 去重 claim/release。
4. LINE 查價的固定格式回覆是主資料來源；AI 第二則只是話術。
5. 要讓正式 LINE bot 更新時，部署 Supabase Edge Function。

- Inspect `supabase/functions/line-price-query`.
- Add or update Deno tests first for behavior changes.
- Keep LINE signature verification, allowed user ID checks, and webhook event
  claim/release logic intact.
- Verify:
  - `deno fmt --check supabase/functions/line-price-query`
  - `deno lint supabase/functions/line-price-query`
  - `deno check supabase/functions/line-price-query/index.ts`
  - `deno test --allow-read supabase/functions/line-price-query`
- Deploy only when requested or when the task clearly requires the live LINE bot
  to update:
  - `npx --yes supabase@2.108.0 functions deploy line-price-query --no-verify-jwt --project-ref fuhzrbbyqoojjguiuijf`

### AI Reply Changes

中文規則：

1. 預設 prompt 在 `DEFAULT_AI_REPLY_INSTRUCTIONS`。
2. 後台自訂 prompt 存在 `payload.settings.aiReplyInstructions`。
3. 給 LLM 的資料只能包含客戶名稱、產品編號、產品名稱、客戶售價、備註。
4. 不可以把產品定價、日期、最後更新日、整個資料庫傳給 LLM。
5. AI 失敗時，系統仍要保留固定查價回覆。

- Edit `supabase/functions/line-price-query/personal_reply.ts`.
- Preserve `DEFAULT_AI_REPLY_INSTRUCTIONS` unless the user asks to change the
  default.
- Preserve the payload minimization rule: send only customer, product SKU/name,
  customer price, and note.
- If adding backend-configurable style, store it at
  `payload.settings.aiReplyInstructions`.
- Test with `personal_reply_test.ts` and `index_test.ts`.

### GitHub Pages Updates

1. Frontend changes require commit and push to `master`.
2. GitHub Pages may take a short time to refresh.
3. Do not push unrelated changes. Stage explicit files only.

### Capacitor iOS App

中文流程：

1. iOS App 是 Capacitor 包裝現有靜態前端，不是另一套資料庫。
2. App 仍使用 Supabase Auth/database 與既有 Edge Functions。
3. App 目前透過 `capacitor.config.json` 的 `server.url` 載入 GitHub Pages
   正式網址，讓 App 畫面與網頁版一致。
4. 前端改完並推送到 GitHub Pages 後，通常重新打開 App 就會看到新 UI；若改 native
   設定才需要 `npm run cap:sync:ios` 後用 Xcode Run 安裝。
5. `ios/App/Pods/`、`ios/App/App/public/`、`www/`、`node_modules/`
   是產生物，不要提交。
6. Xcode Team 設定會寫入 `ios/App/App.xcodeproj/project.pbxproj`；若使用者已選
   Team，可以提交。

- Inspect `NATIVE-APP.md`, `capacitor.config.json`, `package.json`,
  `scripts/build-capacitor.mjs`, and `ios/`.
- Build web assets with:
  - `npm run build`
- Sync iOS after frontend changes:
  - `npm run cap:sync:ios`
- Open Xcode:
  - `npm run cap:open:ios`
- For device install, make sure iPhone/iPad Developer Mode is enabled and Xcode
  Signing & Capabilities has a Team selected.

## Existing Verification Baseline

Use the narrowest verification that matches the risk. For broad changes, run:

```bash
node --check app.js
npm run build
deno fmt --check app.js index.html styles.css supabase/functions/line-price-query LINE-BOT.md supabase-schema.sql
deno lint supabase/functions/line-price-query
deno check supabase/functions/line-price-query/index.ts
deno test --allow-read supabase/functions/line-price-query
```

Do not claim completion until fresh verification output has been read.
