/**
 * Core Link Ripper logic, ported from links.py.
 *
 * Same shared design as the Flask version: buildQueryUrl() builds one CDX
 * request per URL, parseLinks() is the single source of truth for turning
 * raw CDX text into wayback URLs, and formatTxt/formatCsv/formatHtml all
 * wrap that same list - they never re-derive the links themselves.
 */

export const BASE_URL = "https://web.archive.org/cdx/search/cdx?url=";

// Friendly front-end names -> CDX API's collapse=timestamp:N granularity.
// timestamp:8 - every day, timestamp:7 - every 10 days, timestamp:6 - every month
export const TIMESTAMP_MAP = {
  "1_day": "timestamp:8",
  "10_day": "timestamp:7",
  "1_month": "timestamp:6",
  "timestamp:8": "timestamp:8",
  "timestamp:7": "timestamp:7",
  "timestamp:6": "timestamp:6",
};

export class LinksError extends Error {
  constructor(message, url) {
    super(message);
    this.name = "LinksError";
    this.url = url;
  }
}

/**
 * Build the CDX query URL for a single target url. Always builds a fresh
 * string - never mutates shared state - so repeated calls can't leak into
 * each other the way the original Python bug did.
 */
export function buildQueryUrl(url, showDupes = "false", timestamp = "") {
  let queryUrl = BASE_URL + url;
  queryUrl += "&showDupeCount=" + String(showDupes).toLowerCase();

  if (timestamp) {
    const collapseValue = TIMESTAMP_MAP[timestamp];
    if (!collapseValue) {
      throw new LinksError(`Unknown timestamp option: ${timestamp}`, url);
    }
    queryUrl += "&collapse=" + collapseValue;
  }

  return queryUrl;
}

/**
 * Fetch raw CDX text for a single url. Throws LinksError on network
 * failure or a non-200 response.
 */
export async function fetchCdx(url, showDupes = "false", timestamp = "") {
  const queryUrl = buildQueryUrl(url, showDupes, timestamp);

  let response;
  try {
    response = await fetch(queryUrl, {
      headers: { "User-Agent": "Link-Ripper-Addon/1.0" },
    });
  } catch (err) {
    throw new LinksError(`Request failed for ${url}: ${err.message}`, url);
  }

  if (!response.ok) {
    throw new LinksError(
      `Archive.org returned HTTP ${response.status} for ${url}`,
      url
    );
  }

  return response.text();
}

/**
 * Shared parser: raw CDX text -> list of wayback URLs.
 */
export function parseLinks(text) {
  const links = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(" ");
    if (parts.length < 3) continue; // malformed/unexpected line - skip
    links.push(`http://wayback.archive.org/web/${parts[1]}/${parts[2]}`);
  }
  return links;
}

export function formatTxt(links) {
  return links.join("\n");
}

export function formatCsv(links) {
  return links.join("\n");
}

export function formatHtml(links) {
  return links.map((link) => `<a href="${link}">${link}</a>`).join("\n");
}

export function formatLinks(links, format) {
  switch (format) {
    case "txt":
      return formatTxt(links);
    case "csv":
      return formatCsv(links);
    case "html":
      return formatHtml(links);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Fetch + merge results for a list of urls. Links from every url are
 * concatenated in order with no per-url separator/header line, matching
 * the Flask app's behavior. Returns { result, errors }: result is null
 * if there were zero total links across every url; errors lists any
 * urls that failed so callers can still show the successful results.
 */
export async function ripLinksUrls(
  urlList,
  showDupes = "false",
  timestamp = "",
  format = "txt"
) {
  const allLinks = [];
  const errors = [];

  for (const rawUrl of urlList) {
    const url = rawUrl.trim();
    if (!url) continue;

    try {
      const text = await fetchCdx(url, showDupes, timestamp);
      allLinks.push(...parseLinks(text));
    } catch (err) {
      if (err instanceof LinksError) {
        errors.push(err);
      } else {
        errors.push(new LinksError(err.message, url));
      }
    }
  }

  if (allLinks.length === 0) {
    return { result: null, errors };
  }

  return { result: formatLinks(allLinks, format), errors };
}
