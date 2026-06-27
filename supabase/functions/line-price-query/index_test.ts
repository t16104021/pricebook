import { assertEquals } from "jsr:@std/assert";
import {
  createDatabaseAdapter,
  createRuntimeHandler,
  createWebhookHandler,
  releaseFailedClaim,
  type WebhookDependencies,
} from "./index.ts";
import { createLineSignature } from "./line.ts";
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
  const released: string[] = [];
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
    releaseEvent: async (eventId) => {
      released.push(eventId);
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
    released,
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

Deno.test("treats non-object payloads and non-array events as empty", async () => {
  const { handler } = setup();
  const bodies = [
    "null",
    JSON.stringify("events"),
    JSON.stringify([]),
    JSON.stringify({ events: {} }),
  ];

  for (const body of bodies) {
    const response = await handler(post(body));
    assertEquals(response.status, 200);
    assertEquals(await response.text(), "OK");
  }
});

Deno.test("ignores unsupported and duplicate events", async () => {
  const claimCalls: string[] = [];
  let loadCalls = 0;
  const { handler, replies, released } = setup({
    claimEvent: async (eventId) => {
      claimCalls.push(eventId);
      return false;
    },
    loadPayload: async () => {
      loadCalls++;
      return payload;
    },
  });
  const response = await handler(post(JSON.stringify({
    events: [
      event({ type: "follow" }),
      event({ message: { type: "image" } }),
      event(),
    ],
  })));

  assertEquals(response.status, 200);
  assertEquals(claimCalls, ["evt-1"]);
  assertEquals(loadCalls, 0);
  assertEquals(replies, []);
  assertEquals(released, []);
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
  const { handler, replies, released } = setup();
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(replies[0].includes("產品定價：NT$1,200"), true);
  assertEquals(replies[0].includes("客戶售價：NT$980"), true);
  assertEquals(released, []);
});

Deno.test("releases a claimed event when payload loading fails", async () => {
  const { handler, released } = setup({
    loadPayload: async () => {
      throw new Error("temporary database failure");
    },
  });
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(released, ["evt-1"]);
});

Deno.test("releases a claimed event when replying fails", async () => {
  const { handler, released } = setup({
    reply: async () => {
      throw new Error("temporary LINE failure");
    },
  });
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(released, ["evt-1"]);
});

Deno.test("a release failure does not replace the original error", async () => {
  const original = new Error("original sensitive failure");
  let thrown: unknown;

  try {
    await releaseFailedClaim("evt-1", original, async () => {
      throw new Error("release failure");
    });
  } catch (error) {
    thrown = error;
  }

  assertEquals(thrown === original, true);
});

Deno.test("isolates rejected events and still returns 200", async () => {
  const originalError = console.error;
  const errors: unknown[] = [];
  console.error = (...values) => errors.push(values);
  try {
    const { handler } = setup({
      claimEvent: async () => {
        throw new Error(
          "secret message reply-token customer-price NT$980",
        );
      },
    });
    const response = await handler(post(JSON.stringify({
      events: [event(), event({ webhookEventId: "evt-2" })],
    })));

    assertEquals(response.status, 200);
    assertEquals(errors, [
      ["LINE webhook event failed"],
      ["LINE webhook event failed"],
    ]);
  } finally {
    console.error = originalError;
  }
});

Deno.test("database adapter handles claims, owner loads, and releases", async () => {
  const calls: unknown[] = [];
  let insertError: { code: string } | null = null;
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return {
        insert(value: unknown) {
          calls.push(["insert", value]);
          return Promise.resolve({ error: insertError });
        },
        delete() {
          calls.push(["delete"]);
          return {
            eq(column: string, value: string) {
              calls.push(["release-eq", column, value]);
              return Promise.resolve({ error: null });
            },
          };
        },
        select(column: string) {
          calls.push(["select", column]);
          return {
            eq(filterColumn: string, value: string) {
              calls.push(["load-eq", filterColumn, value]);
              return {
                single() {
                  calls.push(["single"]);
                  return Promise.resolve({ data: { payload }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  const adapter = createDatabaseAdapter(
    client as Parameters<typeof createDatabaseAdapter>[0],
    "owner-id",
  );

  assertEquals(await adapter.claimEvent("evt-1"), true);
  insertError = { code: "23505" };
  assertEquals(await adapter.claimEvent("evt-1"), false);
  assertEquals(await adapter.loadPayload(), payload);
  await adapter.releaseEvent("evt-1");
  assertEquals(calls, [
    ["from", "line_webhook_events"],
    ["insert", { event_id: "evt-1" }],
    ["from", "line_webhook_events"],
    ["insert", { event_id: "evt-1" }],
    ["from", "pricebook_data"],
    ["select", "payload"],
    ["load-eq", "id", "owner-id"],
    ["single"],
    ["from", "line_webhook_events"],
    ["delete"],
    ["release-eq", "event_id", "evt-1"],
  ]);
});

Deno.test("database adapter throws non-duplicate claim errors", async () => {
  const failure = { code: "XX000" };
  const client = {
    from() {
      return {
        insert() {
          return Promise.resolve({ error: failure });
        },
      };
    },
  };
  const adapter = createDatabaseAdapter(
    client as unknown as Parameters<typeof createDatabaseAdapter>[0],
    "owner-id",
  );
  let thrown: unknown;

  try {
    await adapter.claimEvent("evt-1");
  } catch (error) {
    thrown = error;
  }

  assertEquals(thrown === failure, true);
});

Deno.test("database adapter throws release errors", async () => {
  const failure = { code: "XX001" };
  const client = {
    from() {
      return {
        delete() {
          return {
            eq() {
              return Promise.resolve({ error: failure });
            },
          };
        },
      };
    },
  };
  const adapter = createDatabaseAdapter(
    client as unknown as Parameters<typeof createDatabaseAdapter>[0],
    "owner-id",
  );
  let thrown: unknown;

  try {
    await adapter.releaseEvent("evt-1");
  } catch (error) {
    thrown = error;
  }

  assertEquals(thrown === failure, true);
});

Deno.test("runtime configuration reports each missing environment variable", () => {
  const names = [
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "LINE_ALLOWED_USER_ID",
    "PRICEBOOK_OWNER_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const complete = Object.fromEntries(names.map((name) => [name, "value"]));

  for (const missing of names) {
    const env = { ...complete };
    delete env[missing];
    let thrown: unknown;
    try {
      createRuntimeHandler(
        (name) => env[name],
        () => {
          throw new Error("client factory should not run");
        },
      );
    } catch (error) {
      thrown = error;
    }

    assertEquals(
      thrown instanceof Error ? thrown.message : "",
      `Missing environment variable: ${missing}`,
    );
  }
});

Deno.test("runtime configuration wires secrets, owner, and service client", async () => {
  const env: Record<string, string> = {
    LINE_CHANNEL_SECRET: "channel-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "channel-token",
    LINE_ALLOWED_USER_ID: "allowed-user",
    PRICEBOOK_OWNER_ID: "owner-id",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };
  const clientCalls: unknown[] = [];
  const replyCalls: unknown[] = [];
  const client = {
    from(table: string) {
      clientCalls.push(["from", table]);
      return {
        insert(value: unknown) {
          clientCalls.push(["insert", value]);
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
        select(column: string) {
          clientCalls.push(["select", column]);
          return {
            eq(filterColumn: string, value: string) {
              clientCalls.push(["load-eq", filterColumn, value]);
              return {
                single() {
                  clientCalls.push(["single"]);
                  return Promise.resolve({ data: { payload }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  const handler = createRuntimeHandler(
    (name) => env[name],
    (url, key) => {
      clientCalls.push(["createClient", url, key]);
      return client as Parameters<typeof createDatabaseAdapter>[0];
    },
  );
  const rawBody = JSON.stringify({ events: [event()] });
  const signature = await createLineSignature(
    rawBody,
    env.LINE_CHANNEL_SECRET,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    replyCalls.push([
      init?.headers,
      typeof init?.body === "string" ? init.body : "",
    ]);
    return new Response("", { status: 200 });
  }) as typeof fetch;

  try {
    const response = await handler(post(rawBody, signature));
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(clientCalls, [
    [
      "createClient",
      "https://example.supabase.co",
      "service-role-key",
    ],
    ["from", "line_webhook_events"],
    ["insert", { event_id: "evt-1" }],
    ["from", "pricebook_data"],
    ["select", "payload"],
    ["load-eq", "id", "owner-id"],
    ["single"],
  ]);
  const [headers, replyBody] = replyCalls[0] as [
    Record<string, string>,
    string,
  ];
  assertEquals(headers.authorization, "Bearer channel-token");
  assertEquals(replyBody.includes("產品定價：NT$1,200"), true);
});
