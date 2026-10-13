import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { request } from "node:http";
import {
  createSimulator,
  demoManifest,
  profiles,
} from "../dev-tools/simulator/host.js";
import { simulatorServer } from "../dev-tools/simulator/server.mjs";
import {
  createProjectLibrary,
  libraryKey,
} from "../dev-tools/simulator/library.js";

function fixture(options = {}) {
  const prompts = [],
    logs = [];
  const simulator = createSimulator({
    prompt: async (kind, detail) => {
      prompts.push({ kind, detail });
      return kind === "permission"
        ? "allow"
        : kind === "share" || kind === "message"
          ? profiles[1].did
          : "confirm";
    },
    log: (entry) => logs.push(entry),
    ...options,
  });
  return { simulator, prompts, logs };
}

test("undeclared attempts are diagnostic only, include all missing scopes, and never prompt or grant", async () => {
  const changes = [];
  const { simulator, prompts, logs } = fixture({
    manifest: {
      ...demoManifest,
      permissions: ["identity.basic"],
      collections: [],
      readCollections: [],
    },
    changed: (state) => changes.push(state),
  });
  const input = {
    collection: "org.example.simulator.note",
    value: { $type: "org.example.simulator.note", text: "A note" },
  };
  for (let attempt = 0; attempt < 2; attempt++)
    await assert.rejects(simulator.call("records.create", input), {
      code: "PERMISSION_DENIED",
    });
  assert.deepEqual(simulator.state().missingDeclarations, [
    {
      field: "permissions",
      name: "records.write",
      methods: ["records.create"],
      attempts: 2,
    },
    {
      field: "collections",
      name: input.collection,
      methods: ["records.create"],
      attempts: 2,
    },
  ]);
  assert.deepEqual(simulator.state().permissions, {});
  assert.deepEqual(simulator.state().records, []);
  assert.equal(prompts.length, 0);
  assert.equal(changes.at(-1).missingDeclarations[0].attempts, 2);
  assert.match(
    logs.at(-1).detail,
    /Missing from manifest: permissions: records.write/,
  );
  const snapshot = simulator.state();
  snapshot.missingDeclarations[0].methods.push("not-a-method");
  assert.deepEqual(simulator.state().missingDeclarations[0].methods, [
    "records.create",
  ]);
  simulator.clearPermissions();
  assert.deepEqual(simulator.state().missingDeclarations, []);
  simulator.revoke("identity.basic");
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  assert.deepEqual(simulator.state().missingDeclarations, []);
  assert.equal(logs.at(-1).detail, "Permission denied by the user.");
});

test("missing read collections are distinguished from writes and reset with the host session", async () => {
  const { simulator, prompts } = fixture();
  await assert.rejects(
    simulator.call("publicData.query", {
      collection: "org.example.other.note",
    }),
    { code: "PERMISSION_DENIED" },
  );
  assert.deepEqual(simulator.state().missingDeclarations, [
    {
      field: "readCollections",
      name: "org.example.other.note",
      methods: ["publicData.query"],
      attempts: 1,
    },
  ]);
  assert.equal(prompts.length, 0);
  simulator.setIdentity(profiles[1]);
  assert.deepEqual(simulator.state().missingDeclarations, []);
});

test("signed-in host scopes capabilities, remembers decisions and supports revocation", async () => {
  const { simulator, prompts } = fixture();
  assert.equal(
    (await simulator.call("identity.getSelf")).handle,
    "alice.demo.invalid",
  );
  await simulator.call("identity.getSelf");
  assert.deepEqual(
    prompts.map((p) => p.kind),
    ["permission"],
  );
  simulator.revoke("identity.basic");
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  simulator.clearPermissions();
  await simulator.call("identity.getSelf");
  assert.equal(prompts.length, 2);
  simulator.configure({ permissionMode: "allow" });
  await assert.rejects(simulator.call("wallet.connect"), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(
    simulator.call("records.create", {
      collection: "other.collection.record",
      value: {},
    }),
    { code: "PERMISSION_DENIED" },
  );
  simulator.signOut();
  assert.equal(simulator.state().identity, null);
  assert.deepEqual(simulator.state().permissions, {});
});

test("signed-out hosts and denied consent return actionable errors", async () => {
  const cancelled = fixture({
    identity: null,
    prompt: async () =>
      assert.fail("Signed-out hosts must not prompt inside an app"),
  }).simulator;
  await assert.rejects(cancelled.call("identity.getSelf"), {
    code: "UNAUTHORIZED",
  });
  const { simulator, prompts } = fixture();
  simulator.configure({ permissionMode: "deny" });
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  assert.deepEqual(
    prompts.map((p) => p.kind),
    [],
  );
});

test("session changes invalidate prompts and concurrent prompts reject with BUSY", async () => {
  let answer;
  const { simulator } = fixture({
    prompt: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const pending = simulator.call("identity.getSelf");
  await assert.rejects(simulator.call("identity.getSelf"), { code: "BUSY" });
  simulator.reset();
  answer("allow");
  await assert.rejects(pending, { code: "UNAUTHORIZED" });
  assert.equal(simulator.state().identity.did, profiles[0].did);
  const consent = fixture({
    prompt: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  }).simulator;
  const call = consent.call("identity.getSelf");
  await new Promise((resolve) => setImmediate(resolve));
  consent.revoke("identity.basic");
  answer("allow");
  await assert.rejects(call, { code: "UNAUTHORIZED" });
  assert.equal(consent.state().permissions["identity.basic"], "deny");
});

test("records preserve ownership, pagination, update/delete and reset boundaries", async () => {
  const { simulator } = fixture();
  const collection = demoManifest.collections[0],
    value = { $type: collection, text: "A" };
  const first = await simulator.call("records.create", { collection, value });
  await simulator.call("records.create", {
    collection,
    value: { ...value, text: "B" },
  });
  const rkey = first.uri.split("/").at(-1);
  await simulator.call("records.update", {
    collection,
    rkey,
    value: { ...value, text: "Updated" },
  });
  const page = await simulator.call("publicData.query", {
    collection,
    query: { limit: "1" },
  });
  assert.equal(page.records[0].record.text, "Updated");
  assert.equal(page.nextCursor, "1");
  assert.equal(
    (
      await simulator.call("publicData.query", {
        collection,
        query: { cursor: page.nextCursor },
      })
    ).records.length,
    1,
  );
  await assert.rejects(
    simulator.call("records.update", { collection, rkey: "foreign", value }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    simulator.call("publicData.query", { collection, query: { limit: "0" } }),
    { code: "INVALID_INPUT" },
  );
  await simulator.call("records.delete", { collection, rkey });
  assert.equal(simulator.state().records.length, 1);
  simulator.reset();
  assert.equal(simulator.state().records.length, 0);
});

test("contact previews stay separate; payments and authentication return obvious fixtures", async () => {
  const { simulator, prompts, logs } = fixture();
  const recipientDid = profiles[1].did;
  await simulator.call("chat.openConversation", { recipientDid });
  assert.equal(prompts.at(-1).kind, "conversation");
  assert.deepEqual(
    await simulator.call("simulator.shareToContact", {
      url: "https://example.org",
    }),
    { status: "simulated", recipientDid },
  );
  assert.deepEqual(
    await simulator.call("simulator.messageContact", { text: "Hello" }),
    { status: "simulated", recipientDid },
  );
  await assert.rejects(simulator.call("chat.shareToContact", {}), {
    code: "UNSUPPORTED_OPERATION",
  });
  await assert.rejects(
    simulator.call("simulator.shareToContact", { url: "javascript:alert(1)" }),
    { code: "INVALID_INPUT" },
  );
  const payment = { recipientDid, asset: "USDC", amount: "0.01" };
  assert.deepEqual(await simulator.call("payments.request", payment), {
    status: "cancelled",
  });
  simulator.configure({ paymentResult: "sent" });
  assert.deepEqual(await simulator.call("payments.request", payment), {
    status: "sent",
    digest: "SIMULATOR_ONLY_NO_TRANSACTION",
  });
  await assert.rejects(
    simulator.call("payments.request", { ...payment, amount: "0" }),
    { code: "INVALID_INPUT" },
  );
  const assertion = await simulator.call("auth.getAssertion", {
    audience: "https://example.org",
    nonce: "a".repeat(43),
  });
  assert.equal(assertion.token, "SIMULATOR_ONLY_UNSIGNED_ASSERTION");
  assert.equal(
    logs.find((entry) => entry.method === "simulator.messageContact").detail,
    "Message preview → Bob Rivera: Hello",
  );
  assert.deepEqual(
    logs.find((entry) => entry.method === "auth.getAssertion"),
    { method: "auth.getAssertion", status: "ok" },
  );
  assert.ok(!JSON.stringify(logs).includes(assertion.token));
  assert.ok(!JSON.stringify(logs).includes("a".repeat(43)));
  simulator.configure({ offline: true });
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "UNAVAILABLE",
  });
  assert.throws(() => simulator.configure({ latency: -1 }), {
    code: "INVALID_INPUT",
  });
});

test("simulator serves only public assets and injects local HTML before app scripts", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "tabs-simulator-"));
  const app = join(temporary, "app");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(app);
  await writeFile(
    join(app, "index.html"),
    '<!doctype html><head><script src="./app.js"></script></head>',
  );
  await writeFile(join(app, "app.js"), "window.appStarted = true");
  await writeFile(join(app, "manifest.json"), JSON.stringify(demoManifest));
  await writeFile(join(temporary, "secret.json"), '{"private":true}');
  await writeFile(join(app, ".env.json"), '{"private":true}');
  await symlink(join(temporary, "secret.json"), join(app, "escape.json"));
  const server = await simulatorServer({ appDir: app });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status, 200);
    const html = await fetch(`${base}/app/index.html`).then((r) => r.text());
    assert.ok(html.indexOf("/bridge.js") < html.indexOf("./app.js"));
    assert.doesNotMatch(
      await readFile(join(app, "index.html"), "utf8"),
      /bridge.js/,
    );
    assert.equal(
      (await fetch(`${base}/config.json`).then((r) => r.json())).appUrl,
      "/app/index.html",
    );
    for (const path of [
      "/server.mjs",
      "/app/.env.json",
      "/app/escape.json",
      "/app/%2e%2e%2fsecret.json",
      "/package.json",
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      request(base, { headers: { Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
        .on("error", reject)
        .end();
    });
    assert.equal(foreignHostStatus, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("browser bridge installs before app code, checks reply origin/source/session and preserves a real host", async () => {
  const source = await readFile(
    new URL("../dev-tools/simulator/bridge.js", import.meta.url),
    "utf8",
  );
  const parent = { postMessage: (message) => posted.push(message) },
    posted = [],
    listeners = [];
  const window = { parent },
    context = vm.createContext({
      window,
      parent,
      document: { currentScript: { src: "http://127.0.0.1:4174/bridge.js" } },
      URL,
      Map,
      Promise,
      Object,
      Error,
      crypto: { randomUUID: () => "session" },
      setTimeout,
      clearTimeout,
      addEventListener: (_, listener) => listeners.push(listener),
    });
  vm.runInContext(source, context);
  assert.equal(window.host.v, 1);
  assert.equal(typeof window.tabsSimulator.shareToContact, "function");
  assert.equal(window.host.chat.shareToContact, undefined);
  const pending = window.host.identity.getSelf();
  const request = posted.at(-1);
  const reply = {
    channel: request.channel,
    type: "result",
    session: request.session,
    id: request.id,
    ok: true,
    result: { handle: "fixture" },
  };
  listeners[0]({ source: parent, origin: "https://evil.example", data: reply });
  listeners[0]({ source: {}, origin: "http://127.0.0.1:4174", data: reply });
  listeners[0]({
    source: parent,
    origin: "http://127.0.0.1:4174",
    data: { ...reply, session: "other" },
  });
  let done = false;
  pending.then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  listeners[0]({
    source: parent,
    origin: "http://127.0.0.1:4174",
    data: reply,
  });
  assert.equal((await pending).handle, "fixture");
  const original = { v: 1 };
  context.window = { parent, host: original };
  vm.runInContext(source, context);
  assert.equal(context.window.host, original);
});

test("first run reviews the entire manifest before app calls; reopening remembers the decision", async () => {
  const prompts = [];
  const simulator = createSimulator({
    prompt: async (kind, detail) => {
      prompts.push({ kind, detail });
      return "allow";
    },
  });
  await simulator.open();
  assert.deepEqual(
    prompts.map((item) => item.kind),
    ["permissions"],
  );
  assert.deepEqual(
    prompts[0].detail.manifest.permissions,
    demoManifest.permissions,
  );
  await simulator.call("identity.getSelf");
  assert.deepEqual(
    prompts.map((item) => item.kind),
    ["permissions"],
  );
  simulator.suspend();
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "UNAUTHORIZED",
  });
  await simulator.open();
  await simulator.call("identity.getSelf");
  assert.equal(prompts.length, 1);
  simulator.setPermissionDecision(false);
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  simulator.suspend();
  await simulator.open();
  assert.equal(prompts.length, 1);
  simulator.setPermissionDecision(true);
  assert.equal(
    (await simulator.call("identity.getSelf")).handle,
    profiles[0].handle,
  );
  simulator.reset();
  await simulator.open();
  assert.equal(prompts.at(-1).kind, "permissions");
});

test("declining first-run consent opens the app with denied capabilities and no repeated prompts", async () => {
  const prompts = [];
  const simulator = createSimulator({
    prompt: async (kind) => {
      prompts.push(kind);
      return "deny";
    },
  });
  await simulator.open();
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(simulator.call("identity.getSelf"), {
    code: "PERMISSION_DENIED",
  });
  assert.deepEqual(prompts, ["permissions"]);
  assert.equal(simulator.state().reviewed, true);
  assert.ok(
    Object.values(simulator.state().permissions).every(
      (value) => value === "deny",
    ),
  );
});

test("closing a project invalidates a pending first-run review", async () => {
  let answer;
  const simulator = createSimulator({
    prompt: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const opening = simulator.open();
  simulator.suspend();
  answer("allow");
  await assert.rejects(opening, { code: "UNAUTHORIZED" });
  assert.deepEqual(simulator.state().permissions, {});
  assert.equal(simulator.state().reviewed, false);
});

test("project library persists separate decisions, renews changed manifests and resets first run", async () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
  };
  const options = { storage, baseUrl: "http://127.0.0.1:4174" };
  let library = createProjectLibrary(options);
  const first = library.add({ url: "/demo.html", manifest: demoManifest });
  const second = library.add({
    url: "http://localhost:3000",
    manifest: { ...demoManifest, id: "org.example.other", name: "Other app" },
  });
  library.remember(first.url, {
    manifest: first.manifest,
    reviewed: true,
    permissions: { "identity.basic": "allow", "wallet.connect": "allow" },
  });
  library.remember(second.url, {
    manifest: second.manifest,
    reviewed: true,
    permissions: { "identity.basic": "deny" },
  });
  library = createProjectLibrary(options);
  assert.equal(library.list().length, 2);
  assert.deepEqual(library.get(first.url).permissions, {
    "identity.basic": "allow",
  });
  assert.deepEqual(library.get(second.url).permissions, {
    "identity.basic": "deny",
  });
  const reordered = Object.fromEntries(Object.entries(demoManifest).reverse());
  assert.equal(
    library.add({ url: first.url, manifest: reordered }).reviewed,
    true,
  );
  const updated = library.add({
    url: first.url,
    manifest: { ...demoManifest, networkAccess: ["https://api.example.org"] },
  });
  assert.equal(updated.reviewed, false);
  assert.deepEqual(updated.permissions, {});
  library.forgetConsent(second.url);
  assert.equal(library.get(second.url).reviewed, false);
  library.remove(first.url);
  library = createProjectLibrary(options);
  assert.equal(library.get(first.url), undefined);
  assert.equal(library.list().length, 1);
  assert.throws(
    () => library.add({ url: "javascript:alert(1)", manifest: demoManifest }),
    { code: "INVALID_INPUT" },
  );
  assert.throws(
    () =>
      library.add({
        url: "https://user:password@example.org/",
        manifest: demoManifest,
      }),
    { code: "INVALID_INPUT" },
  );
});

test("saved project consent is restored into isolated hosts and storage failures keep the library usable", async () => {
  const { simulator: first } = fixture();
  first.configure({ permissionMode: "allow" });
  await first.open();
  const restored = createSimulator({
    manifest: demoManifest,
    consent: first.state(),
    identity: profiles[1],
    prompt: async () => assert.fail("Restored consent must not prompt"),
  });
  await restored.open();
  assert.equal(
    (await restored.call("identity.getSelf")).handle,
    profiles[1].handle,
  );
  restored.setPermissionDecision(false);
  assert.equal(first.state().permissions["identity.basic"], "allow");
  const errors = [];
  const library = createProjectLibrary({
    storage: {
      getItem: () => "broken JSON",
      setItem: () => {
        throw new Error("Storage blocked");
      },
    },
    baseUrl: "http://localhost:4174",
    onStorageError: (error) => errors.push(error),
  });
  library.add({ url: "/demo.html", manifest: demoManifest });
  assert.equal(library.list().length, 1);
  assert.equal(errors.length, 2);
  const bad = createProjectLibrary({
    storage: {
      getItem: (key) =>
        key === libraryKey
          ? JSON.stringify({
              v: 1,
              projects: [{ url: "javascript:bad", manifest: demoManifest }],
            })
          : null,
    },
    baseUrl: "http://localhost:4174",
  });
  assert.deepEqual(bad.list(), []);
});
