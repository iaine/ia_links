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

//reformat the text to csv format by replacing url to 
// url, page, pagewithoutlink, date object
function to_csv (text) {
  let _text = text.split("\n");
  _text.forEach((line, index) => {
    if (line.trim().length !== 0) {
      const idx = line.split("/");
      const http = idx.slice(5).join("/");
      //const http = (idx[(idx.length - 2)].trim().startsWith("http") ? idx[(idx.length - 2)] +  idx[(idx.length - 1)] : idx[idx.length - 1]);
      _text[index] = [http, (line), line.replace(/id_/, ""), '\"' + idx[4] + '\"'].join(",");
    }
  });
  
  return ["url", "page", "pagewithoutlink", "date","\n"] + _text.join("\n");
};

//format the data into a plain html page of links, so that it can be opened in a browser and clicked on.
function to_html (text) {
  let _text = text.split("\n");
  _text.forEach((line, index) => {
    if (line.trim().length !== 0) {
      _text[index] = "<a href='" + line + "'>" + line + "</a>";
    }
  });
  
  return "<!DOCTYPE html><html><head><title>Links</title></head><body>" + _text.join("<br>") + "</body></html>";
}

async function downloadResult({ text, format, filename }) {

  if (format == "csv") {
    //reformat the text to csv format by replacing new lines with commas.
    text = to_csv(text);
  } else if (format == "html") {
    text = to_html(text);
  }

  const blob = new Blob([text], { type: CONTENT_TYPES[format] || "text/plain" });

  const url = (globalThis.URL ? URL : webkitURL).createObjectURL(blob);

  try {
    const downloadId = await browserAPI.downloads.download({
      url,
      filename,
      saveAs: true,
    });
    // Best-effort cleanup; if the service worker gets suspended before
    // this fires, the object URL is simply released when the worker's
    // context is torn down - not a functional problem for the user.
    setTimeout(() => (globalThis.URL ? URL : webkitURL).revokeObjectURL(url), 60_000);
    return downloadId;
  } catch (err) {
    (globalThis.URL ? URL : webkitURL).revokeObjectURL(url);
    throw err;
  }
}