/**
 * Shared settings schema for storage.sync, used by both popup.js and
 * options.js so the two never drift out of sync on keys or defaults.
 */

export const STORAGE_KEY = "iaLinkRipperSettings";

export const DEFAULT_SETTINGS = {
  showDupes: false,
  timestamp: "",
  format: "txt",
};

export async function loadSettings(browserAPI) {
  const stored = await browserAPI.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] || {}) };
}

export async function saveSettings(browserAPI, settings) {
  await browserAPI.storage.sync.set({ [STORAGE_KEY]: settings });
}
