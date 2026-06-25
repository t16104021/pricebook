# 產品售價管理：固定網址與雲端部署

## 推薦部署方式

使用 Render Web Service 搭配 Persistent Disk。

原因：
- 這個專案是 Python 內建 HTTP server，不需要額外套件。
- SQLite 資料庫可以放在 persistent disk，重啟和重新部署後資料仍保留。
- Render 會提供 `https://你的服務.onrender.com`，也可以綁定自己的網域。

## 必填環境變數

在雲端服務設定：

```text
PRICEBOOK_PASSWORD=你要使用的登入密碼
PRICEBOOK_SESSION_SECRET=一串長隨機字串
PRICEBOOK_DB_PATH=/opt/render/project/src/data/pricebook.sqlite3
```

`render.yaml` 已經設定 `PRICEBOOK_DB_PATH` 和 persistent disk，`PRICEBOOK_PASSWORD` 需要你在 Render 後台填入，不要寫進程式碼。

## Render 手動部署步驟

1. 將專案推到 GitHub。
2. 到 Render 建立 New Web Service，連接該 GitHub repo。
3. Build Command 留空。
4. Start Command 使用：

```bash
python3 server.py
```

5. 在 Advanced 加上 Persistent Disk：
   - Mount Path: `/opt/render/project/src/data`
   - Size: `1 GB`
6. 設定環境變數 `PRICEBOOK_PASSWORD`。
7. 部署完成後，使用 Render 提供的 `onrender.com` 網址登入。

## 固定自訂網域

部署完成後可以在 Render 的 Custom Domains 加入你的網域，例如：

```text
price.example.com
```

接著依照 Render 顯示的 DNS 紀錄，到你的網域 DNS 後台新增 CNAME 或 A record。

## 本機測試密碼登入

```bash
PRICEBOOK_PASSWORD="你的密碼" python3 server.py
```

如果沒有設定 `PRICEBOOK_PASSWORD`，伺服器會在啟動時產生一組臨時密碼，只適合本機測試。
