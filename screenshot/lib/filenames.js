/**
 * Filename helpers for a batch of screenshots - one file per URL, so
 * (unlike the Flask Link Ripper / browser extension, which merge multiple
 * URLs into one output) this needs to guarantee uniqueness across a whole
 * batch rather than just sanitize a single name.
 */

export function sanitizeFilename(url) {
  let name = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ""); // strip scheme
  name = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return name || "screenshot";
}

/**
 * Returns a filename guaranteed not to collide with anything already in
 * `usedNames` (which is mutated to record the returned name), appending
 * _1, _2, ... on collision.
 */
export function resolveUniqueFilename(usedNames, baseName, extension) {
  let candidate = `${baseName}.${extension}`;
  let counter = 1;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${counter}.${extension}`;
    counter += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Builds a { url, filename } pair for every url in the batch, with
 * guaranteed-unique filenames even when two URLs sanitize to the same
 * base name (e.g. http vs https of the same host, or a trailing slash
 * difference).
 */
export function buildFilenamesForBatch(urls, extension = "png") {
  const used = new Set();
  return urls.map((url) => {
    const base = sanitizeFilename(url);
    const filename = resolveUniqueFilename(used, base, extension);
    return { url, filename };
  });
}
