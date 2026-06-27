import { assertEquals } from "jsr:@std/assert@1.0.19";

import { parseCommand } from "./command.ts";

const FORMAT_MESSAGE =
  "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100";

Deno.test("parses an exact three-token price query", () => {
  assertEquals(parseCommand("查價 長青商行 ABC-100"), {
    ok: true,
    customer: "長青商行",
    productQuery: "ABC-100",
  });
});

Deno.test("collapses extra whitespace between tokens", () => {
  assertEquals(parseCommand("  查價   長青商行   ABC-100  "), {
    ok: true,
    customer: "長青商行",
    productQuery: "ABC-100",
  });
});

Deno.test("supports quoted customer and product tokens", () => {
  assertEquals(parseCommand('查價 "Great North Co" "ABC 100"'), {
    ok: true,
    customer: "Great North Co",
    productQuery: "ABC 100",
  });
});

Deno.test("rejects commands with the wrong keyword or token count", () => {
  assertEquals(parseCommand("搜尋 長青商行 ABC-100"), {
    ok: false,
    message: FORMAT_MESSAGE,
  });
  assertEquals(parseCommand("查價 長青商行"), {
    ok: false,
    message: FORMAT_MESSAGE,
  });
  assertEquals(parseCommand("查價 長青商行 ABC-100 extra"), {
    ok: false,
    message: FORMAT_MESSAGE,
  });
});

Deno.test("rejects unmatched quotes", () => {
  assertEquals(parseCommand('查價 "Great North Co ABC-100'), {
    ok: false,
    message: FORMAT_MESSAGE,
  });
});
