/**
 * Runs `worker` over `items` with at most `concurrency` running at once,
 * preserving input order in the returned results regardless of which
 * finishes first. Pure JS - no Electron dependency - so this is directly
 * unit-testable, including the concurrency cap itself.
 */
export async function runPool(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const current = nextIndex;
    if (current >= items.length) return;
    nextIndex += 1;
    results[current] = await worker(items[current], current);
    await runNext();
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));

  return results;
}
