/* Public browser SDK. Transport messages are requests, never credentials. */
function installTabsHost(transport, runtimeSessionId) {
  const pending = new Map();
  let calls = 0;
  transport.onmessage = (event) => {
    let response;
    try {
      response = JSON.parse(event.data);
    } catch {
      return;
    }
    if (response.v !== 1 || response.runtimeSessionId !== runtimeSessionId)
      return;
    const item = pending.get(response.requestId);
    if (!item) return;
    pending.delete(response.requestId);
    clearTimeout(item.timer);
    if (response.ok === true) item.resolve(response.result);
    else
      item.reject(
        Object.assign(new Error("The host did not complete this request."), {
          code: response.error?.code || "UNAVAILABLE",
        }),
      );
  };
  function call(method, params = {}) {
    if (pending.size >= 8 || calls >= 256)
      return Promise.reject(
        Object.assign(new Error("Please reopen this app."), {
          code: "RATE_LIMITED",
        }),
      );
    const requestId = Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    const message = JSON.stringify({
      v: 1,
      runtimeSessionId,
      requestId,
      method,
      params,
    });
    if (new TextEncoder().encode(message).length > 65536)
      return Promise.reject(
        Object.assign(new Error("Request is too large."), {
          code: "INVALID_INPUT",
        }),
      );
    calls++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          Object.assign(
            new Error(
              "The request is still being checked. Reopen the host to check a payment.",
            ),
            { code: "TIMEOUT" },
          ),
        );
      }, 300000);
      pending.set(requestId, { resolve, reject, timer });
      try {
        transport.postMessage(message);
      } catch {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(
          Object.assign(new Error("Host unavailable."), {
            code: "UNAVAILABLE",
          }),
        );
      }
    });
  }
  const host = Object.freeze({
    v: 1,
    blobs: Object.freeze({
      upload: async (file, { collection } = {}) => {
        if (
          !(file instanceof Blob) ||
          !file.size ||
          file.size > 64 * 1024 * 1024 ||
          typeof collection !== "string"
        )
          throw Object.assign(new Error("Choose a supported file."), {
            code: "INVALID_INPUT",
          });
        const mimeType = file.type || "application/octet-stream";
        const permit = await call("blobs.prepareUpload", {
          collection,
          size: file.size,
          mimeType,
        });
        const url = new URL(permit.url);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !/^\/miniapps\/blobs\/[0-9a-f-]{36}$/.test(url.pathname)
        )
          throw Object.assign(new Error("Upload unavailable."), {
            code: "UNAVAILABLE",
          });
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 120000);
        try {
          const response = await fetch(url.href, {
            method: "POST",
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
            headers: {
              authorization: `Bearer ${permit.token}`,
              "content-type": mimeType,
            },
            body: file,
          });
          const result = await response.json();
          if (!response.ok)
            throw Object.assign(new Error("Upload failed."), {
              code: result.error?.code || "UNAVAILABLE",
            });
          return result.blob;
        } finally {
          clearTimeout(timer);
        }
      },
    }),
    auth: Object.freeze({
      getAssertion: (input) => call("auth.getAssertion", input),
    }),
    identity: Object.freeze({
      getSelf: () => call("identity.getSelf"),
      resolveHandle: (handle) => call("identity.resolveHandle", { handle }),
    }),
    records: Object.freeze({
      create: (input) => call("records.create", input),
      update: (input) => call("records.update", input),
      delete: (input) => call("records.delete", input),
    }),
    payments: Object.freeze({
      resolve: (handle) => call("payments.resolve", { handle }),
      request: (input) => call("payments.request", input),
    }),
    chat: Object.freeze({
      openConversation: (input) => call("chat.openConversation", input),
    }),
    publicData: Object.freeze({
      query: (input) => call("publicData.query", input),
    }),
  });
  Object.defineProperty(window, "host", {
    value: host,
    writable: false,
    configurable: false,
  });
}
