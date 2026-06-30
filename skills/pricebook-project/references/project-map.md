# Pricebook Project Map

## 中文總覽

這個專案是「產品售價管理」系統：

- 前端網頁部署在 GitHub Pages。
- iPhone/iPad 自用 App 使用 Capacitor 包裝同一份前端。
- 登入與資料庫使用 Supabase。
- 資料存在 `public.pricebook_data.payload`。
- LINE 官方帳號查價使用 Supabase Edge Function。
- Gemini/OpenAI 只負責把查價結果改寫成第二則 AI 回覆。

重要原則：

- GitHub 不存資料，只存程式碼。
- Supabase 才是產品、客戶、價格、AI 設定的資料來源。
- 不同 Supabase 帳號看到不同資料。
- LINE bot 目前讀取 `PRICEBOOK_OWNER_ID` 指定帳號的資料。
- AI 不可以接收整個資料庫，也不可以接收產品定價與價格日期。

## Files

- `index.html`: static app shell, dialogs, toolbar buttons, templates.
- `app.js`: frontend state, Supabase Auth, payload read/write,
  product/customer/timeline UI, Excel import/export, AI settings UI.
- `styles.css`: app layout and dialog styling.
- `supabase-config.js`: public Supabase URL/anon key for frontend. This can be
  public; RLS protects data.
- `supabase-schema.sql`: `pricebook_data` schema and RLS policies.
- `supabase/functions/line-price-query`: Supabase Edge Function for LINE
  webhook.
- `package.json`, `capacitor.config.json`, `scripts/build-capacitor.mjs`:
  Capacitor iOS native app wrapper setup.
- `ios/`: generated Xcode project for installing the app on iPhone/iPad.
- `NATIVE-APP.md`: native app setup, Xcode, CocoaPods, and device install notes.
- `LINE-BOT.md`: operator setup notes for LINE, Supabase secrets, and
  deployment.
- `DEPLOY.md`, `SUPABASE.md`: deployment and Supabase setup notes.

## Hosting And Services

- Frontend: GitHub Pages.
- Native shell: Capacitor iOS project in `ios/`, loading the GitHub Pages
  frontend through Capacitor `server.url` and using the same Supabase backend.
- Auth/database: Supabase.
- LINE webhook: Supabase Edge Function `line-price-query`.
- AI wording: Gemini via `GEMINI_API_KEY`, with OpenAI fallback if configured.
- Supabase project ref: `fuhzrbbyqoojjguiuijf`.
- LINE webhook URL:
  `https://fuhzrbbyqoojjguiuijf.supabase.co/functions/v1/line-price-query`.

## Data Shape

中文說明：`payload` 是前端整包存進 Supabase
的資料。它包含設定與產品清單。`settings.aiReplyInstructions` 是後台「AI
設定」文字框儲存的位置。`products[].updatedAt`
是近期異動使用的實際操作日期，不是價格生效日。

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

`updatedAt` is frontend operation time for `/changed` recent changes. Price
`date` is business effective date, not operation time.

## LINE Bot Behavior

中文流程：

1. 管理者用有權限的 LINE 帳號傳 `查價 客戶名稱 產品編號`。
2. LINE 送 webhook 到 Supabase Edge Function。
3. Function 驗證簽名和 userId 權限。
4. Function 讀取 `PRICEBOOK_OWNER_ID` 的 pricebook payload。
5. 先回固定格式查價結果。
6. 如果 Gemini/OpenAI key 有設定，再回第二則 AI 話術。
7. AI 回覆失敗時，不影響固定查價結果。

Command format:

```text
查價 客戶名稱 產品編號
```

The function:

1. Verifies LINE signature.
2. Requires user source type to be `user`.
3. Checks sender user ID against `LINE_ALLOWED_USER_ID` and comma-separated
   `LINE_ALLOWED_USER_IDS`.
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

Never commit or display service-role keys, LINE tokens, Gemini/OpenAI keys, or
private user IDs unless the user explicitly asks and it is safe.

## Known Decisions

- 中文決策：`近期異動` 目前看 `updatedAt`，也就是系統操作時間；`歷史紀錄`
  是搜尋時間軸文字，不等於近期異動。
- GitHub alone does not store app data; Supabase stores user data.
- Capacitor iOS App loads the live GitHub Pages URL so the App layout matches
  the web version. It still reads/writes Supabase cloud data.
- To update the installed iOS App after native setting changes, run
  `npm run cap:sync:ios` and install again from Xcode. Frontend-only changes
  usually update after GitHub Pages refreshes and the App is reopened.
- Generated native build outputs are ignored: `node_modules/`, `www/`,
  `ios/App/Pods/`, `ios/App/App/public/`.
- Different Supabase Auth accounts see different data via RLS.
- LINE bot reads one configured owner account, not the currently logged-in
  frontend user.
- AI reply is optional. If AI fails, the fixed reply remains.
- `AI 設定` in the frontend saves custom prompt text to
  `payload.settings.aiReplyInstructions`.
- `近期異動` uses product `updatedAt` from actual app operations, not price
  effective dates.
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

Build/sync Capacitor iOS:

```bash
npm run build
npm run cap:sync:ios
npm run cap:open:ios
```
