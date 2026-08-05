const state = {
  items: [], // {id, raw, url, valid, selected}
  outputFolder: null,
  progressRows: new Map(), // url -> row element, for the currently running batch
};

const els = {
  urlListInput: document.getElementById("urlListInput"),
  parseBtn: document.getElementById("parseBtn"),
  parseSummary: document.getElementById("parseSummary"),
  selectionSection: document.getElementById("selectionSection"),
  selectAll: document.getElementById("selectAll"),
  selectionCount: document.getElementById("selectionCount"),
  urlTable: document.getElementById("urlTable"),
  chooseFolderBtn: document.getElementById("chooseFolderBtn"),
  outputFolderLabel: document.getElementById("outputFolderLabel"),
  concurrencyInput: document.getElementById("concurrencyInput"),
  startBtn: document.getElementById("startBtn"),
  clearBtn: document.getElementById("clearBtn"),
  progressList: document.getElementById("progressList"),
  message: document.getElementById("message"),
};

function showMessage(text, kind) {
  els.message.textContent = text;
  els.message.className = `message ${kind}`;
  els.message.hidden = false;
}

function clearMessage() {
  els.message.hidden = true;
  els.message.textContent = "";
}

function basename(p) {
  return p.split(/[\\/]/).pop();
}

function updateStartButtonState() {
  const hasSelected = state.items.some((item) => item.selected && item.valid);
  els.startBtn.disabled = !hasSelected || !state.outputFolder;
}

function updateSelectionCount() {
  const selected = state.items.filter((item) => item.selected && item.valid).length;
  const total = state.items.filter((item) => item.valid).length;
  els.selectionCount.textContent = `${selected} / ${total} selected`;
}

function renderTable() {
  els.urlTable.innerHTML = "";

  for (const item of state.items) {
    const row = document.createElement("div");
    row.className = "url-row" + (item.valid ? "" : " invalid");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected;
    checkbox.disabled = !item.valid;
    checkbox.addEventListener("change", () => {
      item.selected = checkbox.checked;
      updateSelectionCount();
      updateStartButtonState();
    });

    const label = document.createElement("span");
    label.textContent = item.valid ? item.url : `${item.raw} (invalid URL)`;

    row.append(checkbox, label);
    els.urlTable.appendChild(row);
  }

  updateSelectionCount();
}

els.parseBtn.addEventListener("click", async () => {
  clearMessage();
  const text = els.urlListInput.value;
  const items = await window.api.parseUrlList(text);
  state.items = items;
  await window.api.saveUrlListText(text);

  const invalidCount = items.filter((item) => !item.valid).length;
  els.parseSummary.textContent =
    `${items.length} URL(s) found` + (invalidCount ? `, ${invalidCount} invalid` : "");
  els.selectionSection.hidden = items.length === 0;
  renderTable();
  updateStartButtonState();
});

els.selectAll.addEventListener("change", () => {
  for (const item of state.items) {
    if (item.valid) item.selected = els.selectAll.checked;
  }
  renderTable();
  updateStartButtonState();
});

els.chooseFolderBtn.addEventListener("click", async () => {
  const folder = await window.api.chooseOutputFolder();
  if (folder) {
    state.outputFolder = folder;
    els.outputFolderLabel.textContent = folder;
    updateStartButtonState();
  }
});

els.startBtn.addEventListener("click", async () => {
  clearMessage();
  els.startBtn.disabled = true;
  els.progressList.innerHTML = "";
  state.progressRows.clear();

  const selected = state.items.filter((item) => item.selected && item.valid);
  for (const item of selected) {
    const row = document.createElement("div");
    row.className = "progress-row pending";
    row.textContent = `${item.url} \u2014 pending`;
    els.progressList.appendChild(row);
    state.progressRows.set(item.url, row);
  }

  const concurrency = parseInt(els.concurrencyInput.value, 10) || 3;

  const response = await window.api.startCapture({
    items: state.items,
    outputFolder: state.outputFolder,
    concurrency,
  });

  if (response.error) {
    showMessage(response.error, "error");
  } else {
    const failed = response.results.filter((r) => r.status === "error");
    if (failed.length) {
      showMessage(
        `${failed.length} of ${response.results.length} capture(s) failed. See details below.`,
        "warning"
      );
    } else {
      showMessage(`All ${response.results.length} capture(s) completed.`, "success");
    }
  }

  updateStartButtonState();
});

window.api.onProgress((result) => {
  const row = state.progressRows.get(result.url);
  if (!row) return;

  if (result.status === "ok") {
    row.textContent = `${result.url} \u2014 done (${basename(result.path)})`;
    row.className = "progress-row ok";
  } else {
    row.textContent = `${result.url} \u2014 failed: ${result.error}`;
    row.className = "progress-row error";
  }
});

els.clearBtn.addEventListener("click", async () => {
  els.urlListInput.value = "";
  state.items = [];
  state.outputFolder = null;
  state.progressRows.clear();
  els.outputFolderLabel.textContent = "No folder selected";
  els.selectionSection.hidden = true;
  els.progressList.innerHTML = "";
  els.parseSummary.textContent = "";
  clearMessage();
  updateStartButtonState();
  await window.api.saveUrlListText("");
});

// Restore persisted URL list / output folder on launch.
(async () => {
  const persisted = await window.api.loadPersisted();
  if (persisted.urlListText) {
    els.urlListInput.value = persisted.urlListText;
  }
  if (persisted.outputFolder) {
    state.outputFolder = persisted.outputFolder;
    els.outputFolderLabel.textContent = persisted.outputFolder;
  }
  updateStartButtonState();
})();
