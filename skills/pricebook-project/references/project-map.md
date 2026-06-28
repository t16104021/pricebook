# Pricebook Project Map

## Files

- `index.html`: static app shell, dialogs, toolbar buttons, templates.
- `app.js`: frontend state, Supabase Auth, payload read/write, product/customer/timeline UI, Excel import/export, AI settings UI.
- `styles.css`: app layout and dialog styling.
- `supabase-config.js`: public Supabase URL/anon key for frontend. This can be public; RLS protects data.
- `supabase-schema.sql`: `pricebook_data` schema and RLS policies.
- `supabase/functions/line-price-query`: Supabase Edge Function for LINE webhook.
- `LINE-BOT.md`: operator setup notes for LINE, Supabase secrets, and deployment.
- `DEPLOY.md`, `SUPABASE.md`: deployment and Supabase setup notes.

## Hosting And Services

- Frontend: GitHub Pages.
- Auth/database: Supabase.
- LINE webhook: Supabase Edge Function `line-price-query`.
- AI wording: Gemini via `GEMINI_API_KEY`, with OpenAI fallback if configured.
- Supabase project ref: `fuhzrbbyqoojjguiuijf`.
- LINE webhook URL: `https://fuhzrbbyqoojjguiuijf.supabase.co/functions/v1/line-price-query`.

## Data Shape

Main table: `public.pricebook_data`

One row per app user:

```json
{
  "id": "Supabase Auth user UUID",
  "payload": {
    "settings": {
      "aiReplyInstructions": "optional custom prompt"
    },
    "products": [
      {
        "id": "p-...",
        "sku": "ABC-100",
        "name": "Product name",
        "category": "Category",
        "updatedAt": "YYYY-MM-DD",
        "basePrices": [{ "price": 1200, "date": "YYYY-MM-DD", "note": "..." }],
        "sales": [
          {
            "customer": "Customer name",
            "prices": [{ "price": 980, "date": "YYYY-MM-DD", "note": "..." }]
          }
        ]
      }
    ]
  }
}
```

`updatedAt` is frontend operation time for `/changed` recent changes. Price `date` is business effective date, not operation time.

## LINE Bot Behavior

Command format:

```text
查價 客戶名稱 產品編號
```

The function:

1. Verifies LINE signature.
2. Requires user source type to be `user`.
3. Checks sender user ID against `LINE_ALLOWED_USER_ID` and comma-separated `LINE_ALLOWED_USER_IDS`.
4. Claims webhook event to avoid duplicate processing.
5. Reads `PRICEBOOK_OWNER_ID` row from `pricebook_data`.
6. Sends fixed reply first.
7. If found and an AI provider key exists, sends a second AI wording reply.

AI context must only include:

- customer
- product SKU
- product name
- customer price
- note

Do not include:

- product base price
- base price date
- customer sale date
- last update date
- entire payload/database

## Secrets

Supabase Edge Function Secrets may include:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_ALLOWED_USER_ID`
- `LINE_ALLOWED_USER_IDS`
- `PRICEBOOK_OWNER_ID`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Never commit or display service-role keys, LINE tokens, Gemini/OpenAI keys, or private user IDs unless the user explicitly asks and it is safe.

## Known Decisions

- GitHub alone does not store app data; Supabase stores user data.
- Different Supabase Auth accounts see different data via RLS.
- LINE bot reads one configured owner account, not the currently logged-in frontend user.
- AI reply is optional. If AI fails, the fixed reply remains.
- `AI 設定` in the frontend saves custom prompt text to `payload.settings.aiReplyInstructions`.
- `近期異動` uses product `updatedAt` from actual app operations, not price effective dates.
- `歷史紀錄` searches timeline text: date, label/customer, note, price.

## Deployment Commands

Deploy Supabase function:

```bash
npx --yes supabase@2.108.0 functions deploy line-price-query --no-verify-jwt --project-ref fuhzrbbyqoojjguiuijf
```

Update GitHub Pages:

```bash
git add <explicit files>
git commit -m "<message>"
git push
```
