import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FileBlob, SpreadsheetFile, Workbook } = require("@oai/artifact-tool");

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(args.source ?? "database/資料庫.xlsx");
const templatePath = path.resolve(
  args.template ?? "database/產品售價管理 2026-06-29.xlsx",
);
const outputPath = path.resolve(
  args.output ?? "database/產品售價管理_整理完成.xlsx",
);

const sourceWorkbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load(sourcePath),
);
const templateWorkbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load(templatePath),
);

const templateHeaders = await readTemplateHeaders(templateWorkbook);
const sourceRows = await readSourceRows(sourceWorkbook);
const converted = convertRows(sourceRows);
await writeWorkbook(converted, templateHeaders, outputPath);

console.log(JSON.stringify(
  {
    output: outputPath,
    sourceRows: sourceRows.length,
    products: converted.products.length,
    basePrices: converted.basePrices.length,
    customerPrices: converted.customerPrices.length,
  },
  null,
  2,
));

function parseArgs(items) {
  const parsed = {};
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = items[i + 1] && !items[i + 1].startsWith("--")
      ? items[++i]
      : "true";
    parsed[key] = value;
  }
  return parsed;
}

async function readSourceRows(workbook) {
  const sheet = workbook.worksheets.getItemAt(0);
  const usedRange = sheet.getUsedRange(true);
  const values = usedRange.values;
  const headers = values[0].map((value) => String(value ?? "").trim());
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const required = [
    "銷貨日期(C)",
    "銷貨單別",
    "銷貨品號",
    "品名",
    "客戶簡稱",
    "原幣銷貨單價",
  ];
  for (const header of required) {
    if (!(header in index)) throw new Error(`來源檔缺少必要欄位：${header}`);
  }

  return values.slice(1).map((row) => ({
    date: normalizeDate(row[index["銷貨日期(C)"]]),
    saleType: cleanText(row[index["銷貨單別"]]),
    sku: cleanText(row[index["銷貨品號"]]),
    name: cleanText(row[index["品名"]]),
    customer: cleanText(row[index["客戶簡稱"]]),
    customerCode: cleanText(row[index["客戶代號"]]),
    orderNo: cleanText(row[index["銷貨單號"]]),
    lineNo: cleanText(row[index["銷貨序號"]]),
    quantity: toNumber(row[index["銷貨數量"]]),
    price: toNumber(row[index["原幣銷貨單價"]]),
  })).filter((row) =>
    row.saleType === "2301" && row.date && row.sku && row.name &&
    row.price !== null
  );
}

async function readTemplateHeaders(workbook) {
  const result = {};
  for (const sheetName of ["產品", "產品定價", "客戶售價", "使用說明"]) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const usedRange = sheet.getUsedRange(true);
    const values = usedRange.values;
    result[sheetName] = values[0].map((value) => String(value ?? "").trim());
  }
  return result;
}

function convertRows(rows) {
  const bySku = new Map();
  const nameStatsBySku = new Map();

  for (const row of rows) {
    if (!bySku.has(row.sku)) {
      bySku.set(row.sku, {
        sku: row.sku,
        productId: productIdFromSku(row.sku),
        latestDate: row.date,
        maxPrice: row.price,
        maxPriceDate: row.date,
      });
      nameStatsBySku.set(row.sku, new Map());
    }

    const item = bySku.get(row.sku);
    if (row.date > item.latestDate) item.latestDate = row.date;
    if (
      row.price > item.maxPrice ||
      (row.price === item.maxPrice && row.date > item.maxPriceDate)
    ) {
      item.maxPrice = row.price;
      item.maxPriceDate = row.date;
    }

    const nameStats = nameStatsBySku.get(row.sku);
    const current = nameStats.get(row.name) ??
      { count: 0, latestDate: row.date };
    current.count += 1;
    if (row.date > current.latestDate) current.latestDate = row.date;
    nameStats.set(row.name, current);
  }

  const products = [...bySku.values()]
    .map((item) => {
      const name = chooseProductName(nameStatsBySku.get(item.sku));
      return [
        item.productId,
        item.sku,
        name,
        classifyProductName(name),
        item.latestDate,
      ];
    })
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-Hant"));

  const basePrices = [...bySku.values()]
    .map((item) => [
      item.productId,
      item.sku,
      item.maxPriceDate,
      roundMoney(item.maxPrice),
      "歷史最高價",
    ])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-Hant"));

  const customerPrices = rows
    .map((row) => {
      const product = bySku.get(row.sku);
      return [
        product.productId,
        row.sku,
        row.customer || row.customerCode || "未命名客戶",
        row.date,
        roundMoney(row.price * 1.05),
        row.quantity === null ? "" : roundMoney(row.quantity),
        buildNote(row),
      ];
    })
    .sort((a, b) => (
      String(a[1]).localeCompare(String(b[1]), "zh-Hant") ||
      String(a[2]).localeCompare(String(b[2]), "zh-Hant") ||
      String(a[3]).localeCompare(String(b[3]), "zh-Hant")
    ));

  return { products, basePrices, customerPrices };
}

function chooseProductName(nameStats) {
  return [...nameStats.entries()]
    .sort((a, b) =>
      b[1].count - a[1].count ||
      b[1].latestDate.localeCompare(a[1].latestDate) ||
      a[0].localeCompare(b[0], "zh-Hant")
    )[0][0];
}

function productIdFromSku(sku) {
  const slug = sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    "",
  ).slice(0, 36);
  const hash = createHash("sha1").update(sku).digest("hex").slice(0, 8);
  return `p-${slug || "sku"}-${hash}`;
}

function classifyProductName(name) {
  const value = name.toUpperCase();
  if (/FBS|SERUM|血清/.test(value)) return "細胞培養試劑";
  if (
    /TRYPSIN|TRYPLE|MEDIUM|DMEM|RPMI|BUFFER|REAGENT|酶|培養基|試劑/.test(value)
  ) return "細胞培養試劑";
  if (/KIT|ASSAY|測定|檢測/.test(value)) return "檢測試劑";
  if (
    /FLASK|DISH|PLATE|TUBE|PIPETTE|TIP|CHAMBER|培養瓶|滴管|玻片|分析盤/.test(
      value,
    )
  ) return "耗材";
  if (/SENSOR|MODULE|模組|感測/.test(value)) return "電子";
  if (/VALVE|閥|控制/.test(value)) return "零件";
  return "耗材";
}

function buildNote(row) {
  const pieces = [];
  if (row.orderNo) pieces.push(`銷貨單號:${row.orderNo}`);
  if (row.customerCode) pieces.push(`客戶代號:${row.customerCode}`);
  return pieces.join("；");
}

function ensureCustomerPriceHeaders(headers) {
  if (headers.includes("數量")) return headers;
  const output = [...headers];
  const noteIndex = output.indexOf("備註");
  output.splice(noteIndex >= 0 ? noteIndex : output.length, 0, "數量");
  return output;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function writeWorkbook(converted, templateHeaders, output) {
  const workbook = Workbook.create();
  const sheets = [
    ["產品", templateHeaders["產品"], converted.products],
    ["產品定價", templateHeaders["產品定價"], converted.basePrices],
    [
      "客戶售價",
      ensureCustomerPriceHeaders(templateHeaders["客戶售價"]),
      converted.customerPrices,
    ],
    ["使用說明", templateHeaders["使用說明"], [
      [
        "匯入方式",
        "此檔由銷貨資料自動整理，可直接匯入產品售價管理系統。匯入會以整份 Excel 取代目前資料。",
      ],
      [
        "來源規則",
        "只納入銷貨單別 2301；SKU=銷貨品號；最近異動=該 SKU 最新銷貨日期；產品名稱=品名；產品定價=歷史最高原幣銷貨單價。",
      ],
      ["分類方式", "分類依品名關鍵字判讀；同品名固定得到同一分類。"],
      [
        "客戶售價",
        "每筆銷貨資料會成為一筆客戶售價歷史，客戶售價=原幣銷貨單價 x 1.05，數量來自銷貨數量，備註保留銷貨單號與客戶代號。",
      ],
      [
        "對應規則",
        "product_id 優先，其次用 SKU 對應產品。大量輸入時請保持 SKU 唯一。",
      ],
    ]],
  ];

  for (const [sheetName, headers, rows] of sheets) {
    const sheet = workbook.worksheets.add(sheetName);
    sheet.showGridLines = false;
    const matrix = [headers, ...rows];
    sheet.getRangeByIndexes(0, 0, matrix.length, headers.length).values =
      matrix;
    sheet.freezePanes.freezeRows(1);
    formatSheet(sheet, matrix.length, headers.length, sheetName);
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(output);
}

function formatSheet(sheet, rowCount, colCount, sheetName) {
  const all = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  try {
    all.format.font.name = "Arial";
    all.format.font.size = 11;
    all.format.borders = { preset: "inside", style: "thin", color: "#E5E7EB" };
    header.format.fill.color = "#1F4E78";
    header.format.font.color = "#FFFFFF";
    header.format.font.bold = true;
    header.format.rowHeight = 24;
    all.format.autofitColumns();
    all.format.autofitRows();

    if (sheetName === "產品") {
      sheet.getRangeByIndexes(1, 4, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("yyyy-mm-dd");
    } else if (sheetName === "產品定價") {
      sheet.getRangeByIndexes(1, 2, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("yyyy-mm-dd");
      sheet.getRangeByIndexes(1, 3, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("#,##0.00");
    } else if (sheetName === "客戶售價") {
      sheet.getRangeByIndexes(1, 3, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("yyyy-mm-dd");
      sheet.getRangeByIndexes(1, 4, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("#,##0.00");
      sheet.getRangeByIndexes(1, 5, Math.max(rowCount - 1, 1), 1)
        .setNumberFormat("#,##0.##");
    }
  } catch (error) {
    console.warn(`Formatting warning on ${sheetName}: ${error.message}`);
  }
}
