const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadPersisted: () => ipcRenderer.invoke("load-persisted"),
  saveUrlListText: (text) => ipcRenderer.invoke("save-url-list-text", text),
  chooseOutputFolder: () => ipcRenderer.invoke("choose-output-folder"),
  parseUrlList: (text) => ipcRenderer.invoke("parse-url-list", text),
  startCapture: (payload) => ipcRenderer.invoke("start-capture", payload),
  onProgress: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("capture-progress", listener);
    return () => ipcRenderer.removeListener("capture-progress", listener);
  },
});
