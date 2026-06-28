---
name: pricebook-project
description: Use when modifying, debugging, explaining, deploying, or reviewing the /Users/jimmy/Documents/peactice pricebook app: product/customer pricing UI, Supabase Auth/database payloads, GitHub Pages frontend deployment, Supabase Edge Function LINE price queries, Gemini/OpenAI AI reply wording, Excel import/export, timeline/recent-change behavior, and project-specific verification/commit steps.
---

# Pricebook Project

## Overview

Use this skill for work on the product price manager in `/Users/jimmy/Documents/peactice`. Keep changes scoped, preserve data isolation, and verify both the browser frontend and the LINE/Supabase function path when relevant.

For the detailed map of files, data shapes, secrets, and current design decisions, read `references/project-map.md`.

## Core Rules

- Treat `pricebook_data.payload` as the shared product data source.
- Preserve per-account isolation: frontend users read/write only their own Supabase Auth row; the LINE bot reads the configured `PRICEBOOK_OWNER_ID` row.
- Never put secrets in frontend code, docs, GitHub, or chat. Secrets live in Supabase Edge Function Secrets.
- Keep fixed deterministic LINE replies as the source of truth; AI replies are optional wording only.
- Do not send product base price, price dates, last update dates, or the full database to LLM providers.
- Use existing plain HTML/CSS/JS patterns unless a user explicitly requests a framework.
- Before editing, check for uncommitted user changes with `git status --short`.

## Common Workflows

### Frontend UI/Data Changes

1. Inspect `index.html`, `app.js`, and `styles.css`.
2. Keep the first screen as the usable app, not a landing page.
3. Store user-facing settings under `data.settings` inside `payload`.
4. Keep Excel import/export compatible with new fields when the field belongs to product data.
5. Verify at minimum:
   - `node --check app.js`
   - `deno fmt --check app.js index.html styles.css`
6. If the user wants the live GitHub Pages site updated, commit and push after verification.

### Supabase/LINE Function Changes

1. Inspect `supabase/functions/line-price-query`.
2. Add or update Deno tests first for behavior changes.
3. Keep LINE signature verification, allowed user ID checks, and webhook event claim/release logic intact.
4. Verify:
   - `deno fmt --check supabase/functions/line-price-query`
   - `deno lint supabase/functions/line-price-query`
   - `deno check supabase/functions/line-price-query/index.ts`
   - `deno test --allow-read supabase/functions/line-price-query`
5. Deploy only when requested or when the task clearly requires the live LINE bot to update:
   - `npx --yes supabase@2.108.0 functions deploy line-price-query --no-verify-jwt --project-ref fuhzrbbyqoojjguiuijf`

### AI Reply Changes

1. Edit `supabase/functions/line-price-query/personal_reply.ts`.
2. Preserve `DEFAULT_AI_REPLY_INSTRUCTIONS` unless the user asks to change the default.
3. Preserve the payload minimization rule: send only customer, product SKU/name, customer price, and note.
4. If adding backend-configurable style, store it at `payload.settings.aiReplyInstructions`.
5. Test with `personal_reply_test.ts` and `index_test.ts`.

### GitHub Pages Updates

1. Frontend changes require commit and push to `master`.
2. GitHub Pages may take a short time to refresh.
3. Do not push unrelated changes. Stage explicit files only.

## Existing Verification Baseline

Use the narrowest verification that matches the risk. For broad changes, run:

```bash
node --check app.js
deno fmt --check app.js index.html styles.css supabase/functions/line-price-query LINE-BOT.md supabase-schema.sql
deno lint supabase/functions/line-price-query
deno check supabase/functions/line-price-query/index.ts
deno test --allow-read supabase/functions/line-price-query
```

Do not claim completion until fresh verification output has been read.
