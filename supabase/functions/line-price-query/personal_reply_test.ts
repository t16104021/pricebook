import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "jsr:@std/assert@1.0.19";

import {
  createGeminiPersonalReply,
  createOpenAIPersonalReply,
} from "./personal_reply.ts";

Deno.test("creates a personalized reply without sending base price or dates", async () => {
  let requestBody = "";
  const mockFetch = ((_url: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body);
    return Promise.resolve(
      Response.json({
        output_text:
          "長青商行您好，ABC-100 高效濾芯目前貴司售價是 NT$980，這邊先提供給您參考。",
      }),
    );
  }) as typeof fetch;

  const reply = await createOpenAIPersonalReply(
    {
      customer: "長青商行",
      productSku: "ABC-100",
      productName: "高效濾芯",
      customerPrice: { price: 980, date: "2026-06-27", note: "年度合約價" },
      note: "年度合約價",
    },
    "openai-key",
    "gpt-test",
    mockFetch,
  );

  assertEquals(
    reply,
    "長青商行您好，ABC-100 高效濾芯目前貴司售價是 NT$980，這邊先提供給您參考。",
  );
  assertStringIncludes(requestBody, "NT$980");
  assertStringIncludes(requestBody, "像 Jimmy 平常回客戶 LINE 的方式");
  assertStringIncludes(requestBody, "簡潔有力");
  assertStringIncludes(requestBody, "熱心、親和");
  assertFalse(requestBody.includes("不要太多稱謂"));
  assertFalse(requestBody.includes("避免使用「您好」「貴司」「親愛的」"));
  assertFalse(requestBody.includes("1200"));
  assertFalse(requestBody.includes("2026-06-27"));
});

Deno.test("skips personalized reply when no API key is configured", async () => {
  let fetchCalls = 0;
  const mockFetch = (() => {
    fetchCalls++;
    return Promise.resolve(Response.json({ output_text: "unused" }));
  }) as typeof fetch;

  const reply = await createOpenAIPersonalReply(
    {
      customer: "長青商行",
      productSku: "ABC-100",
      productName: "高效濾芯",
      customerPrice: { price: 980, date: "2026-06-27" },
      note: "無",
    },
    undefined,
    "gpt-test",
    mockFetch,
  );

  assertEquals(reply, null);
  assertEquals(fetchCalls, 0);
});

Deno.test("creates a Gemini personalized reply without sending base price or dates", async () => {
  let requestUrl = "";
  let requestBody = "";
  const mockFetch = ((url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestBody = String(init?.body);
    return Promise.resolve(
      Response.json({
        candidates: [{
          content: {
            parts: [{
              text:
                "長青商行您好，ABC-100 高效濾芯目前貴司售價是 NT$980，這邊先提供給您參考。",
            }],
          },
        }],
      }),
    );
  }) as typeof fetch;

  const reply = await createGeminiPersonalReply(
    {
      customer: "長青商行",
      productSku: "ABC-100",
      productName: "高效濾芯",
      customerPrice: { price: 980, date: "2026-06-27", note: "年度合約價" },
      note: "年度合約價",
    },
    "gemini-key",
    "gemini-test",
    mockFetch,
  );

  assertEquals(
    reply,
    "長青商行您好，ABC-100 高效濾芯目前貴司售價是 NT$980，這邊先提供給您參考。",
  );
  assertStringIncludes(
    requestUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
  );
  assertStringIncludes(requestUrl, "key=gemini-key");
  assertStringIncludes(requestBody, "NT$980");
  assertStringIncludes(requestBody, "像 Jimmy 平常回客戶 LINE 的方式");
  assertStringIncludes(requestBody, "簡潔有力");
  assertStringIncludes(requestBody, "熱心、親和");
  assertFalse(requestBody.includes("不要太多稱謂"));
  assertFalse(requestBody.includes("避免使用「您好」「貴司」「親愛的」"));
  assertFalse(requestBody.includes("1200"));
  assertFalse(requestBody.includes("2026-06-27"));
});

Deno.test("skips Gemini personalized reply when no API key is configured", async () => {
  let fetchCalls = 0;
  const mockFetch = (() => {
    fetchCalls++;
    return Promise.resolve(Response.json({}));
  }) as typeof fetch;

  const reply = await createGeminiPersonalReply(
    {
      customer: "長青商行",
      productSku: "ABC-100",
      productName: "高效濾芯",
      customerPrice: { price: 980, date: "2026-06-27" },
      note: "無",
    },
    undefined,
    "gemini-test",
    mockFetch,
  );

  assertEquals(reply, null);
  assertEquals(fetchCalls, 0);
});

Deno.test("uses custom AI reply instructions when configured", async () => {
  let requestBody = "";
  const mockFetch = ((_url: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body);
    return Promise.resolve(
      Response.json({
        candidates: [{
          content: {
            parts: [{ text: "ABC-100 目前優惠價 NT$980，先給您參考。" }],
          },
        }],
      }),
    );
  }) as typeof fetch;

  const reply = await createGeminiPersonalReply(
    {
      customer: "長青商行",
      productSku: "ABC-100",
      productName: "高效濾芯",
      customerPrice: { price: 980, date: "2026-06-27" },
      note: "無",
    },
    "gemini-key",
    "gemini-test",
    mockFetch,
    "自訂 AI 風格：超短句，不要稱謂。",
  );

  assertEquals(reply, "ABC-100 目前優惠價 NT$980，先給您參考。");
  assertStringIncludes(requestBody, "自訂 AI 風格：超短句，不要稱謂。");
  assertFalse(requestBody.includes("簡潔有力、熱心、親和"));
});
