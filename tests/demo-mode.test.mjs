import assert from "node:assert/strict";
import test from "node:test";

import { createDemoData, isDemoMode } from "../demo-mode.js";

test("isDemoMode only enables the explicit demo query", () => {
  assert.equal(isDemoMode("?demo=1"), true);
  assert.equal(isDemoMode("?demo=0"), false);
  assert.equal(isDemoMode("?source=resume"), false);
});

test("createDemoData returns isolated sample data", () => {
  const first = createDemoData();
  const second = createDemoData();

  assert.equal(first.products.length, 3);
  assert.notEqual(first, second);
  assert.notEqual(first.products, second.products);

  first.products[0].name = "已修改的展示資料";
  assert.notEqual(second.products[0].name, first.products[0].name);
});
