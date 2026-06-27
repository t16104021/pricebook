import type { PersonalReplyContext } from "./types.ts";

interface OpenAIResponse {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
    }>;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown;
      }>;
    };
  }>;
}

function formatCustomerPrice(context: PersonalReplyContext): string {
  return context.customerPrice === null
    ? "尚未設定"
    : `NT$${
      new Intl.NumberFormat("en-US").format(context.customerPrice.price)
    }`;
}

function personalReplyInstructions(): string {
  return [
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
}

function personalReplyPayload(context: PersonalReplyContext): string {
  return JSON.stringify({
    customer: context.customer,
    productSku: context.productSku,
    productName: context.productName,
    customerPrice: formatCustomerPrice(context),
    note: context.note,
  });
}

function extractText(body: OpenAIResponse): string | null {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return null;
}

function extractGeminiText(body: GeminiResponse): string | null {
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return null;
}

export async function createOpenAIPersonalReply(
  context: PersonalReplyContext,
  apiKey: string | undefined,
  model = "gpt-5-mini",
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey) return null;

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: personalReplyInstructions(),
        },
        {
          role: "user",
          content: personalReplyPayload(context),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const body = await response.json() as OpenAIResponse;
  return extractText(body);
}

export async function createGeminiPersonalReply(
  context: PersonalReplyContext,
  apiKey: string | undefined,
  model = "gemini-2.5-flash",
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey) return null;

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  );
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: personalReplyInstructions() }],
      },
      contents: [{
        role: "user",
        parts: [{ text: personalReplyPayload(context) }],
      }],
    }),
  });

  if (!response.ok) return null;

  const body = await response.json() as GeminiResponse;
  return extractGeminiText(body);
}
