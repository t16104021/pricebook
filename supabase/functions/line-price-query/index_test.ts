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
    source: { type: "user", userId: "allowed-user" },
    message: { type: "text", text: "查價 長青商行 ABC-100" },
    ...overrides,
  };
}

function setup(overrides: Partial<WebhookDependencies> = {}) {
  const replies: string[] = [];
  const claimed: string[] = [];
  const completed: Array<[string, string]> = [];
  const released: Array<[string, string]> = [];
  const dependencies: WebhookDependencies = {
    channelSecret: "secret",
    channelAccessToken: "access-token",
    allowedUserId: "allowed-user",
    verifySignature: async (_body, signature, secret) =>
      signature === "valid" && secret === "secret",
    claimEvent: async (eventId) => {
      claimed.push(eventId);
      return `claim-token-${eventId}`;
    },
    completeEvent: async (eventId, claimToken) => {
      completed.push([eventId, claimToken]);
    },
    releaseEvent: async (eventId, claimToken) => {
      released.push([eventId, claimToken]);
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
    completed,
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
      return null;
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

Deno.test("ignores group and room events even when the user ID is allowed", async () => {
  let loadCalls = 0;
  const { handler, replies, claimed, completed, released } = setup({
    loadPayload: async () => {
      loadCalls++;
      return payload;
    },
  });
  const response = await handler(post(JSON.stringify({
    events: [
      event({
        webhookEventId: "group-event",
        source: { type: "group", userId: "allowed-user" },
      }),
      event({
        webhookEventId: "room-event",
        source: { type: "room", userId: "allowed-user" },
      }),
    ],
  })));

  assertEquals(response.status, 200);
  assertEquals(claimed, []);
  assertEquals(loadCalls, 0);
  assertEquals(replies, []);
  assertEquals(completed, []);
  assertEquals(released, []);
});

Deno.test("claims before rejecting an unauthorized user", async () => {
  const { handler, replies, claimed, completed } = setup();
  await handler(post(JSON.stringify({
    events: [event({ source: { type: "user", userId: "other-user" } })],
  })));

  assertEquals(claimed, ["evt-1"]);
  assertEquals(replies, ["此帳號沒有查價權限"]);
  assertEquals(completed, [["evt-1", "claim-token-evt-1"]]);
});

Deno.test("replies with usage for a malformed command", async () => {
  const { handler, replies, completed } = setup();
  await handler(post(JSON.stringify({
    events: [event({ message: { type: "text", text: "ABC-100" } })],
  })));

  assertEquals(replies, [
    "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100",
  ]);
  assertEquals(completed, [["evt-1", "claim-token-evt-1"]]);
});

Deno.test("loads the configured payload and replies with a price", async () => {
  const { handler, replies, completed, released } = setup();
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(replies[0].includes("產品定價：NT$1,200"), true);
  assertEquals(replies[0].includes("客戶售價：NT$980"), true);
  assertEquals(completed, [["evt-1", "claim-token-evt-1"]]);
  assertEquals(released, []);
});

Deno.test("completes after a safe reply when payload loading fails", async () => {
  const { handler, replies, completed, released } = setup({
    loadPayload: async () => {
      throw new Error("temporary database failure");
    },
  });
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(replies, ["查價服務暫時無法使用，請稍後再試"]);
  assertEquals(completed, [["evt-1", "claim-token-evt-1"]]);
  assertEquals(released, []);
});

Deno.test("completes when the safe fallback reply succeeds", async () => {
  let replyCalls = 0;
  const sentTexts: string[] = [];
  const { handler, completed, released } = setup({
    reply: async (_replyToken, text) => {
      replyCalls++;
      sentTexts.push(text);
      if (replyCalls === 1) {
        throw new Error("temporary LINE failure");
      }
    },
  });
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 200);
  assertEquals(sentTexts[1], "查價服務暫時無法使用，請稍後再試");
  assertEquals(completed, [["evt-1", "claim-token-evt-1"]]);
  assertEquals(released, []);
});

Deno.test("releases and returns 503 when both reply attempts fail", async () => {
  let replyCalls = 0;
  const { handler, completed, released } = setup({
    reply: async () => {
      replyCalls++;
      throw new Error("temporary LINE failure");
    },
  });
  const response = await handler(post(JSON.stringify({ events: [event()] })));

  assertEquals(response.status, 503);
  assertEquals(replyCalls, 2);
  assertEquals(completed, []);
  assertEquals(released, [["evt-1", "claim-token-evt-1"]]);
});

Deno.test("a release failure does not replace the original error", async () => {
  const original = new Error("original sensitive failure");
  let thrown: unknown;

  try {
    await releaseFailedClaim("evt-1", "claim-token", original, async () => {
      throw new Error("release failure");
    });
  } catch (error) {
    thrown = error;
  }

  assertEquals(thrown === original, true);
});

Deno.test("returns 503 when any event handler rejects", async () => {
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

    assertEquals(response.status, 503);
    assertEquals(errors, [
      ["LINE webhook event failed"],
      ["LINE webhook event failed"],
    ]);
  } finally {
    console.error = originalError;
  }
});

Deno.test("database adapter uses claim, complete, and release RPCs", async () => {
  const calls: unknown[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push(["rpc", name, args]);
      return Promise.resolve({
        data: name === "claim_line_webhook_event" ? "claim-token-1" : null,
        error: null,
      });
    },
    from(table: string) {
      calls.push(["from", table]);
      return {
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

  assertEquals(await adapter.claimEvent("evt-1"), "claim-token-1");
  await adapter.completeEvent("evt-1", "claim-token-1");
  await adapter.releaseEvent("evt-2", "claim-token-2");
  assertEquals(await adapter.loadPayload(), payload);
  assertEquals(calls, [
    ["rpc", "claim_line_webhook_event", { p_event_id: "evt-1" }],
    [
      "rpc",
      "complete_line_webhook_event",
      { p_event_id: "evt-1", p_claim_token: "claim-token-1" },
    ],
    [
      "rpc",
      "release_line_webhook_event",
      { p_event_id: "evt-2", p_claim_token: "claim-token-2" },
    ],
    ["from", "pricebook_data"],
    ["select", "payload"],
    ["load-eq", "id", "owner-id"],
    ["single"],
  ]);
});

Deno.test("an old claim token cannot complete or release a newer lease", async () => {
  let currentToken: string | null = "new-token";
  let status = "processing";
  const client = {
    rpc(name: string, args: {
      p_event_id: string;
      p_claim_token?: string;
    }) {
      if (name === "claim_line_webhook_event") {
        return Promise.resolve({ data: currentToken, error: null });
      }
      if (
        args.p_event_id === "evt-1" &&
        args.p_claim_token === currentToken &&
        status === "processing"
      ) {
        if (name === "complete_line_webhook_event") status = "completed";
        if (name === "release_line_webhook_event") {
          status = "released";
          currentToken = null;
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  const adapter = createDatabaseAdapter(
    client as Parameters<typeof createDatabaseAdapter>[0],
    "owner-id",
  );

  await adapter.completeEvent("evt-1", "old-token");
  await adapter.releaseEvent("evt-1", "old-token");
  assertEquals(status, "processing");
  assertEquals(currentToken, "new-token");

  await adapter.completeEvent("evt-1", "new-token");
  assertEquals(status, "completed");
});

Deno.test("database adapter throws RPC errors", async () => {
  const failure = { code: "XX000" };
  const client = {
    rpc() {
      return Promise.resolve({ data: null, error: failure });
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
    rpc(name: string, args: unknown) {
      clientCalls.push(["rpc", name, args]);
      return Promise.resolve({
        data: name === "claim_line_webhook_event" ? "runtime-token" : null,
        error: null,
      });
    },
    from(table: string) {
      clientCalls.push(["from", table]);
      return {
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
    ["rpc", "claim_line_webhook_event", { p_event_id: "evt-1" }],
    ["from", "pricebook_data"],
    ["select", "payload"],
    ["load-eq", "id", "owner-id"],
    ["single"],
    [
      "rpc",
      "complete_line_webhook_event",
      { p_event_id: "evt-1", p_claim_token: "runtime-token" },
    ],
  ]);
  const [headers, replyBody] = replyCalls[0] as [
    Record<string, string>,
    string,
  ];
  assertEquals(headers.authorization, "Bearer channel-token");
  assertEquals(replyBody.includes("產品定價：NT$1,200"), true);
});

Deno.test("initial webhook migration remains unchanged", async () => {
  const sql = await Deno.readTextFile(new URL(
    "../../migrations/202606270001_create_line_webhook_events.sql",
    import.meta.url,
  ));
  const expected = `create table if not exists public.line_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.line_webhook_events enable row level security;

comment on table public.line_webhook_events is
  'Processed LINE webhook event IDs. Only the service role may access this table.';

create index if not exists line_webhook_events_processed_at_idx
  on public.line_webhook_events (processed_at);
`;

  assertEquals(sql, expected);
});

Deno.test("upgrade migration defines fenced and locked-down webhook RPCs", async () => {
  const sql = await Deno.readTextFile(new URL(
    "../../migrations/202606270002_upgrade_line_webhook_events.sql",
    import.meta.url,
  ));
  const requiredPatterns = [
    /add column if not exists status text/i,
    /add column if not exists claimed_at timestamptz/i,
    /add column if not exists claim_token text/i,
    /set status = 'completed'[\s\S]*where status is null/i,
    /alter column claimed_at set default now\(\)/i,
    /alter column processed_at drop not null/i,
    /check[\s\S]*status in \('processing', 'completed'\)/i,
    /status = 'processing'[\s\S]*claim_token is not null/i,
    /claim_line_webhook_event\(p_event_id text\)[\s\S]*returns text/i,
    /gen_random_uuid\(\)::text/i,
    /create unique index if not exists line_webhook_events_claim_token_idx[\s\S]*on public\.line_webhook_events \(claim_token\)[\s\S]*where claim_token is not null/i,
    /status = 'processing'[\s\S]*claimed_at < now\(\) - interval '5 minutes'[\s\S]*claim_token/i,
    /processed_at < now\(\) - interval '30 days'/i,
    /complete_line_webhook_event\(\s*p_event_id text,\s*p_claim_token text\s*\)/i,
    /complete_line_webhook_event[\s\S]*where event_id = p_event_id[\s\S]*claim_token = p_claim_token[\s\S]*status = 'processing'/i,
    /release_line_webhook_event\(\s*p_event_id text,\s*p_claim_token text\s*\)/i,
    /release_line_webhook_event[\s\S]*where event_id = p_event_id[\s\S]*claim_token = p_claim_token[\s\S]*status = 'processing'/i,
    /security definer[\s\S]*set search_path = pg_catalog\s*(?:\n|$)/i,
    /revoke execute on function public\.claim_line_webhook_event\(text\)[\s\S]*from public, anon, authenticated/i,
    /revoke execute on function public\.complete_line_webhook_event\(text, text\)[\s\S]*from public, anon, authenticated/i,
    /revoke execute on function public\.release_line_webhook_event\(text, text\)[\s\S]*from public, anon, authenticated/i,
    /grant execute on function public\.claim_line_webhook_event\(text\)[\s\S]*to service_role/i,
    /grant execute on function public\.complete_line_webhook_event\(text, text\)[\s\S]*to service_role/i,
    /grant execute on function public\.release_line_webhook_event\(text, text\)[\s\S]*to service_role/i,
  ];

  for (const pattern of requiredPatterns) {
    assertEquals(pattern.test(sql), true, `Missing SQL pattern: ${pattern}`);
  }
});

Deno.test("LINE setup documents redelivery and dedup retention", async () => {
  const guide = await Deno.readTextFile(new URL(
    "../../../LINE-BOT.md",
    import.meta.url,
  ));

  assertEquals(guide.includes("Webhook redelivery"), true);
  assertEquals(guide.includes("5 分鐘"), true);
  assertEquals(guide.includes("30 天"), true);
});
