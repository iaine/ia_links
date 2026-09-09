import { ripLinksUrls } from "./lib/links.js";
import browserAPI from "./compat.js";
import { loadSettings } from "./settings.js";
import { buildFilename } from "./format-utils.js";
import { saveLastResult, loadLastResult, clearLastResult } from "./resultsStore.js";

const form = document.getElementById("linkForm");
const inputUrls = document.getElementById("inputUrls");
const showDupesEl = document.getElementById("showDupes");
const formatEl = document.getElementById("format");
const messageEl = document.getElementById("message");
const outputEl = document.getElementById("output");
const submitBtn = document.getElementById("submitBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const optionsBtn = document.getElementById("optionsBtn");

optionsBtn.addEventListener("click", () => {
  browserAPI.runtime.openOptionsPage();
});

// last successful result, kept around so the Download button doesn't
// need to re-fetch anything
let lastResult = { text: null, format: null, urlList: [] };

function setTimestampRadio(value) {
  const radio = form.querySelector(`input[name="timestamp"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = `message ${kind}`;
  messageEl.hidden = false;
}

function clearMessage() {
  messageEl.hidden = true;
  messageEl.textContent = "";
}

function getTimestamp() {
  const checked = form.querySelector('input[name="timestamp"]:checked');
  return checked ? checked.value : "";
}

async function init() {
  // Saved defaults from the options page apply first...
  try {
    const settings = await loadSettings(browserAPI);
    showDupesEl.checked = !!settings.showDupes;
    formatEl.value = settings.format;
    setTimestampRadio(settings.timestamp);
  } catch {
    // fall back silently to the hard-coded defaults already in the HTML
  }

  // ...then a restored previous result (if any) takes priority, since it
  // reflects what was actually searched, not just a generic default.
  // This is what makes clicking away from the popup (which always closes
  // it) non-destructive: reopening it brings the last results right back.
  try {
    const saved = await loadLastResult(browserAPI);
    if (saved) {
      inputUrls.value = saved.rawUrls;
      showDupesEl.checked = !!saved.showDupes;
      formatEl.value = saved.format;
      setTimestampRadio(saved.timestamp);
      outputEl.textContent = saved.result;
      lastResult = { text: saved.result, format: saved.format, urlList: saved.urlList };
      downloadBtn.disabled = false;

      const ageMinutes = Math.round((Date.now() - saved.savedAt) / 60000);
      const ageText = ageMinutes < 1 ? "just now" : `${ageMinutes} min ago`;
      showMessage(`Restored your last results (fetched ${ageText}).`, "success");
    }
  } catch {
    // no saved result, or storage unavailable - just start fresh
  }
}

init();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  outputEl.textContent = "";
  downloadBtn.disabled = true;
  lastResult = { text: null, format: null, urlList: [] };

  const urlList = inputUrls.value
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urlList.length === 0) {
    showMessage("Please enter at least one URL.", "error");
    return;
  }

  const showDupes = showDupesEl.checked ? "true" : "false";
  const timestamp = getTimestamp();
  const format = formatEl.value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Fetching\u2026";

  try {
    const { result, errors } = await ripLinksUrls(
      urlList,
      showDupes,
      timestamp,
      format
    );

    if (result === null) {
      const detail = errors.length
        ? " Errors: " + errors.map((e) => e.message).join("; ")
        : "";
      showMessage(
        "No archived snapshots were found for the given URL(s)." + detail,
        "error"
      );
      return;
    }

    if (errors.length) {
      showMessage(
        "Some URLs failed and were skipped: " +
          errors.map((e) => e.message).join("; "),
        "warning"
      );
    }

    outputEl.textContent = result;
    lastResult = { text: result, format, urlList };
    downloadBtn.disabled = false;

    try {
      await saveLastResult(browserAPI, {
        rawUrls: inputUrls.value,
        showDupes: showDupesEl.checked,
        timestamp,
        format,
        urlList,
        result,
      });
    } catch {
      // non-fatal - the popup still shows the result, it just won't
      // survive being closed and reopened
    }
  } catch (err) {
    showMessage(err.message || String(err), "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Get Links";
  }
});

// The actual download runs in the background service worker, not here -
// see background.js for why. Sending this message is fire-and-forget from
// the popup's perspective: if the native save dialog closes the popup
// before the response arrives, that's fine, the download already started.
downloadBtn.addEventListener("click", async () => {
  if (!lastResult.text) return;
  
  //read pop up dropdown values for format from the pop up and add to lastResult object
  var e = document.getElementById("format");
  var format = e.options[e.selectedIndex].value;
  lastResult.format = format;

  const filename = buildFilename(lastResult.urlList, lastResult.format);

  try {
    const response = await browserAPI.runtime.sendMessage({
      type: "DOWNLOAD_RESULT",
      payload: { text: lastResult.text, format: lastResult.format, filename },
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Unknown error");
    }
  } catch (err) {
    showMessage(`Download failed: ${err.message}`, "error");
  }
});

clearBtn.addEventListener("click", async () => {
  inputUrls.value = "";
  outputEl.textContent = "";
  clearMessage();
  downloadBtn.disabled = true;
  lastResult = { text: null, format: null, urlList: [] };
  try {
    await clearLastResult(browserAPI);
  } catch {
    // storage unavailable - nothing more we can do here
  }
});
