import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { createLiveHost } from "../dev-tools/simulator/live-host.js";
const source = await readFile(
  new URL("../src/bootstrap.js", import.meta.url),
  "utf8",
);
function frame(
  referrer = "https://developers.tabschat.com/tools/simulator/",
  host,
) {
  const sent = [],
    listeners = [],
    timers = new Map();
  let sequence = 0;
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const window = { parent, host };
  const context = vm.createContext({
    window,
    parent,
    document: { referrer },
    crypto: webcrypto,
    URL,
    Map,
    Promise,
    Object,
    Error,
    setTimeout(fn) {
      const id = ++sequence;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(_, fn) {
      listeners.push(fn);
    },
  });
  vm.runInContext(source, context);
  const deliver = (
    data,
    origin = "https://developers.tabschat.com",
    from = parent,
  ) => listeners.forEach((fn) => fn({ data, origin, source: from }));
  return { window, parent, sent, timers, deliver };
}
test("bootstrap is inert for native hosts, standalone apps, SSR and untrusted parents", () => {
  const native = { v: 1 };
  assert.equal(frame(undefined, native).window.host, native);
  assert.equal(frame("https://evil.example/").window.host, undefined);
  assert.equal(
    frame("https://developers.tabschat.com.evil.example/").window.host,
    undefined,
  );
  assert.equal(frame("https://localhost:4174/").window.host, undefined);
  const self = {};
  self.parent = self;
  vm.runInNewContext(source, { window: self });
  assert.equal(self.host, undefined);
  vm.runInNewContext(source, {});
});
test("bootstrap waits for the trusted parent and rejects wrong origin/source/session responses", async () => {
  const f = frame();
  const ready = f.sent[0].data;
  const pending = f.window.host.identity.getSelf();
  assert.equal(f.sent.length, 1);
  f.deliver(
    { ...ready, type: "connected", mode: "live" },
    "https://evil.example",
  );
  f.deliver({ ...ready, type: "connected", mode: "live" }, undefined, {});
  f.deliver({ ...ready, type: "connected", session: "other", mode: "live" });
  await new Promise(setImmediate);
  assert.equal(f.sent.length, 1);
  f.deliver({ ...ready, type: "connected", mode: "live" });
  await new Promise(setImmediate);
  assert.equal(f.window.host.environment.mode, "live");
  assert.equal(f.sent.length, 2);
  const call = f.sent[1].data;
  assert.equal(call.method, "identity.getSelf");
  assert.equal(f.sent[1].origin, "https://developers.tabschat.com");
  f.deliver(
    { ...call, type: "result", ok: true, result: { did: "wrong" } },
    "https://evil.example",
  );
  f.deliver({ ...call, type: "result", ok: true, result: { did: "real" } });
  assert.equal((await pending).did, "real");
  assert.equal(f.timers.size, 0);
});
test("bootstrap gives an explicit unavailable error when the host never connects", async () => {
  const f = frame("http://127.0.0.1:4174/");
  const pending = f.window.host.identity.getSelf();
  for (const fn of f.timers.values()) fn();
  await assert.rejects(pending, { code: "HOST_UNAVAILABLE" });
});
const manifest = {
  id: "org.example.app",
  name: "App",
  permissions: ["identity.basic"],
  collections: [],
};
function live(api, prompt = async () => "allow") {
  return createLiveHost({
    manifest,
    lexicons: [],
    url: "https://app.example/",
    identity: { did: "did:plc:real" },
    api,
    prompt,
    changed() {},
    log() {},
  });
}
test("live host uses approved policy, explicit consent and real results without fixture state", async () => {
  const calls = [];
  const model = live(async (path, body) => {
    calls.push([path, body]);
    if (path === "open")
      return {
        runtimeId: "runtime",
        manifest: { ...manifest, name: "Approved" },
        grants: [],
        consentRequired: true,
      };
    if (path === "call") return { did: "did:plc:real" };
    return {};
  });
  await model.open();
  assert.equal(model.state().manifest.name, "Approved");
  assert.equal(model.state().live, true);
  assert.equal(model.state().permissions["identity.basic"], "allow");
  assert.equal(calls[1][0], "grant");
  assert.equal((await model.call("identity.getSelf")).did, "did:plc:real");
  await model.setPermissionDecision(false);
  assert.equal(calls.at(-1)[0], "revoke-permissions");
  assert.equal(model.state().permissions["identity.basic"], "deny");
  assert.deepEqual(model.state().records, []);
  model.suspend();
  await assert.rejects(model.call("identity.getSelf"), {
    code: "UNAUTHORIZED",
  });
});
test("closing while a live runtime opens closes the late runtime and never prompts", async () => {
  let resolve;
  const closed = [];
  const model = live(
    (path, body) =>
      path === "open"
        ? new Promise((r) => (resolve = r))
        : Promise.resolve(closed.push(body.runtimeId)),
    () => {
      throw Error("late prompt");
    },
  );
  const pending = model.open();
  model.suspend();
  resolve({ runtimeId: "late", manifest, grants: [], consentRequired: true });
  await assert.rejects(pending, { code: "UNAUTHORIZED" });
  assert.deepEqual(closed, ["late"]);
});
test("live host surfaces unsupported operations without returning fixture success", async () => {
  const model = live(async (path) => {
    if (path === "open")
      return {
        runtimeId: "r",
        manifest,
        grants: manifest.permissions,
        consentRequired: false,
      };
    throw Object.assign(new Error("Native only"), {
      code: "UNSUPPORTED_OPERATION",
    });
  });
  await model.open();
  await assert.rejects(model.call("payments.request", {}), {
    code: "UNSUPPORTED_OPERATION",
  });
});
