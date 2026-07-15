const DEMO_DATA = {
  settings: {},
  products: [
    {
      id: "demo-001",
      sku: "DEMO-001",
      name: "示範檢測耗材 A",
      category: "研究耗材",
      updatedAt: "2026-07-15",
      basePrices: [
        { price: 1280, date: "2026-04-01", note: "展示用標準定價" },
        { price: 1360, date: "2026-07-01", note: "展示用價格調整" },
      ],
      sales: [
        {
          customer: "示範客戶甲",
          prices: [
            { price: 1240, date: "2026-06-10", note: "展示用專案價格" },
          ],
        },
        {
          customer: "示範客戶乙",
          prices: [
            { price: 1290, date: "2026-07-05", note: "展示用採購價格" },
          ],
        },
      ],
    },
    {
      id: "demo-002",
      sku: "DEMO-002",
      name: "示範蛋白質試劑 B",
      category: "生技試劑",
      updatedAt: "2026-07-12",
      basePrices: [{ price: 2450, date: "2026-05-15", note: "展示用定價" }],
      sales: [
        {
          customer: "示範客戶甲",
          prices: [
            { price: 2280, date: "2026-06-18", note: "展示用合約價格" },
          ],
        },
      ],
    },
    {
      id: "demo-003",
      sku: "DEMO-003",
      name: "示範分析模組 C",
      category: "分析設備",
      updatedAt: "2026-07-08",
      basePrices: [{ price: 3680, date: "2026-06-01", note: "展示用定價" }],
      sales: [
        {
          customer: "示範客戶丙",
          prices: [
            { price: 3500, date: "2026-07-08", note: "展示用批量價格" },
          ],
        },
      ],
    },
  ],
};

export function isDemoMode(search) {
  return new URLSearchParams(search).get("demo") === "1";
}

export function createDemoData() {
  return structuredClone(DEMO_DATA);
}
