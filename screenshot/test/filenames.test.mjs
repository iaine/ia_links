import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFilename,
  resolveUniqueFilename,
  buildFilenamesForBatch,
} from "../lib/filenames.js";

test("sanitizeFilename: strips scheme and unsafe characters", () => {
  assert.equal(sanitizeFilename("https://example.com/foo?bar=1"), "example.com_foo_bar_1");
});

test("sanitizeFilename: falls back to a default when everything is stripped", () => {
  assert.equal(sanitizeFilename("https://"), "screenshot");
});

test("resolveUniqueFilename: first use returns the plain name", () => {
  const used = new Set();
  assert.equal(resolveUniqueFilename(used, "example.com", "png"), "example.com.png");
});

test("resolveUniqueFilename: collisions get numbered suffixes", () => {
  const used = new Set();
  assert.equal(resolveUniqueFilename(used, "example.com", "png"), "example.com.png");
  assert.equal(resolveUniqueFilename(used, "example.com", "png"), "example.com_1.png");
  assert.equal(resolveUniqueFilename(used, "example.com", "png"), "example.com_2.png");
});

test("buildFilenamesForBatch: every url gets a unique filename in input order", () => {
  const urls = [
    "https://example.com",
    "http://example.com", // sanitizes to the same base as above
    "https://example.org",
  ];
  const result = buildFilenamesForBatch(urls, "png");

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.url),
    urls
  );
  const filenames = result.map((r) => r.filename);
  assert.equal(new Set(filenames).size, filenames.length); // all unique
  assert.equal(filenames[0], "example.com.png");
  assert.equal(filenames[1], "example.com_1.png");
  assert.equal(filenames[2], "example.org.png");
});
