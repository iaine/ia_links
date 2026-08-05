import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, isValidUrl, parseUrlList, selectedUrls } from "../lib/urlList.js";

test("normalizeUrl: keeps http/https urls unchanged", () => {
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
});

test("normalizeUrl: prefixes bare domains with https", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
});

test("normalizeUrl: trims whitespace", () => {
  assert.equal(normalizeUrl("  example.com  "), "https://example.com");
});

test("normalizeUrl: empty string stays empty", () => {
  assert.equal(normalizeUrl("   "), "");
});

test("isValidUrl: accepts well-formed http/https urls", () => {
  assert.equal(isValidUrl("https://example.com"), true);
  assert.equal(isValidUrl("http://example.com/path?q=1"), true);
});

test("isValidUrl: rejects non-http(s) schemes and garbage", () => {
  assert.equal(isValidUrl("ftp://example.com"), false);
  assert.equal(isValidUrl("not a url"), false);
  assert.equal(isValidUrl(""), false);
});

test("parseUrlList: parses one url per line", () => {
  const items = parseUrlList("example.com\nhttps://example.org");
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "https://example.com");
  assert.equal(items[1].url, "https://example.org");
  assert.ok(items.every((i) => i.valid && i.selected));
});

test("parseUrlList: skips blank lines", () => {
  const items = parseUrlList("example.com\n\n\nexample.org\n");
  assert.equal(items.length, 2);
});

test("parseUrlList: dedupes exact normalized repeats, keeps first occurrence order", () => {
  const items = parseUrlList("example.com\nhttps://example.com\nexample.org");
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "https://example.com");
  assert.equal(items[1].url, "https://example.org");
});

test("parseUrlList: flags invalid entries but keeps them (unselectable)", () => {
  const items = parseUrlList("example.com\nnot a url at all");
  assert.equal(items.length, 2);
  assert.equal(items[0].valid, true);
  assert.equal(items[1].valid, false);
});

test("parseUrlList: assigns stable unique ids", () => {
  const items = parseUrlList("a.com\nb.com\nc.com");
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("selectedUrls: only returns selected AND valid urls", () => {
  const items = parseUrlList("a.com\nb.com\nnot a url");
  items[1].selected = false; // deselect b.com
  const result = selectedUrls(items);
  assert.deepEqual(result, ["https://a.com"]);
});
