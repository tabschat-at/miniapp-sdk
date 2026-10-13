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
    wallet: Object.freeze({
      connect: (input = {}) => call("wallet.connect", input),
      disconnect: () => call("wallet.disconnect"),
      signTransaction: (input) => call("wallet.signTransaction", input),
      signAndExecuteTransaction: (input) => call("wallet.signAndExecuteTransaction", input),
      signPersonalMessage: (input) => call("wallet.signPersonalMessage", input),
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
  installTabsSuiWallet();
}


// Wallet Standard transport for dapps running in an authorized Tabs WebView.
// It carries public requests only. Keys, approvals, building, and signing stay native.
function installTabsSuiWallet(scope = window) {
  if (!scope.addEventListener || !scope.dispatchEvent || !scope.host) return;
  const listeners = new Set();
  let accounts = [];
  function update(next) {
    accounts = Object.freeze(next);
    for (const listener of listeners) listener({ accounts });
  }
  const features = ["sui:signTransaction", "sui:signAndExecuteTransaction", "sui:signPersonalMessage"];
  const wallet = {
    version: "1.0.0", name: "Tabs", chains: Object.freeze(["sui:mainnet"]),
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTYiIGZpbGw9IiM3YzVjZmYiLz48cGF0aCBkPSJNMTYgMTZoMzJ2OEgzNnYyNEgyOHYtMjRIMTZ6IiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==",
    get accounts() { return accounts; },
    features: {
      "standard:connect": { version: "1.0.0", connect: async (options = {}) => {
        const result = await scope.host.wallet.connect({ silent: options.silent === true });
        update(result.accounts.map((a) => Object.freeze({ ...a, publicKey: Uint8Array.from(atob(a.publicKey), (c) => c.charCodeAt(0)), chains: Object.freeze(a.chains), features: Object.freeze(features) })));
        return { accounts };
      } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => {
        update([]); await scope.host.wallet.disconnect();
      } },
      "standard:events": { version: "1.0.0", on: (event, listener) => {
        if (event !== "change") throw new Error("Unsupported wallet event");
        listeners.add(listener); return () => listeners.delete(listener);
      } },
      "sui:signTransaction": { version: "2.0.0", signTransaction: (input) => sign(input, false) },
      "sui:signAndExecuteTransaction": { version: "2.0.0", signAndExecuteTransaction: (input) => sign(input, true) },
      "sui:signPersonalMessage": { version: "1.1.0", signPersonalMessage: async (input) => {
        check(input);
        if (!(input.message instanceof Uint8Array) || input.message.length > 4096) throw new Error("Unsupported message");
        return scope.host.wallet.signPersonalMessage({ address: input.account.address, chain: input.chain ?? "sui:mainnet", message: toBase64(input.message) });
      } },
    },
  };
  function check(input) {
    if (input.signal?.aborted) throw Object.assign(new Error("Request cancelled"), { code: "USER_REJECTED" });
    if (!accounts.some((a) => a === input.account) || (input.chain && input.chain !== "sui:mainnet")) throw new Error("Connect your Sui mainnet account first");
  }
  function toBase64(bytes) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
  async function sign(input, execute) {
    check(input);
    // Preserve SDK coin intents for the native builder; no RPC runs in this adapter.
    const transaction = await input.transaction.toJSON({ supportedIntents: ["CoinWithBalance"] });
    check(input);
    const request = { address: input.account.address, chain: input.chain ?? "sui:mainnet", transaction };
    const result = await scope.host.wallet[execute ? "signAndExecuteTransaction" : "signTransaction"](request);
    if (execute && result.state !== "confirmed") throw Object.assign(new Error("Check this transaction in Tabs Activity."), { code: "TRANSACTION_PENDING", digest: result.digest });
    if (execute && !result.effects) throw Object.assign(new Error("Transaction confirmed; effects are unavailable."), { code: "EFFECTS_UNAVAILABLE", digest: result.digest });
    return execute ? { bytes: result.bytes, signature: result.signature, digest: result.digest, effects: result.effects } : { bytes: result.bytes, signature: result.signature };
  }
  scope.addEventListener("tabs-wallet-disconnect", () => update([]));
  scope.addEventListener("wallet-standard:app-ready", (event) => event.detail.register(wallet));
  scope.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: (api) => api.register(wallet) }));
}
