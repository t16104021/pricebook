import type {
  PricebookPayload,
  PricebookQueryResult,
  PriceEntry,
  Product,
} from "./types.ts";

function latest(entries: PriceEntry[]): PriceEntry | null {
  return entries.reduce<PriceEntry | null>(
    (current, entry) =>
      current === null || entry.date.localeCompare(current.date) >= 0
        ? entry
        : current,
    null,
  );
}

function productLabel(product: Product): string {
  return `${product.sku} ${product.name}`.trim();
}

function formatPrice(entry: PriceEntry | null): string {
  return entry === null
    ? "尚未設定"
    : `NT$${new Intl.NumberFormat("en-US").format(entry.price)}`;
}

function formatDate(entry: PriceEntry | null): string {
  return entry === null ? "尚未設定" : entry.date.replaceAll("-", "/");
}

export function queryPricebook(
  payload: PricebookPayload,
  customer: string,
  productQuery: string,
): string {
  return queryPricebookResult(payload, customer, productQuery).standardReply;
}

export function queryPricebookResult(
  payload: PricebookPayload,
  customer: string,
  productQuery: string,
): PricebookQueryResult {
  const customerExists = payload.products.some((product) =>
    product.sales.some((sale) => sale.customer === customer)
  );
  if (!customerExists) {
    return { status: "message", standardReply: `查無客戶：${customer}` };
  }

  const normalizedQuery = productQuery.toLocaleLowerCase();
  const exactMatches = payload.products.filter(
    (product) => product.sku.toLocaleLowerCase() === normalizedQuery,
  );
  const matches = exactMatches.length > 0
    ? exactMatches
    : payload.products.filter((product) =>
      product.sku.toLocaleLowerCase().includes(normalizedQuery) ||
      product.name.toLocaleLowerCase().includes(normalizedQuery)
    );

  if (matches.length === 0) {
    return { status: "message", standardReply: `查無產品：${productQuery}` };
  }

  if (matches.length > 1) {
    const candidates = matches.slice(0, 10).map(
      (product, index) => `${index + 1}. ${productLabel(product)}`,
    );
    const prompt = matches.length > 10
      ? `另有 ${matches.length - 10} 筆，請輸入更多產品編號字元。`
      : "請輸入完整產品編號。";

    return {
      status: "message",
      standardReply: [
        `找到 ${matches.length} 個產品：`,
        ...candidates,
        "",
        prompt,
      ].join("\n"),
    };
  }

  const product = matches[0];
  const basePrice = latest(product.basePrices);
  const customerSale = product.sales.find((sale) => sale.customer === customer);
  const customerPrice = latest(customerSale?.prices ?? []);

  const note = customerPrice?.note || "無";
  const standardReply = [
    `客戶：${customer}`,
    `產品：${productLabel(product)}`,
    `產品定價：${formatPrice(basePrice)}`,
    `定價日期：${formatDate(basePrice)}`,
    `客戶售價：${formatPrice(customerPrice)}`,
    `售價日期：${formatDate(customerPrice)}`,
    `備註：${note}`,
  ].join("\n");

  return {
    status: "found",
    standardReply,
    personalReplyContext: {
      customer,
      productSku: product.sku,
      productName: product.name,
      customerPrice,
      note,
      ...(payload.settings?.aiReplyInstructions
        ? { aiReplyInstructions: payload.settings.aiReplyInstructions }
        : {}),
    },
  };
}
