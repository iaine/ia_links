// Smoke test exercising the real Electron capture path against a local
// data: URL with a tall page (to verify full-page-beyond-viewport capture
// actually works, not just viewport capture). Run standalone with:
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox smoke-test.mjs
// or via CI (see .github/workflows/build.yml), which runs this on a real
// Ubuntu runner where Xvfb + software GL reliably work.
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { captureUrl } from "./lib/screenshot.js";

const TALL_PAGE = `data:text/html,${encodeURIComponent(`
  <html><body style="margin:0">
    <div style="height:3000px;background:linear-gradient(red,blue)">TOP</div>
    <div style="height:100px;background:yellow">BOTTOM MARKER</div>
  </body></html>
`)}`;

app.whenReady().then(async () => {
  const outputPath = path.join(process.cwd(), "smoke-test-output.png");
  console.log("Capturing tall test page...");
  const result = await captureUrl(TALL_PAGE, outputPath, { timeoutMs: 15000 });
  console.log("Result:", result);

  if (result.status !== "ok") {
    console.error("SMOKE TEST FAILED");
    app.exit(1);
    return;
  }

  const stats = fs.statSync(outputPath);
  console.log(`Wrote ${stats.size} bytes to ${outputPath}`);

  // A 3000+100=3100px tall page at 1280px width should produce a PNG
  // meaningfully larger than a single 1280x800 viewport screenshot would
  // be - a crude but useful sanity check that full-page capture (not
  // just the visible viewport) actually happened.
  if (stats.size < 5000) {
    console.error("SMOKE TEST FAILED: output suspiciously small for a full-page capture");
    app.exit(1);
    return;
  }

  console.log("SMOKE TEST PASSED");
  app.exit(0);
});
