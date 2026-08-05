## IA Link Ripper - Browser Add-on (MV3)

A small experiment: the core URL/options -> CDX query -> formatted links
logic from the Flask app (`links.py`), ported to a standalone browser
add-on with no server involved. The extension calls the Internet
Archive's CDX API directly and lets you view or download the results.
Manifest V3, targeting both Firefox and Chrome from the same codebase.

### How it maps to the Flask version

| Flask (`links.py`)         | Add-on (`lib/links.js`) |
|-----------------------------|--------------------------|
| `Links._build_query_url`    | `buildQueryUrl`          |
| `Links._fetch_cdx`          | `fetchCdx`                |
| `Links._parse_links`        | `parseLinks`              |
| `Links.format_txt/csv/html` | `formatTxt/Csv/Html`      |
| `Links.rip_links_urls`      | `ripLinksUrls`            |
| `LinksError`                | `LinksError`              |

Same behavior carried over: no per-URL separator when merging multiple
URLs, txt/csv/html are all built from one shared `parseLinks()` list,
partial failures don't block the URLs that succeeded, and the same
`1_day` / `10_day` / `1_month` -> `timestamp:8/7/6` mapping is used.

### Why the popup used to lose data on download / click-away

This was a real bug, not a misunderstanding - worth explaining since it
shapes the architecture:

- **A browser extension popup closes automatically** the instant it
  loses focus - clicking anywhere outside it, or a native dialog (like
  a "Save As" file picker) stealing focus, both close it immediately.
- The old download code created a `Blob`/`URL.createObjectURL()`
  **inside the popup's own document**. That object URL is scoped to the
  document that created it - the moment the popup closes (which
  `saveAs: true` triggers by opening the save dialog), the URL becomes
  invalid and the download fails.
- Clicking away from the popup for any other reason destroyed the
  popup's whole in-memory state (the fetched results), since nothing
  was ever persisted outside the popup's own JS.

**Fix, two parts:**

1. **`background.js`** now performs the actual download. The popup
   sends it the result text + filename via `runtime.sendMessage`; the
   background service worker creates the `Blob`/object URL and calls
   `downloads.download()` itself. The service worker's lifetime isn't
   tied to the popup, so the download keeps going even though the popup
   that requested it is already gone by the time the save dialog opens.
2. **`resultsStore.js`** persists the last completed search (inputs +
   formatted result) to `storage.local`. Every time the popup opens, it
   restores the last result automatically - so clicking away and
   reopening the popup brings your results right back instead of losing
   them. A **Clear** button resets this explicitly.

### What's new since the previous version

- **Manifest V3**, targeting Firefox and Chrome from one manifest.
- **Options page** for default "show duplicates" / timestamp / format,
  synced via `storage.sync`.
- **`compat.js`**: a small shim so the same code runs unmodified on
  Firefox's native promise-based `browser.*` and Chrome's
  callback-based `chrome.*`.
- **Background service worker + result persistence** (see above).
- **Build script** (`build.mjs`) that packages the extension per-target
  with a stamped semantic version.

### Load it in Firefox (temporary, for testing)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on\u2026**.
3. Select `manifest.json` in this folder (or a built `.xpi` from `dist/`).
4. Click the toolbar icon to open the popup.

### Load it in Chrome (unpacked, for testing)

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (this loads
   `manifest.json` directly with `browser_specific_settings` still
   present - Chrome just ignores that key; use the build script if you
   want a Chrome-clean package).
4. Click the toolbar icon (pin it via the puzzle-piece menu if needed).

### Build script

```bash
npm install               # installs the one dev dependency (archiver)

npm run build:firefox     # -> dist/ia-link-ripper-firefox-0.0.1.xpi
npm run build:chrome      # -> dist/ia-link-ripper-chrome-0.0.1.zip
npm run build:all         # both

# or call it directly for a specific version:
node build.mjs --target firefox --version 0.1.0
node build.mjs --target chrome  --version 0.1.0
```

`--target` (`firefox` or `chrome`) is required when calling `build.mjs`
directly; `--version` defaults to `0.0.1` and must be a plain semantic
version (`X.Y.Z`). The only manifest difference between targets is
`browser_specific_settings` (Firefox-only; stripped from the Chrome
build) - everything else is shared MV3 and works unmodified on both.

An unsigned `.xpi` can be loaded temporarily in Firefox (above), or
installed permanently in Firefox Developer Edition/Nightly with
`xpinstall.signatures.required` set to `false` in `about:config`. A
normal release install needs [addons.mozilla.org](https://addons.mozilla.org)
signing. The Chrome `.zip` is what you'd upload to the Chrome Web
Store; for local testing, "Load unpacked" (above) is simpler than
packing a `.crx`.

### Tests

```bash
node --test lib/links.test.mjs settings.test.mjs resultsStore.test.mjs
# or: npm test
```

Covers the core CDX logic, the settings load/save round-trip, and the
results-persistence load/save/clear round-trip - all with fake/mocked
storage, no real browser or network needed. `compat.js` and
`background.js` themselves aren't unit tested (they're thin wrappers
around browser-only globals like `chrome.*`/`URL.createObjectURL` in a
service worker) - covered by the manual load steps above in both
browsers.

### Files

```
manifest.json         # MV3 manifest: action popup, background service worker, options_ui
build.mjs              # packaging script (see "Build script" above)
package.json            # npm scripts + archiver dev dependency
popup.html               # popup form UI
popup.js                 # form logic, restores last result, messages background for downloads
background.js             # service worker: performs downloads so they survive the popup closing
options.html               # options page UI
options.js                  # loads/saves default settings via storage.sync
styles.css                   # shared styling for popup + options page
compat.js                     # cross-browser (Firefox/Chrome) API shim
settings.js                    # shared default-settings schema + load/save helpers
resultsStore.js                 # persists/restores the last search result
format-utils.js                  # shared filename/content-type helpers
lib/links.js                      # core CDX query/fetch/format logic (ported from links.py)
lib/links.test.mjs                 # unit tests for the core lib
settings.test.mjs                   # unit tests for settings load/save
resultsStore.test.mjs                # unit tests for results persistence
```

### Known limitations

- `storage.local` has a default quota (5MB in most browsers) - fine for
  ordinary link lists, but a very large batch of URLs could theoretically
  hit it. Not handled specially; would need the `unlimitedStorage`
  permission if that becomes a real problem for you.
- The background service worker can be suspended by the browser after a
  period of inactivity (normal MV3 behavior); if that happens before the
  60-second object-URL cleanup timer fires, the object URL just never
  gets explicitly revoked - harmless (released when the worker's context
  is torn down), not a functional issue.
- No automated icon; the browser shows a generic placeholder in the
  toolbar until one is added via `action.default_icon`.
- Not tested against a real Chrome install in this environment (no
  Chrome binary available here) - the MV3 API usage follows documented
  behavior and `compat.js`'s wrapping should be correct, but it's worth
  a real click-through in Chrome (including an actual download and
  clicking away from the popup) before relying on it.
