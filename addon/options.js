import browserAPI from "./compat.js";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";

const form = document.getElementById("optionsForm");
const showDupesEl = document.getElementById("defaultShowDupes");
const formatEl = document.getElementById("defaultFormat");
const messageEl = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");

function applySettingsToForm(settings) {
  showDupesEl.checked = !!settings.showDupes;
  formatEl.value = settings.format;
  const radio = form.querySelector(
    `input[name="defaultTimestamp"][value="${settings.timestamp}"]`
  );
  if (radio) radio.checked = true;
}

function readSettingsFromForm() {
  const checked = form.querySelector('input[name="defaultTimestamp"]:checked');
  return {
    showDupes: showDupesEl.checked,
    timestamp: checked ? checked.value : "",
    format: formatEl.value,
  };
}

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = `message ${kind}`;
  messageEl.hidden = false;
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => {
    messageEl.hidden = true;
  }, 2500);
}

async function init() {
  try {
    const settings = await loadSettings(browserAPI);
    applySettingsToForm(settings);
  } catch (err) {
    showMessage(`Couldn't load saved settings: ${err.message}`, "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveSettings(browserAPI, readSettingsFromForm());
    showMessage("Saved.", "success");
  } catch (err) {
    showMessage(`Couldn't save settings: ${err.message}`, "error");
  }
});

resetBtn.addEventListener("click", async () => {
  applySettingsToForm(DEFAULT_SETTINGS);
  try {
    await saveSettings(browserAPI, DEFAULT_SETTINGS);
    showMessage("Reset to defaults.", "success");
  } catch (err) {
    showMessage(`Couldn't save settings: ${err.message}`, "error");
  }
});

init();
