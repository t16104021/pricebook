const STORAGE_KEY_PREFIX = "pricing-manager-data-v1";

const emptyData = {
  settings: {},
  products: [],
};

const DEFAULT_AI_REPLY_INSTRUCTIONS = [
  "你是 Jimmy 的 LINE 客服回覆助手。",
  "只能根據使用者訊息中的資料回覆，不得自行推測價格、折扣、庫存或交期。",
  "不要提產品定價、定價日期、價格最後更新日或售價日期。",
  "只可以提客戶名稱、產品編號、產品名稱、客戶售價與備註。",
  "語氣要像 Jimmy 平常回客戶 LINE 的方式：簡潔有力、熱心、親和。",
  "可使用「優惠價」「目前是」「先給您參考」「需要的話我再確認」這類短句。",
  "範例風格：「ABC-100 目前優惠價 $980，先給您參考。」",
  "可以說幫忙確認庫存，但不可直接宣稱有庫存或承諾交期。",
  "回覆控制在 1 到 2 句，不要說資料庫顯示或系統查詢到。",
].join("\n");

const seedData = {
  settings: {},
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

let currentUserId = null;
let data = loadLocalData();
let selectedProductId = data.products[0]?.id ?? null;
let query = "";
let timelineMode = "all";
let timelineSort = "desc";
let timelineStart = "";
let timelineEnd = "";
let timelineCustomerSearch = "";
let timelineDeleteTarget = null;
let customerSearch = "";
let customerInitial = "all";
let customerPage = 1;
let customerPageSize = 10;
let dbClient = null;
let isCloudReady = false;
let saveTimer = null;

const els = {
  authShell: document.querySelector("#authShell"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  authError: document.querySelector("#authError"),
  authSubmit: document.querySelector("#authForm button[type='submit']"),
  logoutBtn: document.querySelector("#logoutBtn"),
  commandInput: document.querySelector("#commandInput"),
  quickFilters: document.querySelector("#quickFilters"),
  productList: document.querySelector("#productList"),
  resultCount: document.querySelector("#resultCount"),
  productCount: document.querySelector("#productCount"),
  customerCount: document.querySelector("#customerCount"),
  priceCount: document.querySelector("#priceCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  dataSource: document.querySelector("#dataSource"),
  customerSearch: document.querySelector("#customerSearch"),
  customerInitialFilter: document.querySelector("#customerInitialFilter"),
  customerFilterCount: document.querySelector("#customerFilterCount"),
  customerPageSize: document.querySelector("#customerPageSize"),
  customerPrevPage: document.querySelector("#customerPrevPage"),
  customerNextPage: document.querySelector("#customerNextPage"),
  customerPageInfo: document.querySelector("#customerPageInfo"),
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
  timelineSort: document.querySelector("#timelineSort"),
  timelineCustomerSearch: document.querySelector("#timelineCustomerSearch"),
  timelineStart: document.querySelector("#timelineStart"),
  timelineEnd: document.querySelector("#timelineEnd"),
  clearTimelineRange: document.querySelector("#clearTimelineRange"),
  customerOptions: document.querySelector("#customerOptions"),
  addProductBtn: document.querySelector("#addProductBtn"),
  editProductBtn: document.querySelector("#editProductBtn"),
  deleteProductBtn: document.querySelector("#deleteProductBtn"),
  updateBaseBtn: document.querySelector("#updateBaseBtn"),
  addSaleBtn: document.querySelector("#addSaleBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  aiSettingsBtn: document.querySelector("#aiSettingsBtn"),
  aiSettingsDialog: document.querySelector("#aiSettingsDialog"),
  aiSettingsForm: document.querySelector("#aiSettingsForm"),
  productDialog: document.querySelector("#productDialog"),
  productForm: document.querySelector("#productForm"),
  editProductDialog: document.querySelector("#editProductDialog"),
  editProductForm: document.querySelector("#editProductForm"),
  deleteProductDialog: document.querySelector("#deleteProductDialog"),
  deleteProductForm: document.querySelector("#deleteProductForm"),
  deleteProductMessage: document.querySelector("#deleteProductMessage"),
  deleteTimelineDialog: document.querySelector("#deleteTimelineDialog"),
  deleteTimelineForm: document.querySelector("#deleteTimelineForm"),
  deleteTimelineMessage: document.querySelector("#deleteTimelineMessage"),
  basePriceDialog: document.querySelector("#basePriceDialog"),
  basePriceForm: document.querySelector("#basePriceForm"),
  saleDialog: document.querySelector("#saleDialog"),
  saleForm: document.querySelector("#saleForm"),
  resetPasswordDialog: document.querySelector("#resetPasswordDialog"),
  resetPasswordForm: document.querySelector("#resetPasswordForm"),
  resetPasswordError: document.querySelector("#resetPasswordError"),
  productItemTemplate: document.querySelector("#productItemTemplate"),
};

function hasSupabaseConfig() {
  return Boolean(
    window.PRICEBOOK_SUPABASE?.url &&
      window.PRICEBOOK_SUPABASE?.anonKey &&
      !window.PRICEBOOK_SUPABASE.url.includes("YOUR_SUPABASE"),
  );
}

function loadLocalData() {
  const stored = localStorage.getItem(localStorageKey());
  if (!stored) return structuredClone(seedData);

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed.products)
      ? ensureDataShape(parsed)
      : structuredClone(seedData);
  } catch {
    return structuredClone(seedData);
  }
}

function ensureDataShape(value) {
  const products = Array.isArray(value?.products) ? value.products : [];
  return {
    ...value,
    settings: value?.settings && typeof value.settings === "object"
      ? value.settings
      : {},
    products,
  };
}

function localStorageKey() {
  return currentUserId
    ? `${STORAGE_KEY_PREFIX}-${currentUserId}`
    : STORAGE_KEY_PREFIX;
}

function showAuth(message = "") {
  els.authShell.classList.remove("hidden");
  els.appShell.classList.add("hidden");
  els.authError.textContent = message;
  els.authError.classList.toggle("hidden", !message);
}

function authMessage(error) {
  const message = error?.message || "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "帳號或密碼錯誤，請確認 Email 和密碼後再試一次。";
  }
  if (lower.includes("email not confirmed")) {
    return "這個 Email 尚未完成驗證，請先到 Supabase 確認使用者狀態。";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "登入嘗試太頻繁，請稍等一下再試。";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "連線失敗，請確認網路正常後再試。";
  }

  return `登入失敗：${message || "發生未知錯誤，請稍後再試。"}`;
}

function showApp() {
  els.authShell.classList.add("hidden");
  els.appShell.classList.remove("hidden");
}

function initSupabase() {
  if (!hasSupabaseConfig() || !window.supabase) {
    showAuth(
      "尚未設定 Supabase。請先依照 SUPABASE.md 建立專案並填入 supabase-config.js。",
    );
    return;
  }

  dbClient = window.supabase.createClient(
    window.PRICEBOOK_SUPABASE.url,
    window.PRICEBOOK_SUPABASE.anonKey,
  );
  dbClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      openResetPasswordDialog();
    }
  });
}

async function initDataSource() {
  initSupabase();
  if (!dbClient) return;

  const { data: sessionData, error } = await dbClient.auth.getSession();
  if (error) {
    showAuth(`讀取登入狀態失敗：${error.message}`);
    return;
  }
  if (!sessionData.session) {
    showAuth();
    return;
  }

  const loaded = await loadCloudData(sessionData.session.user.id);
  if (loaded) {
    showApp();
    render();
  }
}

async function loadCloudData(userId) {
  currentUserId = userId;

  const { data: row, error } = await dbClient
    .from("pricebook_data")
    .select("payload")
    .eq("id", currentUserId)
    .maybeSingle();

  if (error) {
    showAuth(`讀取資料庫失敗：${error.message}`);
    return false;
  }

  if (!row?.payload) {
    data = structuredClone(emptyData);
    selectedProductId = data.products[0]?.id ?? null;
    const saved = await saveCloudData(true);
    if (!saved) return false;
    isCloudReady = true;
    localStorage.setItem(localStorageKey(), JSON.stringify(data, null, 2));
    return true;
  }

  data = ensureDataShape(row.payload);
  selectedProductId = data.products[0]?.id ?? null;
  isCloudReady = true;
  localStorage.setItem(localStorageKey(), JSON.stringify(data, null, 2));
  return true;
}

function saveData() {
  data = ensureDataShape(data);
  localStorage.setItem(localStorageKey(), JSON.stringify(data, null, 2));
  if (!isCloudReady) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCloudData(), 250);
}

async function saveCloudData(force = false) {
  if (!dbClient || !currentUserId || (!isCloudReady && !force)) return false;

  const { error } = await dbClient.from("pricebook_data").upsert({
    id: currentUserId,
    payload: data,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const message = `雲端儲存失敗：${error.message}`;
    if (force) showAuth(message);
    else alert(message);
    return false;
  }

  return true;
}

async function signIn(email, password) {
  els.authError.classList.add("hidden");
  els.authSubmit.disabled = true;
  els.authSubmit.textContent = "登入中";

  try {
    const { data: authData, error } = await dbClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      showAuth(authMessage(error));
      return;
    }

    const loaded = await loadCloudData(authData.user.id);
    if (loaded) {
      showApp();
      render();
    }
  } catch (error) {
    showAuth(authMessage(error));
  } finally {
    els.authSubmit.disabled = false;
    els.authSubmit.textContent = "登入";
  }
}

async function signOut() {
  if (dbClient) await dbClient.auth.signOut();
  currentUserId = null;
  isCloudReady = false;
  data = loadLocalData();
  selectedProductId = data.products[0]?.id ?? null;
  showAuth();
}

function openResetPasswordDialog() {
  els.resetPasswordForm.reset();
  els.resetPasswordError.classList.add("hidden");
  if (!els.resetPasswordDialog.open) {
    els.resetPasswordDialog.showModal();
  }
}

async function updateRecoveredPassword() {
  const form = els.resetPasswordForm.elements;
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (password !== confirmPassword) {
    els.resetPasswordError.textContent = "兩次輸入的新密碼不一致。";
    els.resetPasswordError.classList.remove("hidden");
    return false;
  }

  const { error } = await dbClient.auth.updateUser({ password });
  if (error) {
    els.resetPasswordError.textContent = `更新密碼失敗：${error.message}`;
    els.resetPasswordError.classList.remove("hidden");
    return false;
  }

  return true;
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
  return [
    ...new Set(
      data.products.flatMap((product) =>
        product.sales.map((sale) => sale.customer)
      ),
    ),
  ].sort();
}

function customerInitialKey(name) {
  return [...name.trim()][0]?.toUpperCase() || "#";
}

function getAllDates() {
  return data.products.flatMap((product) => [
    product.updatedAt,
    ...product.basePrices.map((price) => price.date),
    ...product.sales.flatMap((sale) => sale.prices.map((price) => price.date)),
  ]).filter(Boolean);
}

function getSelectedProduct() {
  return data.products.find((product) => product.id === selectedProductId);
}

function commandParts(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/(\w+)\s*(.*)$/);
  if (!match) return { command: "all", term: trimmed.toLowerCase() };
  return {
    command: match[1].toLowerCase(),
    term: match[2].trim().toLowerCase(),
  };
}

function productMatches(product, parsed) {
  const currentBase = getCurrentBase(product);
  const customerText = product.sales.map((sale) => sale.customer).join(" ");
  const haystack =
    `${product.sku} ${product.name} ${product.category} ${customerText}`
      .toLowerCase();

  if (parsed.command === "changed") {
    return (product.updatedAt || "") >= offsetDate(-30) &&
      haystack.includes(parsed.term);
  }

  if (parsed.command === "product") {
    return `${product.sku} ${product.name} ${product.category}`.toLowerCase()
      .includes(parsed.term);
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

function markProductChanged(product) {
  if (product) product.updatedAt = today();
}

function getFilteredProducts() {
  const parsed = commandParts(query);
  return data.products.filter((product) => productMatches(product, parsed));
}

function buildTimeline(product) {
  const baseItems = product.basePrices.map((entry, priceIndex) => ({
    type: "base",
    date: entry.date,
    label: "產品定價",
    price: entry.price,
    note: entry.note || "定價更新",
    priceIndex,
  }));

  const saleItems = product.sales.flatMap((sale, saleIndex) =>
    sale.prices.map((entry, priceIndex) => ({
      type: "sale",
      date: entry.date,
      label: sale.customer,
      price: entry.price,
      quantity: entry.quantity,
      note: entry.note || "客戶售價更新",
      saleIndex,
      priceIndex,
    }))
  );

  return [...baseItems, ...saleItems].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}

function renderSummary() {
  const customers = getCustomers();
  const priceCount = data.products.reduce((total, product) => {
    return total + product.basePrices.length +
      product.sales.reduce((sum, sale) => sum + sale.prices.length, 0);
  }, 0);
  const latestDate = getAllDates().sort((a, b) => b.localeCompare(a))[0];

  els.productCount.textContent = data.products.length;
  els.customerCount.textContent = customers.length;
  els.priceCount.textContent = priceCount;
  els.lastUpdated.textContent = formatDate(latestDate);
  els.dataSource.textContent = isCloudReady ? "Supabase" : "離線";
  els.customerOptions.innerHTML = customers.map((customer) =>
    `<option value="${escapeHtml(customer)}"></option>`
  ).join("");
}

function renderProductList() {
  const products = getFilteredProducts();
  els.productList.innerHTML = "";
  els.resultCount.textContent = `${products.length} 筆`;

  if (!products.some((product) => product.id === selectedProductId)) {
    selectedProductId = products[0]?.id ?? null;
  }

  products.forEach((product) => {
    const node = els.productItemTemplate.content.firstElementChild.cloneNode(
      true,
    );
    const currentBase = getCurrentBase(product);
    node.classList.toggle("active", product.id === selectedProductId);
    node.querySelector("strong").textContent = product.name;
    node.querySelector("small").textContent =
      `${product.sku} · ${product.category} · ${product.sales.length} 位客戶`;
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
  els.detailMeta.textContent =
    `${product.category} · ${product.sales.length} 位客戶有設定售價`;
  els.detailBasePrice.textContent = currency(currentBase.price);
  els.detailBaseDate.textContent = formatDate(currentBase.date);
  els.detailRange.textContent = salePrices.length
    ? `${currency(minSale)} - ${currency(maxSale)}`
    : "尚未設定";

  renderSales(product, currentBase.price);
  renderTimeline(product);
}

function renderSales(product, basePrice) {
  els.salesTable.innerHTML = "";
  renderCustomerInitialFilter(product);

  if (!product.sales.length) {
    els.salesTable.innerHTML =
      `<tr><td class="empty-row" colspan="6">尚未設定客戶售價</td></tr>`;
    els.customerFilterCount.textContent = "0 筆";
    renderCustomerPagination(1);
    return;
  }

  const filteredSales = product.sales
    .filter((sale) =>
      !customerSearch ||
      sale.customer.toLowerCase().includes(customerSearch.toLowerCase())
    )
    .filter((sale) =>
      customerInitial === "all" ||
      customerInitialKey(sale.customer) === customerInitial
    );

  els.customerFilterCount.textContent =
    `${filteredSales.length} / ${product.sales.length} 筆`;

  if (!filteredSales.length) {
    els.salesTable.innerHTML =
      `<tr><td class="empty-row" colspan="6">沒有符合條件的客戶售價</td></tr>`;
    customerPage = 1;
    renderCustomerPagination(1);
    return;
  }

  const sortedSales = filteredSales
    .map((sale) => ({ sale, current: getCurrentSale(sale) }))
    .sort((a, b) => a.sale.customer.localeCompare(b.sale.customer, "zh-Hant"));
  const pageSize = customerPageSize === "all"
    ? sortedSales.length
    : Number(customerPageSize);
  const totalPages = customerPageSize === "all"
    ? 1
    : Math.max(1, Math.ceil(sortedSales.length / pageSize));
  customerPage = Math.min(customerPage, totalPages);
  const pageStart = customerPageSize === "all"
    ? 0
    : (customerPage - 1) * pageSize;
  const visibleSales = sortedSales.slice(pageStart, pageStart + pageSize);

  renderCustomerPagination(totalPages);

  visibleSales.forEach(({ sale, current }) => {
    const diff = current.price - basePrice;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${escapeHtml(sale.customer)}</td>
        <td><strong>${currency(current.price)}</strong></td>
        <td>${formatQuantity(current.quantity)}</td>
        <td>${formatDate(current.date)}</td>
        <td class="${diff >= 0 ? "margin-positive" : "margin-negative"}">${
      diff >= 0 ? "+" : ""
    }${currency(diff)}</td>
        <td><button class="secondary-button compact" data-customer="${
      escapeHtml(sale.customer)
    }">更新</button></td>
      `;
    tr.querySelector("button").addEventListener(
      "click",
      () => openSaleDialog(sale.customer, current.price, current.quantity),
    );
    els.salesTable.append(tr);
  });
}

function renderCustomerPagination(totalPages) {
  els.customerPageInfo.textContent = `第 ${customerPage} / ${totalPages} 頁`;
  els.customerPrevPage.disabled = customerPage <= 1;
  els.customerNextPage.disabled = customerPage >= totalPages;
}

function renderCustomerInitialFilter(product) {
  const initials = [
    ...new Set(product.sales.map((sale) => customerInitialKey(sale.customer))),
  ].sort((a, b) => a.localeCompare(b, "zh-Hant"));

  if (customerInitial !== "all" && !initials.includes(customerInitial)) {
    customerInitial = "all";
  }

  const buttons = [
    { key: "all", label: "全部" },
    ...initials.map((initial) => ({ key: initial, label: initial })),
  ];
  els.customerInitialFilter.innerHTML = buttons
    .map(
      (button) =>
        `<button class="${
          button.key === customerInitial ? "active" : ""
        }" data-initial="${escapeHtml(button.key)}">${
          escapeHtml(button.label)
        }</button>`,
    )
    .join("");
}

function renderTimeline(product) {
  const items = buildTimeline(product)
    .filter((item) => timelineMode === "all" || item.type === timelineMode)
    .filter((item) =>
      !timelineCustomerSearch ||
      (item.type === "sale" &&
        item.label.toLowerCase().includes(timelineCustomerSearch.toLowerCase()))
    )
    .filter((item) => !timelineStart || item.date >= timelineStart)
    .filter((item) => !timelineEnd || item.date <= timelineEnd)
    .sort((
      a,
      b,
    ) => (timelineSort === "asc"
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date))
    );
  els.timeline.innerHTML = "";

  if (!items.length) {
    els.timeline.innerHTML =
      `<div class="empty-row">沒有符合條件的時間紀錄</div>`;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "timeline-swipe";
    row.innerHTML = `
      <button class="timeline-delete-action" type="button" aria-label="刪除這筆時間紀錄">刪除</button>
      <div class="timeline-item">
        <div class="timeline-date">${formatDate(item.date)}</div>
        <div class="timeline-body">
          <strong>${escapeHtml(item.label)} · ${currency(item.price)}${
      item.type === "sale" && hasQuantity(item.quantity)
        ? ` · 數量 ${formatQuantity(item.quantity)}`
        : ""
    }</strong>
          <span>${escapeHtml(item.note)}</span>
        </div>
        <span class="badge ${item.type === "sale" ? "sale" : ""}">${
      item.type === "sale" ? "客戶售價" : "產品定價"
    }</span>
      </div>
    `;
    addTimelineSwipe(row, item);
    row.querySelector(".timeline-delete-action").addEventListener(
      "click",
      () => openDeleteTimelineDialog(item),
    );
    els.timeline.append(row);
  });
}

function addTimelineSwipe(row, item) {
  const content = row.querySelector(".timeline-item");
  const threshold = 72;
  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let openedBySwipe = false;

  content.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    startX = event.clientX;
    currentX = 0;
    isDragging = true;
    content.setPointerCapture(event.pointerId);
    content.classList.add("dragging");
  });

  content.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    currentX = Math.max(-96, Math.min(96, event.clientX - startX));
    content.style.transform = `translateX(${currentX}px)`;
  });

  content.addEventListener("pointerup", (event) => {
    if (!isDragging) return;
    isDragging = false;
    content.releasePointerCapture(event.pointerId);
    content.classList.remove("dragging");

    if (Math.abs(currentX) >= threshold) {
      row.classList.add("ready-delete");
      content.style.transform = `translateX(${currentX > 0 ? 86 : -86}px)`;
      openedBySwipe = true;
      return;
    }

    row.classList.remove("ready-delete");
    content.style.transform = "";
  });

  content.addEventListener("pointercancel", () => {
    isDragging = false;
    content.classList.remove("dragging");
    row.classList.remove("ready-delete");
    content.style.transform = "";
  });

  content.addEventListener("click", () => {
    if (openedBySwipe) {
      openedBySwipe = false;
      return;
    }
    if (!row.classList.contains("ready-delete")) return;
    row.classList.remove("ready-delete");
    content.style.transform = "";
  });

  row.dataset.timelineType = item.type;
}

function setQuickFilterState() {
  const parsed = commandParts(query);
  els.quickFilters.querySelectorAll("button").forEach((button) => {
    const buttonCommand = button.dataset.command.trim().replace("/", "");
    button.classList.toggle(
      "active",
      parsed.command === (buttonCommand || "all"),
    );
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

function openEditProductDialog() {
  const product = getSelectedProduct();
  if (!product) return;

  els.editProductForm.reset();
  els.editProductForm.elements.sku.value = product.sku;
  els.editProductForm.elements.name.value = product.name;
  els.editProductForm.elements.category.value = product.category;
  els.editProductDialog.showModal();
}

function openDeleteProductDialog() {
  const product = getSelectedProduct();
  if (!product) return;

  els.deleteProductMessage.textContent =
    `確定要刪除「${product.name}」嗎？此操作會一併移除產品定價、客戶售價和時間軸紀錄。`;
  els.deleteProductDialog.showModal();
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

function openSaleDialog(customer = "", price = "", quantity = "") {
  els.saleForm.reset();
  els.saleForm.elements.customer.value = customer;
  els.saleForm.elements.price.value = price;
  els.saleForm.elements.quantity.value = hasQuantity(quantity) ? quantity : "";
  els.saleForm.elements.date.value = today();
  els.saleDialog.showModal();
}

function getAiReplyInstructions() {
  return data.settings?.aiReplyInstructions?.trim() ||
    DEFAULT_AI_REPLY_INSTRUCTIONS;
}

function openAiSettingsDialog() {
  data = ensureDataShape(data);
  els.aiSettingsForm.reset();
  els.aiSettingsForm.elements.instructions.value = getAiReplyInstructions();
  els.aiSettingsDialog.showModal();
}

function saveAiSettingsFromForm() {
  data = ensureDataShape(data);
  data.settings.aiReplyInstructions =
    els.aiSettingsForm.elements.instructions.value.trim() ||
    DEFAULT_AI_REPLY_INSTRUCTIONS;
  saveData();
}

function resetAiSettingsToDefault() {
  data = ensureDataShape(data);
  data.settings.aiReplyInstructions = DEFAULT_AI_REPLY_INSTRUCTIONS;
  saveData();
}

function addProductFromForm() {
  const form = els.productForm.elements;
  const product = {
    id: `p-${crypto.randomUUID()}`,
    sku: form.sku.value.trim(),
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    updatedAt: today(),
    basePrices: [{
      price: Number(form.price.value),
      date: form.date.value,
      note: "初始定價",
    }],
    sales: [],
  };

  data.products.unshift(product);
  selectedProductId = product.id;
  saveData();
  render();
}

function updateProductFromForm() {
  const product = getSelectedProduct();
  if (!product) return;

  const form = els.editProductForm.elements;
  product.sku = form.sku.value.trim();
  product.name = form.name.value.trim();
  product.category = form.category.value.trim();
  markProductChanged(product);
  saveData();
  render();
}

function deleteSelectedProduct() {
  const product = getSelectedProduct();
  if (!product) return;

  const productIndex = data.products.findIndex((item) =>
    item.id === product.id
  );
  data.products = data.products.filter((item) => item.id !== product.id);
  selectedProductId =
    data.products[Math.min(productIndex, data.products.length - 1)]?.id ?? null;
  saveData();
  render();
}

function openDeleteTimelineDialog(item) {
  timelineDeleteTarget = item;
  const typeLabel = item.type === "sale"
    ? `客戶售價「${item.label}」`
    : "產品定價";
  els.deleteTimelineMessage.textContent = `確定要刪除 ${
    formatDate(item.date)
  } 的${typeLabel} ${
    currency(item.price)
  } 嗎？此操作會從時間軸和價格紀錄中移除。`;
  els.deleteTimelineDialog.showModal();
}

function deleteTimelineTarget() {
  const product = getSelectedProduct();
  if (!product || !timelineDeleteTarget) return;

  if (timelineDeleteTarget.type === "base") {
    product.basePrices.splice(timelineDeleteTarget.priceIndex, 1);
  }

  if (timelineDeleteTarget.type === "sale") {
    const sale = product.sales[timelineDeleteTarget.saleIndex];
    if (sale) {
      sale.prices.splice(timelineDeleteTarget.priceIndex, 1);
      if (!sale.prices.length) {
        product.sales.splice(timelineDeleteTarget.saleIndex, 1);
      }
    }
  }

  markProductChanged(product);
  timelineDeleteTarget = null;
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
  markProductChanged(product);
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
    quantity: normalizeQuantity(form.quantity.value),
    date: form.date.value,
    note: form.note.value.trim() || "客戶售價更新",
  });

  markProductChanged(product);
  saveData();
  render();
}

function ensureExcelReady() {
  if (window.XLSX) return true;
  alert("Excel 功能尚未載入完成，請重新整理頁面後再試一次。");
  return false;
}

function productRows() {
  return data.products.map((product) => ({
    product_id: product.id,
    SKU: product.sku,
    產品名稱: product.name,
    分類: product.category,
    最近異動: product.updatedAt || "",
  }));
}

function basePriceRows() {
  return data.products.flatMap((product) =>
    product.basePrices.map((entry) => ({
      product_id: product.id,
      SKU: product.sku,
      生效日期: entry.date,
      產品定價: Number(entry.price),
      備註: entry.note || "",
    }))
  );
}

function salePriceRows() {
  return data.products.flatMap((product) =>
    product.sales.flatMap((sale) =>
      sale.prices.map((entry) => ({
        product_id: product.id,
        SKU: product.sku,
        客戶: sale.customer,
        生效日期: entry.date,
        客戶售價: Number(entry.price),
        數量: hasQuantity(entry.quantity) ? Number(entry.quantity) : "",
        備註: entry.note || "",
      }))
    )
  );
}

function appendSheet(workbook, name, rows, headers) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.max(12, header.length * 2 + 4),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

function exportData() {
  if (!ensureExcelReady()) return;

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, "產品", productRows(), [
    "product_id",
    "SKU",
    "產品名稱",
    "分類",
    "最近異動",
  ]);
  appendSheet(workbook, "產品定價", basePriceRows(), [
    "product_id",
    "SKU",
    "生效日期",
    "產品定價",
    "備註",
  ]);
  appendSheet(workbook, "客戶售價", salePriceRows(), [
    "product_id",
    "SKU",
    "客戶",
    "生效日期",
    "客戶售價",
    "數量",
    "備註",
  ]);
  appendSheet(
    workbook,
    "使用說明",
    [
      {
        項目: "匯入方式",
        說明: "可直接編輯此 Excel 後匯入。匯入會以整份 Excel 取代目前資料。",
      },
      {
        項目: "新增產品",
        說明:
          "在「產品」填 SKU、產品名稱、分類；product_id 可留空，系統會自動建立。",
      },
      {
        項目: "新增產品定價",
        說明:
          "在「產品定價」填 SKU、生效日期、產品定價、備註。日期格式建議 yyyy-mm-dd。",
      },
      {
        項目: "新增客戶售價",
        說明:
          "在「客戶售價」填 SKU、客戶、生效日期、客戶售價、數量、備註。日期格式建議 yyyy-mm-dd，數量可留空。",
      },
      {
        項目: "對應規則",
        說明:
          "product_id 優先，其次用 SKU 對應產品。大量輸入時請保持 SKU 唯一。",
      },
    ],
    ["項目", "說明"],
  );

  XLSX.writeFile(workbook, `product-prices-${today()}.xlsx`);
}

function importData(file) {
  if (
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.name.toLowerCase().endsWith(".xls")
  ) {
    importExcelData(file);
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.products)) {
        throw new Error("Missing products");
      }
      data = ensureDataShape(imported);
      selectedProductId = data.products[0]?.id ?? null;
      saveData();
      render();
    } catch {
      alert("匯入失敗，請確認 JSON 格式是否正確。");
    }
  });
  reader.readAsText(file);
}

function normalizeHeader(value) {
  return String(value || "").trim();
}

function rowValue(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replaceAll("/", "-").replaceAll(".", "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${
      match[3].padStart(2, "0")
    }`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function normalizePrice(value) {
  const number = Number(String(value || "").replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizeQuantity(value) {
  const text = String(value ?? "").replaceAll(",", "").trim();
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) ? number : "";
}

function hasQuantity(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatQuantity(value) {
  if (!hasQuantity(value)) return "";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function makeProductId(sku) {
  const cleanSku = String(sku || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `p-${cleanSku || crypto.randomUUID()}`;
}

function sheetRows(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];
  return XLSX.utils
    .sheet_to_json(worksheet, { defval: "", raw: false })
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map((
          [key, value],
        ) => [normalizeHeader(key), value]),
      )
    );
}

function workbookToData(workbook) {
  const productsByKey = new Map();
  const products = [];

  sheetRows(workbook, "產品").forEach((row) => {
    const sku = String(rowValue(row, ["SKU", "sku"])).trim();
    const name = String(rowValue(row, ["產品名稱", "name"])).trim();
    if (!sku || !name) return;

    const id = String(rowValue(row, ["product_id", "產品ID", "id"])).trim() ||
      makeProductId(sku);
    const product = {
      id,
      sku,
      name,
      category: String(rowValue(row, ["分類", "category"])).trim() || "未分類",
      updatedAt: normalizeDate(rowValue(row, ["最近異動", "updatedAt"])) ||
        today(),
      basePrices: [],
      sales: [],
    };

    products.push(product);
    productsByKey.set(id, product);
    productsByKey.set(sku, product);
  });

  function findProduct(row) {
    const id = String(rowValue(row, ["product_id", "產品ID", "id"])).trim();
    const sku = String(rowValue(row, ["SKU", "sku"])).trim();
    return productsByKey.get(id) || productsByKey.get(sku);
  }

  sheetRows(workbook, "產品定價").forEach((row) => {
    const product = findProduct(row);
    const date = normalizeDate(rowValue(row, ["生效日期", "date"]));
    const price = normalizePrice(rowValue(row, ["產品定價", "price", "定價"]));
    if (!product || !date) return;

    product.basePrices.push({
      price,
      date,
      note: String(rowValue(row, ["備註", "note"])).trim() || "定價更新",
    });
  });

  sheetRows(workbook, "客戶售價").forEach((row) => {
    const product = findProduct(row);
    const customer = String(rowValue(row, ["客戶", "customer"])).trim();
    const date = normalizeDate(rowValue(row, ["生效日期", "date"]));
    const price = normalizePrice(rowValue(row, ["客戶售價", "price", "售價"]));
    if (!product || !customer || !date) return;

    let sale = product.sales.find((item) => item.customer === customer);
    if (!sale) {
      sale = { customer, prices: [] };
      product.sales.push(sale);
    }

    sale.prices.push({
      price,
      quantity: normalizeQuantity(
        rowValue(row, ["數量", "quantity", "銷貨數量"]),
      ),
      date,
      note: String(rowValue(row, ["備註", "note"])).trim() || "客戶售價更新",
    });
  });

  products.forEach((product) => {
    product.basePrices.sort((a, b) => a.date.localeCompare(b.date));
    product.sales.forEach((sale) =>
      sale.prices.sort((a, b) => a.date.localeCompare(b.date))
    );
    if (!product.basePrices.length) {
      product.basePrices.push({
        price: 0,
        date: today(),
        note: "匯入時未提供定價",
      });
    }
  });

  if (!products.length) throw new Error("Missing products");
  return { settings: data.settings ?? {}, products };
}

function importExcelData(file) {
  if (!ensureExcelReady()) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const workbook = XLSX.read(reader.result, {
        type: "array",
        cellDates: true,
      });
      data = workbookToData(workbook);
      selectedProductId = data.products[0]?.id ?? null;
      saveData();
      render();
    } catch {
      alert(
        "匯入失敗，請確認 Excel 內含「產品」、「產品定價」、「客戶售價」工作表，且必要欄位已填寫。",
      );
    }
  });
  reader.readAsArrayBuffer(file);
}

els.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dbClient) {
    showAuth("Supabase 尚未設定完成。");
    return;
  }
  const form = event.currentTarget.elements;
  signIn(form.email.value.trim(), form.password.value);
});

els.logoutBtn.addEventListener("click", signOut);

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

els.customerSearch.addEventListener("input", (event) => {
  customerSearch = event.target.value.trim();
  customerPage = 1;
  renderDetail();
});

els.customerInitialFilter.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  customerInitial = button.dataset.initial;
  customerPage = 1;
  renderDetail();
});

els.customerPageSize.addEventListener("change", (event) => {
  customerPageSize = event.target.value === "all"
    ? "all"
    : Number(event.target.value);
  customerPage = 1;
  renderDetail();
});

els.customerPrevPage.addEventListener("click", () => {
  customerPage = Math.max(1, customerPage - 1);
  renderDetail();
});

els.customerNextPage.addEventListener("click", () => {
  customerPage += 1;
  renderDetail();
});

els.timelineMode.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  timelineMode = button.dataset.mode;
  els.timelineMode.querySelectorAll("button").forEach((item) =>
    item.classList.toggle("active", item === button)
  );
  renderDetail();
});

els.timelineSort.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  timelineSort = button.dataset.sort;
  els.timelineSort.querySelectorAll("button").forEach((item) =>
    item.classList.toggle("active", item === button)
  );
  renderDetail();
});

els.timelineCustomerSearch.addEventListener("input", (event) => {
  timelineCustomerSearch = event.target.value.trim();
  renderDetail();
});

els.timelineStart.addEventListener("change", (event) => {
  timelineStart = event.target.value;
  renderDetail();
});

els.timelineEnd.addEventListener("change", (event) => {
  timelineEnd = event.target.value;
  renderDetail();
});

els.clearTimelineRange.addEventListener("click", () => {
  timelineStart = "";
  timelineEnd = "";
  els.timelineStart.value = "";
  els.timelineEnd.value = "";
  renderDetail();
});

els.addProductBtn.addEventListener("click", openProductDialog);
els.editProductBtn.addEventListener("click", openEditProductDialog);
els.deleteProductBtn.addEventListener("click", openDeleteProductDialog);
els.updateBaseBtn.addEventListener("click", openBaseDialog);
els.addSaleBtn.addEventListener("click", () => openSaleDialog());
els.exportBtn.addEventListener("click", exportData);
els.aiSettingsBtn.addEventListener("click", openAiSettingsDialog);
els.importFile.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importData(file);
  event.target.value = "";
});

els.productDialog.addEventListener("close", () => {
  if (els.productDialog.returnValue === "confirm") addProductFromForm();
});

els.editProductDialog.addEventListener("close", () => {
  if (els.editProductDialog.returnValue === "confirm") updateProductFromForm();
});

els.deleteProductDialog.addEventListener("close", () => {
  if (els.deleteProductDialog.returnValue === "confirm") {
    deleteSelectedProduct();
  }
});

els.deleteTimelineDialog.addEventListener("close", () => {
  if (els.deleteTimelineDialog.returnValue === "confirm") {
    deleteTimelineTarget();
    return;
  }

  timelineDeleteTarget = null;
});

els.basePriceDialog.addEventListener("close", () => {
  if (els.basePriceDialog.returnValue === "confirm") updateBaseFromForm();
});

els.saleDialog.addEventListener("close", () => {
  if (els.saleDialog.returnValue === "confirm") updateSaleFromForm();
});

els.resetPasswordDialog.addEventListener("close", async () => {
  if (els.resetPasswordDialog.returnValue !== "confirm") return;

  const updated = await updateRecoveredPassword();
  if (!updated) {
    requestAnimationFrame(() => els.resetPasswordDialog.showModal());
    return;
  }

  const { data: sessionData, error } = await dbClient.auth.getSession();
  if (error || !sessionData.session) {
    showAuth(error ? `讀取登入狀態失敗：${error.message}` : "");
    return;
  }

  const loaded = await loadCloudData(sessionData.session.user.id);
  if (loaded) {
    showApp();
    render();
  }
});

els.aiSettingsDialog.addEventListener("close", () => {
  if (els.aiSettingsDialog.returnValue === "confirm") saveAiSettingsFromForm();
  if (els.aiSettingsDialog.returnValue === "reset") resetAiSettingsToDefault();
});

render();
initDataSource();
