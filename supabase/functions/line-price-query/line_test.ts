import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "jsr:@std/assert";

import {
  createLineSignature,
  replyToLine,
  verifyLineSignature,
} from "./line.ts";

Deno.test("accepts a valid LINE HMAC signature", async () => {
  assert(
    await verifyLineSignature(
      '{"events":[]}',
      "sKRrt+MTE71nWWZPaYrvYSdH9JGlgckmBidZxDuPgPc=",
      "test-channel-secret",
    ),
  );
});

Deno.test("rejects a changed body", async () => {
  const secret = "test-channel-secret";
  const signature = await createLineSignature('{"events":[]}', secret);

  assertFalse(
    await verifyLineSignature('{"events":[1]}', signature, secret),
  );
});

Deno.test("rejects an empty signature", async () => {
  assertFalse(
    await verifyLineSignature('{"events":[]}', "", "test-channel-secret"),
  );
});

Deno.test("sends a LINE reply request with bearer auth and JSON", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const mockFetch = ((url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  await replyToLine("reply-token", "查價結果", "access-token", mockFetch);

  assertEquals(
    capturedUrl,
    "https://api.line.me/v2/bot/message/reply",
  );
  assertEquals(capturedInit?.method, "POST");
  const headers = new Headers(capturedInit?.headers);
  assertEquals(headers.get("authorization"), "Bearer access-token");
  assertEquals(headers.get("content-type"), "application/json");
  assertEquals(
    JSON.parse(String(capturedInit?.body)),
    {
      replyToken: "reply-token",
      messages: [{ type: "text", text: "查價結果" }],
    },
  );
});

Deno.test("truncates LINE reply text to 5000 characters", async () => {
  let sentBody = "";
  const mockFetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sentBody = String(init?.body);
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  await replyToLine("reply-token", "x".repeat(5001), "access-token", mockFetch);

  assertEquals(JSON.parse(sentBody).messages[0].text, "x".repeat(5000));
});

Deno.test("does not split an emoji at the 5000 code-unit boundary", async () => {
  let sentBody = "";
  const mockFetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sentBody = String(init?.body);
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  await replyToLine(
    "reply-token",
    `${"x".repeat(4999)}😀tail`,
    "access-token",
    mockFetch,
  );

  assertEquals(JSON.parse(sentBody).messages[0].text, "x".repeat(4999));
});

Deno.test("reports LINE API errors without exposing the access token", async () => {
  const accessToken = "secret-access-token";
  const mockFetch = (() =>
    Promise.resolve(
      new Response(
        `{"message":"invalid reply token","token":"${accessToken}"}`,
        { status: 400 },
      ),
    )) as typeof fetch;

  let thrown: unknown;
  try {
    await replyToLine("reply-token", "text", accessToken, mockFetch);
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error);
  assertStringIncludes(thrown.message, "400");
  assertStringIncludes(thrown.message, "invalid reply token");
  assertFalse(thrown.message.includes(accessToken));
});
