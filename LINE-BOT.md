# LINE 查價機器人設定

## LINE 官方帳號

1. 建立或開啟 LINE 官方帳號。
2. 在 LINE Official Account Manager 啟用 Messaging API。
3. 在 LINE Developers Console 取得 Channel secret 與 Channel access token。
4. 先將官方帳號加為個人 LINE 好友。

## 取得管理者 LINE User ID

在 LINE Developers Console 開啟此 Messaging API channel，從 Basic settings
找到 `Your user ID`，將它設定為 `LINE_ALLOWED_USER_ID`。同一個 provider 下，
這個值與本人傳送訊息時 webhook 的 `source.userId` 相同。

## 設定 Secrets

先登入 Supabase CLI，將本機專案連結至指定的 Supabase project：

```bash
supabase login
supabase link --project-ref fuhzrbbyqoojjguiuijf
```

`supabase db push` 會套用至已 link 的 project。先用 dry run 檢視即將套用的
migration，確認內容後再正式套用：

```bash
supabase db push --dry-run
supabase db push
```

migration 必須先成功套用，LINE 查價功能才可正常使用。接著設定 Edge Function secrets：

建議到 Supabase Dashboard 的 Edge Function Secrets 管理頁，逐項輸入
`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_ALLOWED_USER_ID`
與 `PRICEBOOK_OWNER_ID`，避免真值留在 shell history。

以下 CLI 命令只以 placeholders 示意，不可將真值直接輸入共享終端或會保留
history 的終端：

```bash
supabase secrets set \
  LINE_CHANNEL_SECRET='...' \
  LINE_CHANNEL_ACCESS_TOKEN='...' \
  LINE_ALLOWED_USER_ID='U...' \
  PRICEBOOK_OWNER_ID='Supabase Auth UUID' \
  --project-ref fuhzrbbyqoojjguiuijf
```

也可以使用本機 env file。執行前必須確認 `.env.line-bot` 已被 `.gitignore`
忽略；檔案只存放於受信任的本機環境，使用完畢後必須安全刪除：

```bash
supabase secrets set \
  --env-file .env.line-bot \
  --project-ref fuhzrbbyqoojjguiuijf
```

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Edge Functions 預設提供。
所有 LINE secret、token、User ID、owner UUID 與 Supabase secret 都不得提交至
GitHub、寫回本文件或放入前端 JavaScript；尤其 `SUPABASE_SERVICE_ROLE_KEY`
絕不可暴露在前端。

## 部署

確認 migration 與 secrets 都已設定後，部署 Function：

```bash
supabase functions deploy line-price-query \
  --no-verify-jwt \
  --project-ref fuhzrbbyqoojjguiuijf
```

Webhook URL：

```text
https://fuhzrbbyqoojjguiuijf.supabase.co/functions/v1/line-price-query
```

將網址填入 LINE Developers Console，按 Verify。Verify 顯示成功後，同時開啟
Use webhook 與 Webhook redelivery；並關閉 LINE 官方帳號的預設自動回覆，
避免每次查價收到雙重回覆。

Webhook event 的 processing claim 租約為 5 分鐘；處理中斷後，LINE 重送可在
租約逾時後重新取得。completed event 保留 30 天，之後會在後續 claim 時自動清理。

免費訊息額度與限制以 LINE 官方帳號目前方案顯示的內容為準。

## 使用方式

```text
查價 長青商行 P-1001
```

名稱含空白時：

```text
查價 "Great North Co" "ABC 100"
```
