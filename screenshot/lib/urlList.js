/**
 * Parses a pasted/imported URL list (e.g. straight out of the IA Link
 * Ripper) into selectable, validated items. Pure functions - no Electron
 * dependency - so this is fully unit-testable with a plain test runner.
 */

export function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Tolerate bare domains the way the CDX API does; a real browser window
  // needs a scheme though, so default to https.
  return `https://${trimmed}`;
}

export function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parses raw textarea/file text into a list of items, one per non-empty
 * line, deduped by normalized URL (exact repeats collapse to the first
 * occurrence, preserving order), each flagged valid/invalid and selected
 * by default so a "select all" batch run works with zero extra clicks.
 */
export function parseUrlList(text) {
  const seen = new Set();
  const items = [];
  let counter = 0;

  for (const rawLine of String(text || "").split("\n")) {
    const raw = rawLine.trim();
    if (!raw) continue;

    const url = normalizeUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);

    counter += 1;
    items.push({
      id: `u${counter}`,
      raw,
      url,
      valid: isValidUrl(url),
      selected: true,
    });
  }

  return items;
}

/**
 * The URLs that should actually be captured: selected AND valid.
 */
export function selectedUrls(items) {
  return items.filter((item) => item.selected && item.valid).map((item) => item.url);
}
