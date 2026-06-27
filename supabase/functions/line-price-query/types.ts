export interface PriceEntry {
  price: number;
  date: string;
  note?: string;
}

export interface CustomerSale {
  customer: string;
  prices: PriceEntry[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category?: string;
  basePrices: PriceEntry[];
  sales: CustomerSale[];
}

export interface PricebookPayload {
  products: Product[];
}

export type ParsedCommand =
  | {
    ok: true;
    customer: string;
    productQuery: string;
  }
  | {
    ok: false;
    message: string;
  };
