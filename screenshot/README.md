## IA Screenshotter (Desktop, Electron)

Cross-platform desktop app: paste/select a batch of URLs - straight out
of the [IA Link Ripper](../links/README.md) or from anywhere else - and
capture a full-page PNG screenshot of each one. Completes the "journey"
started with the Flask CDX link ripper and the browser extension: rip
links -> pick which ones matter -> screenshot them.

### Architecture

- **Electron's own bundled Chromium does the rendering.** No
  Puppeteer/Playwright dependency - that would mean shipping a *second*
  copy of Chromium for no benefit. A hidden `BrowserWindow` loads each
  URL, and the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
  (exposed via `webContents.debugger`) drives `Page.captureScreenshot`
  with `captureBeyondViewport: true` - full page height, not just the
  visible viewport, which plain `webContents.capturePage()` can't do.
- **Concurrency-limited batch processing** (`lib/pool.js`): 1-8 hidden
  windows in flight at once (default 3, adjustable in the UI).
- **Partial-failure handling**: one URL timing out or failing to load
  doesn't block the rest of the batch - it's reported as failed, the
  others still complete.
- **Persistence** (`electron-store`): last-used URL list and output
  folder are remembered between launches, the same pattern used in the
  browser extension's options page.
- **contextIsolation + a minimal preload API** (`src/preload.cjs`): the
  renderer never gets direct Node/Electron access - it only sees the
  handful of functions explicitly exposed via `contextBridge`.

### Why the capture has a single end-to-end timeout, not just a load timeout

Earlier drafts only timed out the page *load* - the CDP screenshot
commands after that had no timeout at all, so a page whose compositor
never produced a frame (which is exactly what happens under a
constrained/headless environment with no working GPU) would hang that
capture **forever**, silently stalling the whole batch. `captureUrl()`
now wraps the entire load-and-capture operation in one timeout, so a
stuck page fails after `timeoutMs` (default 30s) instead of hanging
indefinitely - verified with `smoke-test.mjs` (see Testing below), which
is exactly how this bug was caught in the first place.

### Setup

```bash
npm install     # downloads Electron itself (~150MB, from GitHub releases)
npm start        # launches the app
```

### Testing

**Unit tests** (pure logic - URL parsing/validation, filename
uniqueness, the concurrency pool - no Electron needed):

```bash
npm test
```

**Smoke test** (the real Electron capture path, including the CDP
full-page screenshot, against a local tall test page):

```bash
xvfb-run -a ./node_modules/.bin/electron --no-sandbox smoke-test.mjs   # Linux/CI
# or, with a real display (normal desktop use), just:
./node_modules/.bin/electron smoke-test.mjs
```

This also runs automatically in CI on every push/PR (see below) on a
real Ubuntu runner, which - unlike some minimal/sandboxed containers -
reliably has a working software-rendering path for Xvfb + Electron.

### Manual verification checklist (per OS, before trusting a release build)

- [ ] Paste a mixed list (valid URLs, a bare domain, an invalid line) -
      invalid lines show as unselectable/flagged, valid ones default to selected.
- [ ] Deselect a couple of rows, confirm only the selected ones get captured.
- [ ] Output folder picker works and remembers the choice after restart.
- [ ] A deliberately broken/unreachable URL in the batch fails without
      blocking the rest.
- [ ] Resulting PNGs are genuinely full-page (taller than one viewport)
      for a long page.
- [ ] Clicking "Clear" resets the list and persisted state.

### Build script / CI (`.github/workflows/build.yml`)

- **Every push/PR**: runs the unit tests + Electron smoke test on
  Ubuntu (fast, catches logic and capture regressions like the timeout
  bug above).
- **On a `v*.*.*` tag, or a manual "Run workflow"**: builds native
  installers on all three OSes in parallel (each on its *real* target
  OS - no cross-compilation risk):
  - macOS: `.dmg` + `.zip`
  - Windows: NSIS installer (`.exe`) + portable `.exe`
  - Linux: `.AppImage` + `.deb`

  All three get uploaded as workflow artifacts; a tag push additionally
  publishes a GitHub Release with all of them attached.
- The version is stamped into `package.json` right before building -
  from the git tag (`v0.1.0` -> `0.1.0`) on a tag push, or from the
  `version` input (default `0.0.1`) on a manual run - so
  `npm pkg set version=...` and electron-builder both use the same
  package.json the workflow already reads.

**To cut a release**: `git tag v0.1.0 && git push origin v0.1.0`.

**To test-build locally without CI** (only builds for your current OS
unless you have the relevant toolchains/Wine installed for
cross-building, which isn't set up here - CI is the reliable path for
all three):

```bash
npm run dist:mac     # on macOS
npm run dist:win      # on Windows
npm run dist:linux     # on Linux
```

### Files

```
package.json           # scripts + electron-builder config (mac/win/linux targets)
src/main.js              # main process: window management, IPC handlers, electron-store
src/preload.cjs            # contextBridge API surface (CommonJS - see note below)
src/renderer/               # popup-equivalent UI: index.html, renderer.js, styles.css
lib/urlList.js                # parse/validate/dedupe/select URLs (pure, tested)
lib/filenames.js                # sanitize + collision-safe batch filenames (pure, tested)
lib/pool.js                      # concurrency-limited async pool (pure, tested)
lib/screenshot.js                 # the actual Electron capture logic (CDP-driven)
test/*.test.mjs                    # unit tests for the pure lib/ modules
smoke-test.mjs                      # real end-to-end capture test (see Testing)
.github/workflows/build.yml          # CI: test always, build+release on tags/dispatch
```

### Known limitations

- **`preload.cjs` is deliberately CommonJS**, not ESM, even though the
  rest of the app uses `"type": "module"`. Sandboxed ESM preload
  support landed later in Electron's history and isn't universally
  reliable across versions - CommonJS preload is the long-standing,
  broadly-compatible default, so it keeps that one file as `.cjs`
  regardless of what Electron version ends up building this.
- **No code signing / notarization** configured for the CI builds -
  macOS Gatekeeper and Windows SmartScreen will both warn on an
  unsigned installer. Signing needs paid certificates
  (Apple Developer Program, a Windows code-signing cert) that aren't
  set up here; the CI workflow has the natural place to add
  `electron-builder`'s signing config once you have them.
- **5MB-ish informal ceiling isn't a concern here** (unlike the browser
  extension's `storage.local`) - screenshots write straight to disk in
  your chosen folder, not to any quota-limited storage.
- Not verified against a real GPU/display in this environment - the
  timeout-safety fix is verified (fails fast instead of hanging), but
  an actual successful full-page PNG wasn't produced in this sandbox
  since it has no working GPU or software-rendering path at all (tried
  both SwiftShader and ANGLE fallbacks). This is a constraint of this
  particular sandbox, not of normal desktop machines or GitHub's CI
  runners - the CI smoke-test job is the place this gets verified for
  real, and it's worth watching that job's first run.
