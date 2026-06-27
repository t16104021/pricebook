# LINE 查價機器人設定

## LINE 官方帳號

1. 建立或開啟 LINE 官方帳號。
2. 在 LINE Official Account Manager 啟用 Messaging API。
3. 在 LINE Developers Console 取得 Channel secret 與 Channel access token。
4. 先將官方帳號加為個人 LINE 好友。

## 取得管理者 LINE User ID

部署 Function 並暫時查看 Edge Function logs。從本人傳送一則測試訊息後，
讀取 webhook 的 `source.userId`，將它設定為 `LINE_ALLOWED_USER_ID`。
正式完成後，log 不得輸出完整訊息內容、access token 或 customer price data。

## 設定 Secrets

先登入 Supabase CLI，並將本功能需要的 migration 套用至指定專案：

```bash
supabase db push --project-ref fuhzrbbyqoojjguiuijf
```

migration 必須先成功套用，LINE 查價功能才可正常使用。接著設定 Edge Function secrets：

```bash
supabase secrets set \
  LINE_CHANNEL_SECRET='...' \
  LINE_CHANNEL_ACCESS_TOKEN='...' \
  LINE_ALLOWED_USER_ID='U...' \
  PRICEBOOK_OWNER_ID='Supabase Auth UUID' \
  --project-ref fuhzrbbyqoojjguiuijf
```

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Edge Functions 預設提供。
這兩個值不得寫入 GitHub、前端 JavaScript 或本文件；尤其
`SUPABASE_SERVICE_ROLE_KEY` 絕不可暴露在前端。

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

將網址填入 LINE Developers Console，按 Verify。Verify 顯示成功後，開啟
Use webhook；同時關閉 LINE 官方帳號的預設自動回覆，避免每次查價收到雙重回覆。

免費訊息額度與限制以 LINE 官方帳號目前方案顯示的內容為準。

## 使用方式

```text
查價 長青商行 P-1001
```

名稱含空白時：

```text
查價 "Great North Co" "ABC 100"
```
