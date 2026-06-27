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
  settings?: {
    aiReplyInstructions?: string;
  };
  products: Product[];
}

export interface PersonalReplyContext {
  customer: string;
  productSku: string;
  productName: string;
  customerPrice: PriceEntry | null;
  note: string;
  aiReplyInstructions?: string;
}

export type PricebookQueryResult =
  | {
    status: "found";
    standardReply: string;
    personalReplyContext: PersonalReplyContext;
  }
  | {
    status: "message";
    standardReply: string;
  };

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
