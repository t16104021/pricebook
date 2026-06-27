import { assertEquals } from "jsr:@std/assert";
import {
  createWebhookHandler,
  type WebhookDependencies,
} from "./index.ts";
import type { PricebookPayload } from "./types.ts";

const payload: PricebookPayload = {
  products: [{
    id: "1",
    sku: "ABC-100",
    name: "高效濾芯",
    basePrices: [{ price: 1200, date: "2026-06-01" }],
    sales: [{
      customer: "長青商行",
      prices: [{ price: 980, date: "2026-06-27" }],
    }],
  }],
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    webhookEventId: "evt-1",
    type: "message",
    replyToken: "reply-1",
    source: { userId: "allowed-user" },
    message: { type: "text", text: "查價 長青商行 ABC-100" },
    ...overrides,
  };
}

function setup(overrides: Partial<WebhookDependencies> = {}) {
  const replies: string[] = [];
  const claimed: string[] = [];
  const dependencies: WebhookDependencies = {
    channelSecret: "secret",
    channelAccessToken: "access-token",
    allowedUserId: "allowed-user",
    verifySignature: async (_body, signature, secret) =>
      signature === "valid" && secret === "secret",
    claimEvent: async (eventId) => {
      claimed.push(eventId);
      return true;
    },
    loadPayload: async () => payload,
    reply: async (_replyToken, text) => {
      replies.push(text);
    },
    ...overrides,
  };

  return {
    handler: createWebhookHandler(dependencies),
    replies,
    claimed,
  };
}

function post(body: string, signature = "valid"): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body,
  });
}

Deno.test("allows only POST", async () => {
  const { handler } = setup();
  const response = await handler(new Request("http://localhost"));
  assertEquals(response.status, 405);
});

Deno.test("verifies the raw body before parsing JSON", async () => {
  const { handler } = setup();
  const response = await handler(post("{", "invalid"));
  assertEquals(response.status, 401);
});

Deno.test("returns 400 for signed invalid JSON", async () => {
  const { handler } = setup();
  const response = await handler(post("{"));
  assertEquals(response.status, 400);
});

Deno.test("ignores unsupported and duplicate events", async () => {
  const { handler, replies, claimed } = setup({
    claimEvent: async () => false,
  });
  const response = await handler(post(JSON.stringify({
    events: [
      event({ type: "follow" }),
      event({ message: { type: "image" } }),
      event(),
    ],
  })));

  assertEquals(response.status, 200);
  assertEquals(claimed, []);
  assertEquals(replies, []);
});

Deno.test("claims before rejecting an unauthorized user", async () => {
  const { handler, replies, claimed } = setup();
  await handler(post(JSON.stringify({
    events: [event({ source: { userId: "other-user" } })],
  })));

  assertEquals(claimed, ["evt-1"]);
  assertEquals(replies, ["此帳號沒有查價權限"]);
});

Deno.test("replies with usage for a malformed command", async () => {
  const { handler, replies } = setup();
  await handler(post(JSON.stringify({
    events: [event({ message: { type: "text", text: "ABC-100" } })],
  })));

  assertEquals(replies, [
    "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100",
  ]);
});

Deno.test("loads the configured payload and replies with a price", async () => {
  const { handler, replies } = setup();
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(replies[0].includes("產品定價：NT$1,200"), true);
  assertEquals(replies[0].includes("客戶售價：NT$980"), true);
});

Deno.test("isolates rejected events and still returns 200", async () => {
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (reason) => errors.push(reason);
  try {
    const { handler } = setup({
      claimEvent: async () => {
        throw new Error("database unavailable");
      },
    });
    const response = await handler(post(JSON.stringify({
      events: [event(), event({ webhookEventId: "evt-2" })],
    })));

    assertEquals(response.status, 200);
    assertEquals(errors.length, 2);
  } finally {
    console.error = originalError;
  }
});
