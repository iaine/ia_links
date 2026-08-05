/**
 * Persists the last completed search (inputs + formatted result) so that
 * closing the popup - which happens automatically on any focus loss,
 * including a native file-save dialog opening - doesn't lose the results
 * the user just fetched. Uses storage.local rather than storage.sync
 * since results can be larger than sync's per-item quota and don't need
 * to follow the user between devices.
 */

const RESULTS_STORAGE_KEY = "iaLinkRipperLastResult";

export async function saveLastResult(browserAPI, data) {
  await browserAPI.storage.local.set({
    [RESULTS_STORAGE_KEY]: { ...data, savedAt: Date.now() },
  });
}

export async function loadLastResult(browserAPI) {
  const stored = await browserAPI.storage.local.get(RESULTS_STORAGE_KEY);
  return stored[RESULTS_STORAGE_KEY] || null;
}

export async function clearLastResult(browserAPI) {
  await browserAPI.storage.local.remove(RESULTS_STORAGE_KEY);
}
