(() => {
  const runtimeApi = globalThis.browser || globalThis.chrome;
  const vendor = detectBrowserVendor();

  function detectBrowserVendor() {
    const ua = globalThis.navigator?.userAgent || "";
    if (/Firefox\//i.test(ua)) return "firefox";
    if (/Edg\//i.test(ua)) return "edge";
    if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua)) return "chrome";
    return "unknown";
  }

  function promisifyCall(scope, method, ...args) {
    if (!scope?.[method]) return Promise.reject(new Error(`Browser API not available: ${method}`));
    if (globalThis.browser && runtimeApi === globalThis.browser) {
      try {
        return Promise.resolve(scope[method](...args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    try {
      return new Promise((resolve, reject) => {
        scope[method](...args, (value) => {
          const error = runtimeApi?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || String(error)));
          } else {
            resolve(value);
          }
        });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  globalThis.litBrowser = {
    vendor,
    raw: runtimeApi,
    runtime: {
      get id() {
        return runtimeApi?.runtime?.id || "";
      },
      onMessage: runtimeApi?.runtime?.onMessage,
      sendMessage(message) {
        return promisifyCall(runtimeApi?.runtime, "sendMessage", message);
      },
      openOptionsPage() {
        return promisifyCall(runtimeApi?.runtime, "openOptionsPage");
      }
    },
    storage: {
      onChanged: runtimeApi?.storage?.onChanged,
      sync: {
        get(keys) {
          return promisifyCall(runtimeApi?.storage?.sync, "get", keys);
        },
        set(value) {
          return promisifyCall(runtimeApi?.storage?.sync, "set", value);
        }
      },
      local: {
        get(keys) {
          return promisifyCall(runtimeApi?.storage?.local, "get", keys);
        },
        set(value) {
          return promisifyCall(runtimeApi?.storage?.local, "set", value);
        }
      }
    },
    tabs: {
      sendMessage(tabId, message) {
        return promisifyCall(runtimeApi?.tabs, "sendMessage", tabId, message);
      }
    },
    contextMenus: runtimeApi?.contextMenus,
    commands: runtimeApi?.commands
  };
})();
