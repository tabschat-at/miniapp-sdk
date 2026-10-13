/* Tabs SDK browser-host bootstrap. Load before app code; native Tabs stays authoritative. */
(() => {
  if (typeof window === "undefined" || window.host || window.parent === window)
    return;
  let simulatorOrigin;
  try {
    const parentUrl = new URL(document.referrer);
    const hosted = parentUrl.origin === "https://developers.tabschat.com";
    const local =
      parentUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parentUrl.hostname);
    if (!hosted && !local) return;
    simulatorOrigin = parentUrl.origin;
  } catch {
    return;
  }
  let mode = "connecting",
    finishConnection;
  const connected = new Promise((resolve) => {
    finishConnection = resolve;
  });
  const connectionTimeout = setTimeout(() => finishConnection(false), 5000);
  const channel = "tabs-sdk-simulator-v1";
  const pending = new Map();
  const session = crypto.randomUUID();
  let count = 0;
  async function call(method, params = {}) {
    if (!(await connected))
      throw Object.assign(new Error("The Tabs browser host did not connect."), {
        code: "HOST_UNAVAILABLE",
      });
    if (pending.size >= 8)
      return Promise.reject(
        Object.assign(new Error("Too many simulator calls"), {
          code: "RATE_LIMITED",
        }),
      );
    const id = `${session}:${++count}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          Object.assign(new Error("Simulator request timed out"), {
            code: "TIMEOUT",
          }),
        );
      }, 300000);
      pending.set(id, { resolve, reject, timer });
      try {
        parent.postMessage(
          { channel, type: "call", session, id, method, params },
          simulatorOrigin,
        );
      } catch {
        pending.delete(id);
        clearTimeout(timer);
        reject(
          Object.assign(new Error("Invalid simulator request"), {
            code: "INVALID_INPUT",
          }),
        );
      }
    });
  }
  addEventListener("message", (event) => {
    const data = event.data;
    if (
      event.source !== parent ||
      event.origin !== simulatorOrigin ||
      data?.channel !== channel ||
      data.session !== session
    )
      return;
    if (
      data.type === "connected" &&
      ["simulated", "live"].includes(data.mode)
    ) {
      mode = data.mode;
      clearTimeout(connectionTimeout);
      finishConnection(true);
      return;
    }
    if (data.type !== "result") return;
    const item = pending.get(data.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(data.id);
    if (data.ok) item.resolve(data.result);
    else
      item.reject(
        Object.assign(new Error(data.error.message), { code: data.error.code }),
      );
  });
  const group = (methods) =>
    Object.freeze(
      Object.fromEntries(
        methods.map(([name, method, handle]) => [
          name,
          (input) => call(method, handle ? { handle: input } : input),
        ]),
      ),
    );
  Object.defineProperty(window, "host", {
    value: Object.freeze({
      v: 1,
      environment: Object.freeze({
        kind: "browser",
        get mode() {
          return mode;
        },
      }),
      identity: group([
        ["getSelf", "identity.getSelf"],
        ["resolveHandle", "identity.resolveHandle", true],
      ]),
      auth: group([["getAssertion", "auth.getAssertion"]]),
      records: group(
        ["create", "update", "delete"].map((name) => [name, `records.${name}`]),
      ),
      publicData: group([["query", "publicData.query"]]),
      chat: group([["openConversation", "chat.openConversation"]]),
      payments: group([
        ["resolve", "payments.resolve", true],
        ["request", "payments.request"],
      ]),
      wallet: group(
        [
          "connect",
          "disconnect",
          "signTransaction",
          "signAndExecuteTransaction",
          "signPersonalMessage",
        ].map((name) => [name, `wallet.${name}`]),
      ),
      blobs: Object.freeze({
        upload: (file, options = {}) =>
          call("blobs.upload", {
            ...options,
            size: file?.size,
            mimeType: file?.type,
          }),
      }),
    }),
    writable: false,
    configurable: false,
  });
  parent.postMessage({ channel, type: "ready", session }, simulatorOrigin);
})();
