/**
 * Background service worker.
 *
 * Downloads are handled here instead of in the popup because a Blob/
 * object URL created inside the popup's own document is invalidated the
 * instant the popup closes - and the popup closes automatically the
 * moment a native "Save As" dialog steals focus (or the user clicks
 * anywhere outside it). The service worker's lifetime isn't tied to the
 * popup, so creating the Blob and starting the download here means the
 * download still completes even though the popup that requested it is
 * already gone by the time the save dialog appears.
 */
import browserAPI from "./compat.js";
import { CONTENT_TYPES } from "./format-utils.js";

// Raw runtime handles for the parts of the messaging API that aren't
// wrapped in compat.js (addListener has the same shape in both browsers).
const nativeRuntime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;

nativeRuntime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "DOWNLOAD_RESULT") {
    return false; // not for us; let other listeners (if any) handle it
  }

  downloadResult(message.payload)
    .then((downloadId) => sendResponse({ ok: true, downloadId }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep the message channel open for the async sendResponse above
});

async function downloadResult({ text, format, filename }) {
  const blob = new Blob([text], { type: CONTENT_TYPES[format] || "text/plain" });
  const url = URL.createObjectURL(blob);

  try {
    const downloadId = await browserAPI.downloads.download({
      url,
      filename,
      saveAs: true,
    });
    // Best-effort cleanup; if the service worker gets suspended before
    // this fires, the object URL is simply released when the worker's
    // context is torn down - not a functional problem for the user.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return downloadId;
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
