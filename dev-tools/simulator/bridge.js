/* DEV ONLY: load before app scripts, only inside the Tabs simulator frame. */
(() => {
  if (window.host || window.parent === window) return;
  const script = document.currentScript;
  const simulatorOrigin = new URL(script.src).origin;
  const channel = "tabs-sdk-simulator-v1";
  const pending = new Map();
  const session = crypto.randomUUID();
  let count = 0;
  function call(method, params = {}) {
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
      data.session !== session ||
      data.type !== "result"
    )
      return;
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
  Object.defineProperty(window, "tabsSimulator", {
    value: Object.freeze({
      shareToContact: (input) => call("simulator.shareToContact", input),
      messageContact: (input) => call("simulator.messageContact", input),
    }),
  });
  parent.postMessage({ channel, type: "ready", session }, simulatorOrigin);
})();
