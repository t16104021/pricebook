# LINE Price Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secured LINE Official Account webhook that lets one authorized LINE user query the existing Supabase pricebook with `查價 客戶名稱 產品編號`.

**Architecture:** A public Supabase Edge Function verifies the LINE signature and authorized user ID, then loads one configured `pricebook_data.payload` row with the service-role client. Pure TypeScript modules parse commands, search the pricebook, and format replies; a small database table records processed LINE webhook IDs to prevent duplicate replies.

**Tech Stack:** Supabase Edge Functions, Deno TypeScript, Supabase Postgres, LINE Messaging API, Deno tests

---

## File Structure

- Create `supabase/config.toml`: marks the LINE webhook as a public function whose requests are authenticated by LINE signatures instead of Supabase JWTs.
- Create `supabase/functions/line-price-query/types.ts`: shared pricebook and query result types.
- Create `supabase/functions/line-price-query/command.ts`: deterministic command parsing.
- Create `supabase/functions/line-price-query/command_test.ts`: parser tests.
- Create `supabase/functions/line-price-query/pricebook.ts`: customer/product lookup and reply formatting.
- Create `supabase/functions/line-price-query/pricebook_test.ts`: pricebook behavior tests.
- Create `supabase/functions/line-price-query/line.ts`: LINE signature verification and Reply API client.
- Create `supabase/functions/line-price-query/line_test.ts`: signature tests.
- Create `supabase/functions/line-price-query/index.ts`: webhook orchestration, authorization, database access, deduplication, and safe failures.
- Create `supabase/migrations/202606270001_create_line_webhook_events.sql`: webhook deduplication table and policies.
- Create `LINE-BOT.md`: exact setup, secret, deployment, and phone verification instructions.

### Task 1: Configure the Public Edge Function

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Add the local Supabase function configuration**

```toml
project_id = "fuhzrbbyqoojjguiuijf"

[functions.line-price-query]
verify_jwt = false
```

`verify_jwt` must be false because LINE sends its own `x-line-signature`, not a Supabase access token. The function will reject invalid LINE signatures itself.

- [ ] **Step 2: Validate the configuration**

Run:

```bash
supabase functions list --project-ref fuhzrbbyqoojjguiuijf
```

Expected: the CLI can contact project `fuhzrbbyqoojjguiuijf`; `line-price-query` does not need to exist yet.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "Configure LINE webhook function"
```

### Task 2: Parse the Price Query Command

**Files:**
- Create: `supabase/functions/line-price-query/types.ts`
- Create: `supabase/functions/line-price-query/command.ts`
- Create: `supabase/functions/line-price-query/command_test.ts`

- [ ] **Step 1: Define shared types**

```ts
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
  | { ok: true; customer: string; productQuery: string }
  | { ok: false; message: string };
```

- [ ] **Step 2: Write failing parser tests**

```ts
import { assertEquals } from "jsr:@std/assert";
import { parseCommand } from "./command.ts";

Deno.test("parses a normal query", () => {
  assertEquals(parseCommand("查價 長青商行 ABC-100"), {
    ok: true,
    customer: "長青商行",
    productQuery: "ABC-100",
  });
});

Deno.test("collapses extra whitespace", () => {
  assertEquals(parseCommand("  查價   長青商行   ABC-100  "), {
    ok: true,
    customer: "長青商行",
    productQuery: "ABC-100",
  });
});

Deno.test("supports quoted values containing spaces", () => {
  assertEquals(parseCommand('查價 "Great North Co" "ABC 100"'), {
    ok: true,
    customer: "Great North Co",
    productQuery: "ABC 100",
  });
});

Deno.test("rejects malformed input with usage text", () => {
  assertEquals(parseCommand("ABC-100"), {
    ok: false,
    message: "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100",
  });
});
```

- [ ] **Step 3: Run the parser tests and confirm failure**

Run:

```bash
deno test supabase/functions/line-price-query/command_test.ts
```

Expected: FAIL because `command.ts` does not exist.

- [ ] **Step 4: Implement the parser**

```ts
import type { ParsedCommand } from "./types.ts";

const USAGE = "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100";

function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  let consumed = "";

  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2]);
    consumed += match[0];
  }

  const nonWhitespaceInput = input.replace(/\s/g, "");
  const nonWhitespaceConsumed = consumed.replace(/\s/g, "");
  return nonWhitespaceInput === nonWhitespaceConsumed ? tokens : null;
}

export function parseCommand(input: string): ParsedCommand {
  const tokens = tokenize(input.trim());
  if (!tokens || tokens.length !== 3 || tokens[0] !== "查價") {
    return { ok: false, message: USAGE };
  }

  return {
    ok: true,
    customer: tokens[1].trim(),
    productQuery: tokens[2].trim(),
  };
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
deno test supabase/functions/line-price-query/command_test.ts
```

Expected: 4 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/line-price-query/types.ts \
  supabase/functions/line-price-query/command.ts \
  supabase/functions/line-price-query/command_test.ts
git commit -m "Add LINE price query parser"
```

### Task 3: Search and Format Pricebook Results

**Files:**
- Create: `supabase/functions/line-price-query/pricebook.ts`
- Create: `supabase/functions/line-price-query/pricebook_test.ts`

- [ ] **Step 1: Write tests for exact, partial, missing, and unset prices**

```ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { queryPricebook } from "./pricebook.ts";
import type { PricebookPayload } from "./types.ts";

const payload: PricebookPayload = {
  products: [
    {
      id: "1",
      sku: "ABC-100",
      name: "高效濾芯",
      basePrices: [
        { price: 1100, date: "2026-01-01", note: "舊價" },
        { price: 1200, date: "2026-06-01" },
      ],
      sales: [{
        customer: "長青商行",
        prices: [{ price: 980, date: "2026-06-27", note: "年度合約價" }],
      }],
    },
    {
      id: "2",
      sku: "ABC-200",
      name: "標準濾芯",
      basePrices: [],
      sales: [],
    },
  ],
};

Deno.test("returns the latest complete internal price reply", () => {
  const reply = queryPricebook(payload, "長青商行", "ABC-100");
  assertStringIncludes(reply, "客戶：長青商行");
  assertStringIncludes(reply, "產品：ABC-100 高效濾芯");
  assertStringIncludes(reply, "產品定價：NT$1,200");
  assertStringIncludes(reply, "定價日期：2026/06/01");
  assertStringIncludes(reply, "客戶售價：NT$980");
  assertStringIncludes(reply, "備註：年度合約價");
});

Deno.test("lists candidates for a partial product match", () => {
  assertEquals(
    queryPricebook(payload, "長青商行", "ABC"),
    "找到 2 個產品：\n1. ABC-100 高效濾芯\n2. ABC-200 標準濾芯\n\n請輸入完整產品編號。",
  );
});

Deno.test("reports a missing customer before exposing prices", () => {
  assertEquals(queryPricebook(payload, "不存在", "ABC-100"), "查無客戶：不存在");
});

Deno.test("shows unset customer pricing without hiding base price", () => {
  const reply = queryPricebook(payload, "長青商行", "ABC-200");
  assertStringIncludes(reply, "產品定價：尚未設定");
  assertStringIncludes(reply, "客戶售價：尚未設定");
});

Deno.test("reports a missing product", () => {
  assertEquals(queryPricebook(payload, "長青商行", "ZZZ"), "查無產品：ZZZ");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
deno test supabase/functions/line-price-query/pricebook_test.ts
```

Expected: FAIL because `pricebook.ts` does not exist.

- [ ] **Step 3: Implement deterministic lookup and formatting**

```ts
import type { PricebookPayload, PriceEntry, Product } from "./types.ts";

function latest(entries: PriceEntry[]): PriceEntry | null {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function money(value: number): string {
  return `NT$${new Intl.NumberFormat("en-US").format(value)}`;
}

function displayDate(value: string): string {
  return value ? value.replaceAll("-", "/") : "尚未設定";
}

function productLabel(product: Product): string {
  return `${product.sku} ${product.name}`.trim();
}

export function queryPricebook(
  payload: PricebookPayload,
  customer: string,
  productQuery: string,
): string {
  const customerExists = payload.products.some((product) =>
    product.sales.some((sale) => sale.customer === customer)
  );
  if (!customerExists) return `查無客戶：${customer}`;

  const normalized = productQuery.toLocaleLowerCase();
  const exact = payload.products.find(
    (product) => product.sku.toLocaleLowerCase() === normalized,
  );
  const matches = exact
    ? [exact]
    : payload.products.filter((product) =>
      product.sku.toLocaleLowerCase().includes(normalized) ||
      product.name.toLocaleLowerCase().includes(normalized)
    );

  if (matches.length === 0) return `查無產品：${productQuery}`;
  if (matches.length > 1) {
    const visible = matches.slice(0, 10);
    const suffix = matches.length > 10
      ? `\n\n另有 ${matches.length - 10} 筆，請輸入更多產品編號字元。`
      : "\n\n請輸入完整產品編號。";
    return `找到 ${matches.length} 個產品：\n${
      visible.map((product, index) => `${index + 1}. ${productLabel(product)}`).join("\n")
    }${suffix}`;
  }

  const product = matches[0];
  const base = latest(product.basePrices);
  const sale = product.sales.find((entry) => entry.customer === customer);
  const customerPrice = sale ? latest(sale.prices) : null;

  return [
    `客戶：${customer}`,
    `產品：${productLabel(product)}`,
    `產品定價：${base ? money(base.price) : "尚未設定"}`,
    `定價日期：${base ? displayDate(base.date) : "尚未設定"}`,
    `客戶售價：${customerPrice ? money(customerPrice.price) : "尚未設定"}`,
    `售價日期：${customerPrice ? displayDate(customerPrice.date) : "尚未設定"}`,
    `備註：${customerPrice?.note || "無"}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run pricebook tests**

Run:

```bash
deno test supabase/functions/line-price-query/pricebook_test.ts
```

Expected: 5 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-price-query/pricebook.ts \
  supabase/functions/line-price-query/pricebook_test.ts
git commit -m "Add pricebook query behavior"
```

### Task 4: Verify LINE Signatures and Send Replies

**Files:**
- Create: `supabase/functions/line-price-query/line.ts`
- Create: `supabase/functions/line-price-query/line_test.ts`

- [ ] **Step 1: Write a signature verification test using a fixed fixture**

```ts
import { assert, assertFalse } from "jsr:@std/assert";
import { createLineSignature, verifyLineSignature } from "./line.ts";

Deno.test("accepts a valid LINE HMAC signature", async () => {
  const body = '{"events":[]}';
  const secret = "test-channel-secret";
  const signature = await createLineSignature(body, secret);
  assert(await verifyLineSignature(body, signature, secret));
});

Deno.test("rejects a changed body", async () => {
  const secret = "test-channel-secret";
  const signature = await createLineSignature('{"events":[]}', secret);
  assertFalse(await verifyLineSignature('{"events":[1]}', signature, secret));
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
deno test supabase/functions/line-price-query/line_test.ts
```

Expected: FAIL because `line.ts` does not exist.

- [ ] **Step 3: Implement HMAC verification and Reply API client**

```ts
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function createLineSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyLineSignature(
  body: string,
  received: string,
  secret: string,
): Promise<boolean> {
  if (!received) return false;
  return (await createLineSignature(body, secret)) === received;
}

export async function replyToLine(
  replyToken: string,
  text: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: text.slice(0, 5000) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE Reply API failed: ${response.status} ${await response.text()}`);
  }
}
```

- [ ] **Step 4: Run signature tests**

Run:

```bash
deno test supabase/functions/line-price-query/line_test.ts
```

Expected: 2 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/line-price-query/line.ts \
  supabase/functions/line-price-query/line_test.ts
git commit -m "Add LINE signature and reply helpers"
```

### Task 5: Add Webhook Deduplication Storage

**Files:**
- Create: `supabase/migrations/202606270001_create_line_webhook_events.sql`

- [ ] **Step 1: Add the migration**

```sql
create table if not exists public.line_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.line_webhook_events enable row level security;

comment on table public.line_webhook_events is
  'Processed LINE webhook event IDs. Only the service role may access this table.';

create index if not exists line_webhook_events_processed_at_idx
  on public.line_webhook_events (processed_at);
```

Do not create anon or authenticated policies. The Edge Function service-role client bypasses RLS; browser clients remain blocked.

- [ ] **Step 2: Validate migration syntax locally**

Run:

```bash
supabase db reset
```

Expected: local database resets successfully and creates `public.line_webhook_events`.

- [ ] **Step 3: Apply the migration to the linked project**

Run:

```bash
supabase db push --project-ref fuhzrbbyqoojjguiuijf
```

Expected: migration `202606270001_create_line_webhook_events.sql` is applied once.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202606270001_create_line_webhook_events.sql
git commit -m "Add LINE webhook deduplication table"
```

### Task 6: Orchestrate the Webhook

**Files:**
- Create: `supabase/functions/line-price-query/index.ts`

- [ ] **Step 1: Implement the Edge Function entry point**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseCommand } from "./command.ts";
import { replyToLine, verifyLineSignature } from "./line.ts";
import { queryPricebook } from "./pricebook.ts";
import type { PricebookPayload } from "./types.ts";

interface LineTextEvent {
  webhookEventId: string;
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const channelSecret = requiredEnv("LINE_CHANNEL_SECRET");
const channelAccessToken = requiredEnv("LINE_CHANNEL_ACCESS_TOKEN");
const allowedUserId = requiredEnv("LINE_ALLOWED_USER_ID");
const pricebookOwnerId = requiredEnv("PRICEBOOK_OWNER_ID");
const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function claimEvent(eventId: string): Promise<boolean> {
  const { error } = await supabase
    .from("line_webhook_events")
    .insert({ event_id: eventId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function loadPayload(): Promise<PricebookPayload> {
  const { data, error } = await supabase
    .from("pricebook_data")
    .select("payload")
    .eq("id", pricebookOwnerId)
    .single();
  if (error) throw error;
  return data.payload as PricebookPayload;
}

async function handleEvent(event: LineTextEvent): Promise<void> {
  if (
    event.type !== "message" ||
    event.message?.type !== "text" ||
    !event.replyToken ||
    !event.webhookEventId
  ) return;

  if (!(await claimEvent(event.webhookEventId))) return;

  if (event.source?.userId !== allowedUserId) {
    await replyToLine(
      event.replyToken,
      "此帳號沒有查價權限",
      channelAccessToken,
    );
    return;
  }

  const command = parseCommand(event.message.text ?? "");
  if (!command.ok) {
    await replyToLine(event.replyToken, command.message, channelAccessToken);
    return;
  }

  const payload = await loadPayload();
  const reply = queryPricebook(payload, command.customer, command.productQuery);
  await replyToLine(event.replyToken, reply, channelAccessToken);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";
  if (!(await verifyLineSignature(rawBody, signature, channelSecret))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: { events?: LineTextEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const results = await Promise.allSettled((body.events ?? []).map(handleEvent));
  for (const result of results) {
    if (result.status === "rejected") console.error(result.reason);
  }

  return new Response("OK", { status: 200 });
});
```

- [ ] **Step 2: Run all unit tests**

Run:

```bash
deno test supabase/functions/line-price-query
```

Expected: 11 passed, 0 failed.

- [ ] **Step 3: Type-check the function**

Run:

```bash
deno check supabase/functions/line-price-query/index.ts
```

Expected: `Check .../index.ts` with no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/line-price-query/index.ts
git commit -m "Add secured LINE price webhook"
```

### Task 7: Configure Secrets and Deploy

**Files:**
- Create: `LINE-BOT.md`

- [ ] **Step 1: Document the operator setup**

Create `LINE-BOT.md` with these exact sections:

````md
# LINE 查價機器人設定

## LINE 官方帳號

1. 建立或開啟 LINE 官方帳號。
2. 在 LINE Official Account Manager 啟用 Messaging API。
3. 在 LINE Developers Console 取得 Channel secret 與 Channel access token。
4. 先將官方帳號加為個人 LINE 好友。

## 取得管理者 LINE User ID

部署 Function 並暫時查看 Edge Function logs。從本人傳送一則測試訊息後，
讀取 webhook 的 `source.userId`，將它設定為 `LINE_ALLOWED_USER_ID`。
正式完成後，log 不得輸出完整訊息內容、access token 或 customer price data。

## 設定 Secrets

```bash
supabase secrets set \
  LINE_CHANNEL_SECRET='...' \
  LINE_CHANNEL_ACCESS_TOKEN='...' \
  LINE_ALLOWED_USER_ID='U...' \
  PRICEBOOK_OWNER_ID='Supabase Auth UUID' \
  --project-ref fuhzrbbyqoojjguiuijf
```

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Edge Functions 預設提供，
不得寫入 GitHub、前端 JavaScript 或本文件。

## 部署

```bash
supabase functions deploy line-price-query \
  --no-verify-jwt \
  --project-ref fuhzrbbyqoojjguiuijf
```

Webhook URL：

```text
https://fuhzrbbyqoojjguiuijf.supabase.co/functions/v1/line-price-query
```

將網址填入 LINE Developers Console，按 Verify，成功後開啟 Use webhook。

## 使用方式

```text
查價 長青商行 P-1001
```

名稱含空白時：

```text
查價 "Great North Co" "ABC 100"
```
````

- [ ] **Step 2: Set non-secret identifiers and LINE secrets**

Run the `supabase secrets set` command from the document using the real values. Never paste those values into a tracked file or terminal output captured in documentation.

Expected: Supabase reports the secrets were set successfully.

- [ ] **Step 3: Deploy the function**

Run:

```bash
supabase functions deploy line-price-query \
  --no-verify-jwt \
  --project-ref fuhzrbbyqoojjguiuijf
```

Expected: deployment succeeds and displays the function URL.

- [ ] **Step 4: Configure LINE Webhook**

In LINE Developers Console, set:

```text
https://fuhzrbbyqoojjguiuijf.supabase.co/functions/v1/line-price-query
```

Expected: LINE's Verify button reports `Success`; enable `Use webhook`.

- [ ] **Step 5: Commit**

```bash
git add LINE-BOT.md
git commit -m "Document LINE bot deployment"
```

### Task 8: End-to-End Verification

**Files:**
- Verify only; no production files should change unless a test exposes a defect.

- [ ] **Step 1: Test a successful exact lookup from the authorized phone**

Send:

```text
查價 長青商行 P-1001
```

Expected: one reply containing customer, product, latest base price/date, latest customer price/date, and note.

- [ ] **Step 2: Test partial product lookup**

Send:

```text
查價 長青商行 P-
```

Expected: candidate list when more than one matching product exists.

- [ ] **Step 3: Test validation failures**

Send each:

```text
P-1001
查價 不存在 P-1001
查價 長青商行 不存在
```

Expected: usage text, `查無客戶`, and `查無產品`, respectively.

- [ ] **Step 4: Test authorization**

From a different LINE account, add the official account and send:

```text
查價 長青商行 P-1001
```

Expected: only `此帳號沒有查價權限`; no product or customer data.

- [ ] **Step 5: Check logs and data**

Run:

```bash
supabase functions logs line-price-query \
  --project-ref fuhzrbbyqoojjguiuijf
```

Expected: no unhandled errors and no secret values in logs. In Supabase Table Editor, `line_webhook_events` contains one row per processed message.

- [ ] **Step 6: Run final local verification**

Run:

```bash
deno fmt --check supabase/functions/line-price-query
deno lint supabase/functions/line-price-query
deno test supabase/functions/line-price-query
git diff --check
git status --short
```

Expected: format, lint, and tests pass; `git diff --check` prints nothing; working tree is clean after all planned commits.

- [ ] **Step 7: Push the completed commits**

```bash
git push origin master
```

Expected: GitHub accepts all LINE bot commits on `master`.
