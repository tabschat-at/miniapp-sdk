import { liveApi } from "./live-session.js";
import { failure } from "./host.js";

/** Uses server-approved policy and real operations; never writes fixture consent. */
export function createLiveHost({
  manifest,
  lexicons,
  url,
  identity,
  prompt,
  changed,
  log,
  api = liveApi,
}) {
  let app = structuredClone(manifest),
    runtime = null,
    epoch = 0,
    active = false,
    reviewed = false;
  let permissions = {},
    missingDeclarations = [];
  let queue = Promise.resolve();
  const state = () => ({
    manifest: structuredClone(app),
    lexicons: structuredClone(lexicons),
    identity,
    permissions: { ...permissions },
    reviewed,
    records: [],
    missingDeclarations: structuredClone(missingDeclarations),
    live: true,
  });
  const publish = () => changed(state());
  const guard = (ticket) => {
    if (!active || ticket !== epoch)
      throw failure("UNAUTHORIZED", "This live app session was closed.");
  };
  const enqueue = (work) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  async function decision(allow) {
    const ticket = epoch,
      id = runtime;
    if (!id) throw failure("UNAUTHORIZED");
    guard(ticket);
    await api(allow ? "grant" : "revoke-permissions", {
      runtimeId: id,
      ...(allow ? { allow: true } : {}),
    });
    guard(ticket);
    reviewed = true;
    permissions = Object.fromEntries(
      app.permissions.map((p) => [p, allow ? "allow" : "deny"]),
    );
    publish();
  }
  return {
    state,
    async open() {
      this.suspend();
      active = true;
      const ticket = epoch;
      const opened = await api("open", { appId: manifest.id, url });
      if (!active || ticket !== epoch) {
        void api("close", { runtimeId: opened.runtimeId }).catch(() => {});
        throw failure("UNAUTHORIZED");
      }
      runtime = opened.runtimeId;
      app = opened.manifest;
      permissions = Object.fromEntries(
        app.permissions.map((p) => [
          p,
          opened.grants.includes(p) ? "allow" : "deny",
        ]),
      );
      reviewed = !opened.consentRequired;
      publish();
      if (opened.consentRequired) {
        const answer = await prompt("permissions", {
          manifest: app,
          live: true,
        });
        guard(ticket);
        await api("grant", { runtimeId: runtime, allow: answer === "allow" });
        guard(ticket);
        reviewed = true;
        permissions = Object.fromEntries(
          app.permissions.map((p) => [
            p,
            answer === "allow" ? "allow" : "deny",
          ]),
        );
        publish();
      }
    },
    async call(method, params = {}) {
      const ticket = epoch,
        id = runtime;
      guard(ticket);
      if (!id) throw failure("UNAUTHORIZED");
      try {
        // Real writes run in order, including behind explicit grant/revocation.
        const result = await enqueue(async () => {
          guard(ticket);
          return api("call", {
            runtimeId: id,
            requestId: crypto.randomUUID(),
            method,
            params,
          });
        });
        guard(ticket);
        log({
          method,
          status: "ok",
          detail: "Live Tabs account · real operation",
        });
        return result;
      } catch (error) {
        log({
          method,
          status: error.code ?? "error",
          detail: `Live host: ${error.message}`,
        });
        throw error;
      }
    },
    suspend() {
      active = false;
      epoch++;
      const id = runtime;
      runtime = null;
      if (id)
        void api("close", { runtimeId: id }).catch((error) =>
          log({
            method: "runtime.close",
            status: error.code ?? "error",
            detail: error.message,
          }),
        );
    },
    setPermissionDecision(allow) {
      return enqueue(() => decision(allow));
    },
    // Native policy revocation applies to the app as a whole.
    revoke() {
      return this.setPermissionDecision(false);
    },
    configure() {},
    reset() {
      this.suspend();
    },
    setIdentity() {
      this.suspend();
    },
    clearPermissions() {
      return this.setPermissionDecision(false);
    },
  };
}
