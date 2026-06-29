import { assertEquals } from "jsr:@std/assert@1.0.19";

import { queryPricebook } from "./pricebook.ts";
import type { PricebookPayload, Product } from "./types.ts";

const payload: PricebookPayload = {
  products: [
    {
      id: "1",
      sku: "ABC-100",
      name: "高效濾芯",
      basePrices: [
        { price: 1200, date: "2026-06-01", note: "新定價" },
        { price: 1100, date: "2026-01-01", note: "舊定價" },
      ],
      sales: [{
        customer: "長青商行",
        prices: [
          { price: 980, date: "2026-06-27", quantity: 12, note: "年度合約價" },
          { price: 900, date: "2026-02-01", note: "舊售價" },
        ],
      }],
    },
    {
      id: "2",
      sku: "ABC-100-BULK",
      name: "ABC-100 大包裝",
      basePrices: [{ price: 5000, date: "2026-05-01" }],
      sales: [],
    },
    {
      id: "3",
      sku: "ABC-200",
      name: "標準濾芯",
      basePrices: [],
      sales: [],
    },
  ],
};

Deno.test("prefers an exact case-insensitive SKU and returns latest prices", () => {
  assertEquals(
    queryPricebook(payload, "長青商行", "abc-100"),
    [
      "客戶：長青商行",
      "產品：ABC-100 高效濾芯",
      "產品定價：NT$1,200",
      "定價日期：2026/06/01",
      "客戶售價：NT$980",
      "銷售數量：12",
      "售價日期：2026/06/27",
      "備註：年度合約價",
    ].join("\n"),
  );
});

Deno.test("uses the last appended price when dates are equal", () => {
  const sameDatePayload: PricebookPayload = {
    products: [{
      id: "same-date",
      sku: "SAME-1",
      name: "同日更新品",
      basePrices: [
        { price: 1000, date: "2026-06-27" },
        { price: 1250, date: "2026-06-27" },
      ],
      sales: [{
        customer: "長青商行",
        prices: [
          { price: 800, date: "2026-06-27", note: "上午" },
          { price: 950, date: "2026-06-27", quantity: 3, note: "下午追加" },
        ],
      }],
    }],
  };

  assertEquals(
    queryPricebook(sameDatePayload, "長青商行", "SAME-1"),
    [
      "客戶：長青商行",
      "產品：SAME-1 同日更新品",
      "產品定價：NT$1,250",
      "定價日期：2026/06/27",
      "客戶售價：NT$950",
      "銷售數量：3",
      "售價日期：2026/06/27",
      "備註：下午追加",
    ].join("\n"),
  );
});

Deno.test("lists duplicate exact SKUs instead of selecting the first", () => {
  const duplicateSkuPayload: PricebookPayload = {
    products: [
      {
        id: "upper",
        sku: "DUP-1",
        name: "大寫版本",
        basePrices: [],
        sales: [{ customer: "長青商行", prices: [] }],
      },
      {
        id: "lower",
        sku: "dup-1",
        name: "小寫版本",
        basePrices: [],
        sales: [],
      },
      {
        id: "partial",
        sku: "DUP-10",
        name: "部分符合",
        basePrices: [],
        sales: [],
      },
    ],
  };

  assertEquals(
    queryPricebook(duplicateSkuPayload, "長青商行", "DuP-1"),
    [
      "找到 2 個產品：",
      "1. DUP-1 大寫版本",
      "2. dup-1 小寫版本",
      "",
      "請輸入完整產品編號。",
    ].join("\n"),
  );
});

Deno.test("lists all candidates for a case-insensitive partial match", () => {
  assertEquals(
    queryPricebook(payload, "長青商行", "abc"),
    [
      "找到 3 個產品：",
      "1. ABC-100 高效濾芯",
      "2. ABC-100-BULK ABC-100 大包裝",
      "3. ABC-200 標準濾芯",
      "",
      "請輸入完整產品編號。",
    ].join("\n"),
  );
});

Deno.test("reports a missing customer before searching products", () => {
  assertEquals(
    queryPricebook(payload, "不存在", "ABC-100"),
    "查無客戶：不存在",
  );
});

Deno.test("shows unset base and customer prices for a single product", () => {
  assertEquals(
    queryPricebook(payload, "長青商行", "ABC-200"),
    [
      "客戶：長青商行",
      "產品：ABC-200 標準濾芯",
      "產品定價：尚未設定",
      "定價日期：尚未設定",
      "客戶售價：尚未設定",
      "銷售數量：尚未設定",
      "售價日期：尚未設定",
      "備註：無",
    ].join("\n"),
  );
});

Deno.test("reports a missing product", () => {
  assertEquals(
    queryPricebook(payload, "長青商行", "ZZZ"),
    "查無產品：ZZZ",
  );
});

Deno.test("limits partial matches to ten and reports the remaining count", () => {
  const products: Product[] = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    sku: `ITEM-${String(index + 1).padStart(2, "0")}`,
    name: `產品 ${index + 1}`,
    basePrices: [],
    sales: index === 0 ? [{ customer: "長青商行", prices: [] }] : [],
  }));

  assertEquals(
    queryPricebook({ products }, "長青商行", "item"),
    [
      "找到 12 個產品：",
      ...products.slice(0, 10).map(
        (product, index) => `${index + 1}. ${product.sku} ${product.name}`,
      ),
      "",
      "另有 2 筆，請輸入更多產品編號字元。",
    ].join("\n"),
  );
});
