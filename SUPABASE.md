# 免費長期部署：GitHub Pages + Supabase

## 架構

- GitHub Pages：免費放靜態網站。
- Supabase：免費方案內提供 Auth 與 Postgres 資料庫。
- `supabase-config.js`：前端連 Supabase 的設定。anon key 可以公開，實際權限由 Supabase RLS 控制。
- 每個登入帳號會有各自獨立的一份產品資料；不同帳號不會看到彼此資料。

## 1. 建立 Supabase 專案

1. 到 <https://supabase.com/dashboard/projects>。
2. 建立 New project。
3. Project name 可用 `pricebook`。
4. Region 選離你近的區域。
5. 記下 Database Password。

## 2. 建立資料表與權限

到 Supabase 專案：

1. 左側 SQL Editor。
2. New query。
3. 貼上 [supabase-schema.sql](./supabase-schema.sql) 的內容。
4. Run。

## 3. 建立登入帳號

到 Supabase 專案：

1. 左側 Authentication。
2. Users。
3. Add user。
4. 輸入你要登入網站的 email 與 password。
5. 建議勾選 Auto Confirm User。

每新增一個使用者，該帳號第一次登入時會自動建立自己的產品資料列。不同帳號的資料彼此隔離。

## 舊共用資料改成單一帳號資料

如果你之前已經有舊資料存在 `id = main`，改成帳號隔離後，舊資料不會自動出現在任何帳號下。可以到 Supabase SQL Editor 先查出使用者 ID：

```sql
select id, email
from auth.users;
```

再把舊共用資料複製給指定帳號，將 `使用者ID` 換成要保留舊資料的帳號 ID：

```sql
insert into public.pricebook_data (id, payload, updated_at)
select '使用者ID', payload, now()
from public.pricebook_data
where id = 'main'
on conflict (id) do update
set payload = excluded.payload,
    updated_at = excluded.updated_at;
```

## 4. 填入前端設定

到 Supabase 專案：

1. Project Settings。
2. API。
3. 複製 Project URL 與 anon public key。
4. 打開 [supabase-config.js](./supabase-config.js)，填入：

```js
window.PRICEBOOK_SUPABASE = {
  url: "https://你的專案.supabase.co",
  anonKey: "你的 anon public key",
};
```

## 5. 部署到 GitHub Pages

GitHub Pages 免費版使用 public repository。

1. 到 GitHub repo Settings。
2. Pages。
3. Source 選 Deploy from a branch。
4. Branch 選 `master`，folder 選 `/root`。
5. 儲存。

網站會在幾分鐘後出現在：

```text
https://t16104021.github.io/pricebook/
```

## 注意事項

- 不要關閉 Supabase 的 Row Level Security。
- `supabase-config.js` 的 anon key 是公開前端 key，不是 service role key。
- 不要把 service role key 放進任何前端檔案。
- GitHub Pages 只能跑靜態網站，所以不再使用 `server.py`、SQLite 或 Render。
