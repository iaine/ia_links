/**
 * Shared filename/content-type helpers, used by both popup.js and
 * background.js so they can't drift out of sync on how a downloaded
 * file gets named or typed.
 */

export const CONTENT_TYPES = {
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
};

export function sanitizeFilename(url) {
  let name = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ""); // strip scheme
  name = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return name || "links";
}

export function buildFilename(urlList, format) {
  let base;
  if (urlList.length === 0) {
    base = "links";
  } else if (urlList.length === 1) {
    base = sanitizeFilename(urlList[0]);
  } else {
    base = `${sanitizeFilename(urlList[0])}_and_${urlList.length - 1}_more`;
  }
  return `${base}.${format}`;
}
