import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";

import { parseUrlList, selectedUrls } from "../lib/urlList.js";
import { buildFilenamesForBatch } from "../lib/filenames.js";
import { runPool } from "../lib/pool.js";
import { captureUrl } from "../lib/screenshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = new Store({
  defaults: { lastUrlListText: "", lastOutputFolder: "" },
});

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Hidden capture windows (created in lib/screenshot.js) get their own
// webContents too; make sure none of them can spawn further windows.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

ipcMain.handle("load-persisted", () => ({
  urlListText: store.get("lastUrlListText"),
  outputFolder: store.get("lastOutputFolder"),
}));

ipcMain.handle("save-url-list-text", (_event, text) => {
  store.set("lastUrlListText", text);
});

ipcMain.handle("choose-output-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const folder = result.filePaths[0];
  store.set("lastOutputFolder", folder);
  return folder;
});

ipcMain.handle("parse-url-list", (_event, text) => parseUrlList(text));

ipcMain.handle("start-capture", async (event, { items, outputFolder, concurrency }) => {
  const urls = selectedUrls(items || []);

  if (urls.length === 0) {
    return { results: [], error: "No valid URLs selected." };
  }
  if (!outputFolder) {
    return { results: [], error: "Choose an output folder first." };
  }

  const planned = buildFilenamesForBatch(urls, "png");
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 3, 8));

  const results = await runPool(
    planned,
    async ({ url, filename }) => {
      const outputPath = path.join(outputFolder, filename);
      const result = await captureUrl(url, outputPath);
      event.sender.send("capture-progress", result);
      return result;
    },
    safeConcurrency
  );

  return { results };
});
