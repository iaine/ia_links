/**
 * Tiny cross-browser compatibility shim.
 *
 * Firefox exposes a promise-based `browser` global natively. Chrome only
 * exposes callback-based `chrome.*` APIs (MV3 Chrome does support promises
 * for many APIs when the callback is omitted, but not reliably across all
 * the methods used here) - this wraps just the handful of calls this
 * extension actually uses so popup.js/options.js never need to branch on
 * which browser they're running in.
 *
 * Intentionally NOT a full polyfill (like mozilla's webextension-polyfill) -
 * just enough surface area for this extension.
 */

function wrapChrome() {
  function wrapStorageArea(area) {
    return {
      get: (keys) =>
        new Promise((resolve, reject) => {
          area.get(keys, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        }),
      set: (items) =>
        new Promise((resolve, reject) => {
          area.set(items, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        }),
      remove: (keys) =>
        new Promise((resolve, reject) => {
          area.remove(keys, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        }),
    };
  }

  return {
    storage: {
      sync: wrapStorageArea(chrome.storage.sync),
      local: wrapStorageArea(chrome.storage.local),
    },
    downloads: {
      download: (options) =>
        new Promise((resolve, reject) => {
          chrome.downloads.download(options, (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(downloadId);
            }
          });
        }),
    },
    runtime: {
      openOptionsPage: () =>
        new Promise((resolve) => chrome.runtime.openOptionsPage(resolve)),
      sendMessage: (message) =>
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        }),
    },
  };
}

// eslint-disable-next-line no-undef
const browserAPI = typeof browser !== "undefined" ? browser : wrapChrome();

export default browserAPI;
