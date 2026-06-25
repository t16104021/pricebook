# 部署方式

目前推薦使用免費長期方案：

```text
GitHub Pages + Supabase
```

請依照 [SUPABASE.md](./SUPABASE.md)：

1. 建立 Supabase 專案。
2. 執行 [supabase-schema.sql](./supabase-schema.sql)。
3. 建立登入使用者。
4. 填入 [supabase-config.js](./supabase-config.js)。
5. 在 GitHub repo 開啟 Pages。

部署完成後預設網址：

```text
https://t16104021.github.io/pricebook/
```

## 注意

GitHub Pages 免費方案不使用 Python server、SQLite 或 Render。網站由 HTML/CSS/JS 組成，資料存在 Supabase。
