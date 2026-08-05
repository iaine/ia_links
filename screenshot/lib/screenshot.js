/**
 * Captures a full-page (entire scrollable height, not just the viewport)
 * screenshot of a URL using a hidden Electron BrowserWindow.
 *
 * This deliberately does NOT bring in Puppeteer/Playwright's separately
 * downloaded Chromium - Electron already bundles its own Chromium, so
 * driving it directly via the CDP session exposed through
 * webContents.debugger avoids doubling the binary size for no benefit.
 * webContents.capturePage() alone only grabs the visible viewport, which
 * is why this uses Page.captureScreenshot with captureBeyondViewport
 * instead.
 */
import { BrowserWindow } from "electron";
import fs from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 30_000;
// Extra settle time after "finished loading" for JS-rendered content to
// paint. Electron has no direct equivalent of Playwright's networkidle,
// so this is a pragmatic fixed delay rather than a true idle detector.
const SETTLE_DELAY_MS = 800;
const VIEWPORT = { width: 1280, height: 800 };

/**
 * @param {string} url
 * @param {string} outputPath - full path (including filename) to write the PNG to
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{url: string, status: "ok", path: string} | {url: string, status: "error", error: string}>}
 */
export async function captureUrl(url, outputPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const win = new BrowserWindow({
    show: false,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hidden capture windows should never navigate away from the target
  // page or spawn popups.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await withTimeout(
      captureFullyLoadedPage(win, url, outputPath),
      timeoutMs,
      `Timed out capturing ${url} after ${timeoutMs}ms`
    );
    return { url, status: "ok", path: outputPath };
  } catch (err) {
    return { url, status: "error", error: err.message || String(err) };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function captureFullyLoadedPage(win, url, outputPath) {
  await loadAndSettle(win, url);
  const pngBuffer = await captureFullPage(win);
  await fs.writeFile(outputPath, pngBuffer);
}

function loadAndSettle(win, url) {
  return new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", () => {
      setTimeout(resolve, SETTLE_DELAY_MS);
    });
    win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      reject(new Error(`Failed to load (${errorCode}): ${errorDescription}`));
    });
    win.loadURL(url).catch(reject);
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function captureFullPage(win) {
  const wc = win.webContents;
  const dbg = wc.debugger;
  dbg.attach("1.3");

  try {
    await dbg.sendCommand("Page.enable");

    const metrics = await dbg.sendCommand("Page.getLayoutMetrics");
    // cssContentSize is the modern field; contentSize is the older one -
    // fall back for older Chromium/CDP versions bundled in older Electron.
    const size = metrics.cssContentSize || metrics.contentSize;
    const width = Math.ceil(size.width);
    const height = Math.ceil(size.height);

    await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const { data } = await dbg.sendCommand("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });

    return Buffer.from(data, "base64");
  } finally {
    await dbg.sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => {});
    try {
      dbg.detach();
    } catch {
      // already detached (e.g. window was destroyed) - fine to ignore
    }
  }
}
