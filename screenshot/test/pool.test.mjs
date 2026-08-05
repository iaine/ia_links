import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../lib/pool.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("runPool: preserves result order regardless of completion order", async () => {
  const items = [30, 10, 20]; // ms delays - item 0 finishes last if run serially in order
  const results = await runPool(
    items,
    async (ms) => {
      await delay(ms);
      return ms;
    },
    3
  );
  assert.deepEqual(results, [30, 10, 20]);
});

test("runPool: never exceeds the concurrency cap", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  let active = 0;
  let maxActive = 0;

  await runPool(
    items,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active -= 1;
      return item;
    },
    3
  );

  assert.ok(maxActive <= 3, `expected max 3 concurrent, saw ${maxActive}`);
});

test("runPool: concurrency higher than item count doesn't break anything", async () => {
  const results = await runPool([1, 2], async (x) => x * 2, 10);
  assert.deepEqual(results, [2, 4]);
});

test("runPool: empty input returns empty results", async () => {
  const results = await runPool([], async (x) => x, 3);
  assert.deepEqual(results, []);
});

test("runPool: a rejected worker rejects the whole pool (caller's responsibility to catch per-item)", async () => {
  await assert.rejects(
    runPool([1, 2, 3], async (x) => {
      if (x === 2) throw new Error("boom");
      return x;
    }, 2)
  );
});
