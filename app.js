const STORAGE_KEY = "pricing-manager-data-v1";
const API_DATA_PATH = "/api/data";

const seedData = {
  products: [
    {
      id: "p-1001",
      sku: "P-1001",
      name: "高效能濾芯",
      category: "耗材",
      basePrices: [
        { price: 1280, date: "2026-01-01", note: "年度牌價" },
        { price: 1360, date: "2026-06-01", note: "原料成本調整" },
      ],
      sales: [
        {
          customer: "長青商行",
          prices: [
            { price: 1180, date: "2026-01-15", note: "季度採購價" },
            { price: 1230, date: "2026-06-10", note: "續約調整" },
          ],
        },
        {
          customer: "北辰科技",
          prices: [{ price: 1260, date: "2026-05-05", note: "專案價" }],
        },
      ],
    },
    {
      id: "p-1002",
      sku: "P-1002",
      name: "精密控制閥",
      category: "零件",
      basePrices: [
        { price: 4200, date: "2026-02-01", note: "新品定價" },
        { price: 4550, date: "2026-06-18", note: "供應商價格更新" },
      ],
      sales: [
        {
          customer: "晴川工業",
          prices: [{ price: 4380, date: "2026-06-20", note: "年度框架合約" }],
        },
      ],
    },
    {
      id: "p-1003",
      sku: "P-1003",
      name: "商用感測模組",
      category: "電子",
      basePrices: [{ price: 2680, date: "2026-03-01", note: "標準定價" }],
      sales: [
        {
          customer: "北辰科技",
          prices: [
            { price: 2490, date: "2026-03-12", note: "批量折扣" },
            { price: 2550, date: "2026-06-22", note: "交期加急" },
          ],
        },
      ],
    },
  ],
};

let data = loadData();
let selectedProductId = data.products[0]?.id ?? null;
let query = "";
let timelineMode = "all";
let databaseMode = false;

const els = {
  commandInput: document.querySelector("#commandInput"),
  quickFilters: document.querySelector("#quickFilters"),
  productList: document.querySelector("#productList"),
  resultCount: document.querySelector("#resultCount"),
  productCount: document.querySelector("#productCount"),
  customerCount: document.querySelector("#customerCount"),
  priceCount: document.querySelector("#priceCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  dataSource: document.querySelector("#dataSource"),
  emptyState: document.querySelector("#emptyState"),
  detailContent: document.querySelector("#detailContent"),
  detailSku: document.querySelector("#detailSku"),
  detailName: document.querySelector("#detailName"),
  detailMeta: document.querySelector("#detailMeta"),
  detailBasePrice: document.querySelector("#detailBasePrice"),
  detailBaseDate: document.querySelector("#detailBaseDate"),
  detailRange: document.querySelector("#detailRange"),
  salesTable: document.querySelector("#salesTable"),
  timeline: document.querySelector("#timeline"),
  timelineMode: document.querySelector("#timelineMode"),
  customerOptions: document.querySelector("#customerOptions"),
  addProductBtn: document.querySelector("#addProductBtn"),
  updateBaseBtn: document.querySelector("#updateBaseBtn"),
  addSaleBtn: document.querySelector("#addSaleBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  productDialog: document.querySelector("#productDialog"),
  productForm: document.querySelector("#productForm"),
  basePriceDialog: document.querySelector("#basePriceDialog"),
  basePriceForm: document.querySelector("#basePriceForm"),
  saleDialog: document.querySelector("#saleDialog"),
  saleForm: document.querySelector("#saleForm"),
  productItemTemplate: document.querySelector("#productItemTemplate"),
};

function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedData);

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed.products) ? parsed : structuredClone(seedData);
  } catch {
    return structuredClone(seedData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  if (databaseMode) {
    saveDataToServer();
  }
}

async function initDataSource() {
  if (window.location.protocol === "file:") return;

  try {
    const response = await fetch(API_DATA_PATH);
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) return;

    const serverData = await response.json();
    if (!Array.isArray(serverData.products)) return;

    databaseMode = true;
    data = serverData;
    selectedProductId = data.products[0]?.id ?? null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
    render();
  } catch {
    databaseMode = false;
  }
}

async function saveDataToServer() {
  try {
    const response = await fetch(API_DATA_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("Database save failed");
  } catch {
    alert("資料庫儲存失敗，請確認伺服器是否仍在執行。");
  }
}

function currency(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function latestByDate(items) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getCurrentBase(product) {
  return latestByDate(product.basePrices) ?? { price: 0, date: "" };
}

function getCurrentSale(sale) {
  return latestByDate(sale.prices) ?? { price: 0, date: "" };
}

function getCustomers() {
  return [...new Set(data.products.flatMap((product) => product.sales.map((sale) => sale.customer)))].sort();
}

function getAllDates() {
  return data.products.flatMap((product) => [
    ...product.basePrices.map((price) => price.date),
    ...product.sales.flatMap((sale) => sale.prices.map((price) => price.date)),
  ]);
}

function getSelectedProduct() {
  return data.products.find((product) => product.id === selectedProductId);
}

function commandParts(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/(\w+)\s*(.*)$/);
  if (!match) return { command: "all", term: trimmed.toLowerCase() };
  return { command: match[1].toLowerCase(), term: match[2].trim().toLowerCase() };
}

function productMatches(product, parsed) {
  const currentBase = getCurrentBase(product);
  const customerText = product.sales.map((sale) => sale.customer).join(" ");
  const haystack = `${product.sku} ${product.name} ${product.category} ${customerText}`.toLowerCase();

  if (parsed.command === "changed") {
    const dates = [
      ...product.basePrices.map((price) => price.date),
      ...product.sales.flatMap((sale) => sale.prices.map((price) => price.date)),
    ].sort((a, b) => b.localeCompare(a));
    const newest = dates[0] ?? "";
    return newest >= offsetDate(-30) && haystack.includes(parsed.term);
  }

  if (parsed.command === "product") {
    return `${product.sku} ${product.name} ${product.category}`.toLowerCase().includes(parsed.term);
  }

  if (parsed.command === "customer") {
    return customerText.toLowerCase().includes(parsed.term);
  }

  if (parsed.command === "history") {
    const timelineText = buildTimeline(product)
      .map((item) => `${item.date} ${item.label} ${item.note} ${item.price}`)
      .join(" ")
      .toLowerCase();
    return timelineText.includes(parsed.term);
  }

  if (parsed.command === "price") {
    return String(currentBase.price).includes(parsed.term);
  }

  return haystack.includes(parsed.term);
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getFilteredProducts() {
  const parsed = commandParts(query);
  return data.products.filter((product) => productMatches(product, parsed));
}

function buildTimeline(product) {
  const baseItems = product.basePrices.map((entry) => ({
    type: "base",
    date: entry.date,
    label: "產品定價",
    price: entry.price,
    note: entry.note || "定價更新",
  }));

  const saleItems = product.sales.flatMap((sale) =>
    sale.prices.map((entry) => ({
      type: "sale",
      date: entry.date,
      label: sale.customer,
      price: entry.price,
      note: entry.note || "客戶售價更新",
    })),
  );

  return [...baseItems, ...saleItems].sort((a, b) => b.date.localeCompare(a.date));
}

function renderSummary() {
  const customers = getCustomers();
  const priceCount = data.products.reduce((total, product) => {
    return total + product.basePrices.length + product.sales.reduce((sum, sale) => sum + sale.prices.length, 0);
  }, 0);
  const latestDate = getAllDates().sort((a, b) => b.localeCompare(a))[0];

  els.productCount.textContent = data.products.length;
  els.customerCount.textContent = customers.length;
  els.priceCount.textContent = priceCount;
  els.lastUpdated.textContent = formatDate(latestDate);
  els.dataSource.textContent = databaseMode ? "SQLite" : "離線";

  els.customerOptions.innerHTML = customers.map((customer) => `<option value="${escapeHtml(customer)}"></option>`).join("");
}

function renderProductList() {
  const products = getFilteredProducts();
  els.productList.innerHTML = "";
  els.resultCount.textContent = `${products.length} 筆`;

  if (!products.some((product) => product.id === selectedProductId)) {
    selectedProductId = products[0]?.id ?? null;
  }

  products.forEach((product) => {
    const node = els.productItemTemplate.content.firstElementChild.cloneNode(true);
    const currentBase = getCurrentBase(product);
    node.classList.toggle("active", product.id === selectedProductId);
    node.querySelector("strong").textContent = product.name;
    node.querySelector("small").textContent = `${product.sku} · ${product.category} · ${product.sales.length} 位客戶`;
    node.querySelector(".item-price").textContent = currency(currentBase.price);
    node.addEventListener("click", () => {
      selectedProductId = product.id;
      render();
    });
    els.productList.append(node);
  });

  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = "沒有符合條件的產品";
    els.productList.append(empty);
  }
}

function renderDetail() {
  const product = getSelectedProduct();
  els.emptyState.classList.toggle("hidden", Boolean(product));
  els.detailContent.classList.toggle("hidden", !product);
  if (!product) return;

  const currentBase = getCurrentBase(product);
  const salePrices = product.sales.map((sale) => getCurrentSale(sale).price);
  const minSale = Math.min(...salePrices);
  const maxSale = Math.max(...salePrices);

  els.detailSku.textContent = product.sku;
  els.detailName.textContent = product.name;
  els.detailMeta.textContent = `${product.category} · ${product.sales.length} 位客戶有設定售價`;
  els.detailBasePrice.textContent = currency(currentBase.price);
  els.detailBaseDate.textContent = formatDate(currentBase.date);
  els.detailRange.textContent = salePrices.length ? `${currency(minSale)} - ${currency(maxSale)}` : "尚未設定";

  renderSales(product, currentBase.price);
  renderTimeline(product);
}

function renderSales(product, basePrice) {
  els.salesTable.innerHTML = "";

  if (!product.sales.length) {
    els.salesTable.innerHTML = `<tr><td class="empty-row" colspan="5">尚未設定客戶售價</td></tr>`;
    return;
  }

  product.sales
    .map((sale) => ({ sale, current: getCurrentSale(sale) }))
    .sort((a, b) => a.sale.customer.localeCompare(b.sale.customer, "zh-Hant"))
    .forEach(({ sale, current }) => {
      const diff = current.price - basePrice;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(sale.customer)}</td>
        <td><strong>${currency(current.price)}</strong></td>
        <td>${formatDate(current.date)}</td>
        <td class="${diff >= 0 ? "margin-positive" : "margin-negative"}">${diff >= 0 ? "+" : ""}${currency(diff)}</td>
        <td><button class="secondary-button compact" data-customer="${escapeHtml(sale.customer)}">更新</button></td>
      `;
      tr.querySelector("button").addEventListener("click", () => openSaleDialog(sale.customer, current.price));
      els.salesTable.append(tr);
    });
}

function renderTimeline(product) {
  const items = buildTimeline(product).filter((item) => timelineMode === "all" || item.type === timelineMode);
  els.timeline.innerHTML = "";

  if (!items.length) {
    els.timeline.innerHTML = `<div class="empty-row">沒有符合條件的時間紀錄</div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "timeline-item";
    row.innerHTML = `
      <div class="timeline-date">${formatDate(item.date)}</div>
      <div class="timeline-body">
        <strong>${escapeHtml(item.label)} · ${currency(item.price)}</strong>
        <span>${escapeHtml(item.note)}</span>
      </div>
      <span class="badge ${item.type === "sale" ? "sale" : ""}">${item.type === "sale" ? "客戶售價" : "產品定價"}</span>
    `;
    els.timeline.append(row);
  });
}

function setQuickFilterState() {
  const parsed = commandParts(query);
  els.quickFilters.querySelectorAll("button").forEach((button) => {
    const buttonCommand = button.dataset.command.trim().replace("/", "");
    button.classList.toggle("active", parsed.command === (buttonCommand || "all"));
  });
}

function render() {
  setQuickFilterState();
  renderSummary();
  renderProductList();
  renderDetail();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openProductDialog() {
  els.productForm.reset();
  els.productForm.elements.date.value = today();
  els.productDialog.showModal();
}

function openBaseDialog() {
  const product = getSelectedProduct();
  if (!product) return;
  const current = getCurrentBase(product);
  els.basePriceForm.reset();
  els.basePriceForm.elements.price.value = current.price;
  els.basePriceForm.elements.date.value = today();
  els.basePriceDialog.showModal();
}

function openSaleDialog(customer = "", price = "") {
  els.saleForm.reset();
  els.saleForm.elements.customer.value = customer;
  els.saleForm.elements.price.value = price;
  els.saleForm.elements.date.value = today();
  els.saleDialog.showModal();
}

function addProductFromForm() {
  const form = els.productForm.elements;
  const sku = form.sku.value.trim();
  const product = {
    id: `p-${crypto.randomUUID()}`,
    sku,
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    basePrices: [
      {
        price: Number(form.price.value),
        date: form.date.value,
        note: "初始定價",
      },
    ],
    sales: [],
  };

  data.products.unshift(product);
  selectedProductId = product.id;
  saveData();
  render();
}

function updateBaseFromForm() {
  const product = getSelectedProduct();
  if (!product) return;
  const form = els.basePriceForm.elements;
  product.basePrices.push({
    price: Number(form.price.value),
    date: form.date.value,
    note: form.note.value.trim() || "定價更新",
  });
  saveData();
  render();
}

function updateSaleFromForm() {
  const product = getSelectedProduct();
  if (!product) return;
  const form = els.saleForm.elements;
  const customer = form.customer.value.trim();
  let sale = product.sales.find((item) => item.customer === customer);

  if (!sale) {
    sale = { customer, prices: [] };
    product.sales.push(sale);
  }

  sale.prices.push({
    price: Number(form.price.value),
    date: form.date.value,
    note: form.note.value.trim() || "客戶售價更新",
  });

  saveData();
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `product-prices-${today()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.products)) throw new Error("Missing products");
      data = imported;
      selectedProductId = data.products[0]?.id ?? null;
      saveData();
      render();
    } catch {
      alert("匯入失敗，請確認 JSON 格式是否正確。");
    }
  });
  reader.readAsText(file);
}

els.commandInput.addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    els.commandInput.focus();
    els.commandInput.select();
  }
});

els.quickFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  query = button.dataset.command;
  els.commandInput.value = query;
  els.commandInput.focus();
  render();
});

els.timelineMode.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  timelineMode = button.dataset.mode;
  els.timelineMode.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderDetail();
});

els.addProductBtn.addEventListener("click", openProductDialog);
els.updateBaseBtn.addEventListener("click", openBaseDialog);
els.addSaleBtn.addEventListener("click", () => openSaleDialog());
els.exportBtn.addEventListener("click", exportData);
els.importFile.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importData(file);
  event.target.value = "";
});

els.productDialog.addEventListener("close", () => {
  if (els.productDialog.returnValue === "confirm") addProductFromForm();
});

els.basePriceDialog.addEventListener("close", () => {
  if (els.basePriceDialog.returnValue === "confirm") updateBaseFromForm();
});

els.saleDialog.addEventListener("close", () => {
  if (els.saleDialog.returnValue === "confirm") updateSaleFromForm();
});

render();
initDataSource();
