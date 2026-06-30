---
name: sales-price-excel-converter
description: Use when converting sales-history Excel workbooks into the product price management import workbook format in /Users/jimmy/Documents/peactice. Handles 資料庫.xlsx sources with columns such as 銷貨日期(C), 銷貨品號, 品名, 客戶簡稱, 本幣銷貨未稅金額 and outputs 產品, 產品定價, 客戶售價, 使用說明 sheets matching 產品售價管理 templates.
---

# Excel 售價資料轉換

## 目的

把歷史銷貨資料整理成「產品售價管理」可以匯入的 Excel 格式。遇到
`資料庫.xlsx`、`產品售價管理 yyyy-mm-dd.xlsx`、銷貨紀錄轉產品/客戶售價格式時使用這個
Skill。

## 固定規則

- `SKU` = 來源欄位 `銷貨品號`。
- 只納入 `銷貨單別` = `2301` 的來源列。
- `最近異動` = 該 SKU 最新一筆 `銷貨日期(C)`。
- `產品名稱` = 來源欄位 `品名`。
- `分類` = 依 `品名` 判讀；同品名必須得到同一種分類。
- `產品定價` = 該 SKU 歷史最高 (`本幣銷貨未稅金額` x `1.05`) /
  `銷貨數量`，結果四捨五入為整數。
- `產品定價.生效日期` = 歷史最高價出現的最新銷貨日期。
- `客戶` = 來源欄位 `客戶簡稱`。
- `客戶售價.生效日期` = 來源欄位 `銷貨日期(C)`。
- `產品定價` 與 `客戶售價` 若四捨五入後整數尾數為 `1`，最後一碼改為 `0`。
- `客戶售價` = (`本幣銷貨未稅金額` x `1.05`) / `銷貨數量`，結果四捨五入為整數。
- `數量` = 來源欄位 `銷貨數量`。
- `product_id` 由 SKU 穩定產生，保持同一 SKU 每次轉換得到同一個 id。

詳細欄位對照與分類規則見 `references/conversion-rules.md`。

## 使用流程

1. 先確認來源檔與模板檔存在。
2. 讀取模板
   workbook，確認四張表的欄位順序：`產品`、`產品定價`、`客戶售價`、`使用說明`。
3. 用 `scripts/convert-sales-to-pricebook.mjs` 轉換。
4. 輸出檔名建議使用 `產品售價管理_整理完成_YYYY-MM-DD.xlsx`。
5. 轉換後檢查：
   - `產品` 表是否每個 SKU 一列。
   - `產品定價` 是否每個 SKU 使用歷史最高含稅單價，且定價為整數。
   - `客戶售價` 是否保留歷史客戶價格紀錄，且售價為整數。
   - `產品定價` 與 `客戶售價` 若尾數為 `1` 是否已修正為 `0`。
   - 日期為 `yyyy-mm-dd`。

## 執行範例

```bash
NODE_PATH=/Users/jimmy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/jimmy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
skills/sales-price-excel-converter/scripts/convert-sales-to-pricebook.mjs \
--source database/資料庫.xlsx \
--template "database/產品售價管理 2026-06-29.xlsx" \
--output "database/產品售價管理_整理完成_2026-06-29.xlsx"
```

## 注意事項

- 不要把來源資料寫進 GitHub，除非使用者明確要求。
- 不要用 AI 猜價格；所有價格都只能來自 Excel 來源欄位。
- 若來源欄位名稱改變，先更新 `references/conversion-rules.md` 和轉換腳本。
