import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { getHost, recordKey, selectFiles } from "../src/index.js";
import { createMockHost, installMockHost } from "../dev/mock-host.js";
import { validatePackage, validateManifest } from "../tools/validate.mjs";
import { previewServer } from "../dev/server.mjs";
import { createTabsPublicReader } from "../examples/tabs-appview/backend-cache.mjs";
const root = new URL("../", import.meta.url);
const recipe = (
  await validatePackage(new URL("examples/recipe-notebook/", root))
).manifest;

test("host helper fails outside Tabs and cannot silently substitute a mock", () => {
  assert.throws(() => getHost({}), { code: "HOST_UNAVAILABLE" });
  assert.throws(() => getHost({ host: { v: 2 } }), {
    code: "HOST_UNAVAILABLE",
  });
  const scope = {};
  installMockHost(recipe, {}, scope);
  assert.equal(getHost(scope).v, 1);
  assert.throws(() => installMockHost(recipe, {}, scope), /replace/);
  assert.throws(
    () =>
      recordKey(
        "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/other.collection.record/a",
        recipe.collections[0],
      ),
    /Unexpected/,
  );
});
test("all examples pass standalone preflight; new capability and missing schema fail", async () => {
  for (const name of [
    "hello-tabs",
    "recipe-notebook",
    "native-actions",
    "own-backend",
  ])
    await validatePackage(new URL(`examples/${name}/`, root));
  assert.throws(
    () => validateManifest({ ...recipe, permissions: ["wallet.sign"] }),
    /Unknown permission/,
  );
  assert.throws(() => validateManifest(recipe), /Include a record Lexicon/);
  assert.throws(
    () =>
      validateManifest({
        ...recipe,
        networkAccess: ["https://api.tabschat.com"],
      }),
    /Network access/,
  );
});
test("mock scopes writes, supports update/delete, and denied grants stay denied", async () => {
  const host = createMockHost(recipe);
  const collection = recipe.collections[0],
    value = { $type: collection, title: "Soup", ingredients: [] };
  const saved = await host.records.create({ collection, value });
  const rkey = recordKey(saved.uri, collection);
  await host.records.update({
    collection,
    rkey,
    value: { ...value, title: "Stew" },
  });
  await assert.rejects(host.publicData.query({ collection }), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(
    host.records.update({ collection, rkey: "foreign", value }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    host.records.create({ collection: "other.public.record", value }),
    { code: "PERMISSION_DENIED" },
  );
  await host.records.delete({ collection, rkey });
  const denied = createMockHost(recipe, { denied: true });
  await assert.rejects(denied.records.create({ collection, value }), {
    code: "PERMISSION_DENIED",
  });
});
test("mock payment requests always cancel and require permission", async () => {
  const manifest = (
    await validatePackage(new URL("examples/native-actions/", root))
  ).manifest;
  const host = createMockHost(manifest);
  const recipient = await host.payments.resolve("bob.demo.invalid");
  assert.deepEqual(
    await host.payments.request({
      recipientDid: recipient.did,
      asset: "USDC",
      amount: "0.01",
    }),
    { status: "cancelled" },
  );
  await assert.rejects(
    createMockHost(manifest, { denied: true }).payments.request({}),
    { code: "PERMISSION_DENIED" },
  );
});
test("reference bridge contract carries each named method with matching request shape", async () => {
  const source = await readFile(new URL("reference/bridge.js", root), "utf8");
  const context = vm.createContext({
    window: {},
    crypto: webcrypto,
    TextEncoder,
    Map,
    Promise,
    Error,
    JSON,
    Object,
    Uint8Array,
    setTimeout,
    clearTimeout,
  });
  let posted;
  context.transport = {
    postMessage(message) {
      posted = JSON.parse(message);
    },
  };
  vm.runInContext(source, context);
  vm.runInContext("installTabsHost(transport,'fixture')", context);
  const host = context.window.host;
  const inputs = [
    [
      "auth.getAssertion",
      () =>
        host.auth.getAssertion({
          audience: "https://api.example.org",
          nonce: "n".repeat(43),
        }),
      { audience: "https://api.example.org", nonce: "n".repeat(43) },
    ],
    ["identity.getSelf", () => host.identity.getSelf(), {}],
    [
      "identity.resolveHandle",
      () => host.identity.resolveHandle("bob.demo.invalid"),
      { handle: "bob.demo.invalid" },
    ],
    [
      "records.create",
      () =>
        host.records.create({
          collection: "org.example.recipes.recipe",
          value: { $type: "org.example.recipes.recipe" },
        }),
      {
        collection: "org.example.recipes.recipe",
        value: { $type: "org.example.recipes.recipe" },
      },
    ],
    [
      "records.update",
      () =>
        host.records.update({
          collection: "org.example.recipes.recipe",
          rkey: "a",
          value: {},
        }),
      { collection: "org.example.recipes.recipe", rkey: "a", value: {} },
    ],
    [
      "records.delete",
      () =>
        host.records.delete({
          collection: "org.example.recipes.recipe",
          rkey: "a",
        }),
      { collection: "org.example.recipes.recipe", rkey: "a" },
    ],
    [
      "publicData.query",
      () =>
        host.publicData.query({
          collection: "org.example.recipes.recipe",
          query: { limit: "20" },
        }),
      { collection: "org.example.recipes.recipe", query: { limit: "20" } },
    ],
    [
      "payments.resolve",
      () => host.payments.resolve("bob.demo.invalid"),
      { handle: "bob.demo.invalid" },
    ],
    [
      "payments.request",
      () =>
        host.payments.request({
          recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
          asset: "USDC",
          amount: "0.01",
        }),
      {
        recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
        asset: "USDC",
        amount: "0.01",
      },
    ],
    [
      "chat.openConversation",
      () =>
        host.chat.openConversation({
          recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
        }),
      { recipientDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb" },
    ],
  ];
  for (const [method, call, params] of inputs) {
    const promise = call();
    assert.equal(posted.method, method);
    assert.deepEqual(posted.params, params);
    context.transport.onmessage({
      data: JSON.stringify({
        v: 1,
        runtimeSessionId: "fixture",
        requestId: posted.requestId,
        ok: true,
        result: null,
      }),
    });
    await promise;
  }
});
test("preview serves real sample assets, injects fixtures only on preview pages, and blocks traversal", async () => {
  const server = previewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const name of [
      "hello-tabs",
      "recipe-notebook",
      "native-actions",
      "own-backend",
    ]) {
      const html = await fetch(`${base}/examples/${name}/index.html`).then(
        (r) => r.text(),
      );
      assert.match(html, /__preview\/bootstrap/);
      const published = await readFile(
        new URL(`examples/${name}/index.html`, root),
        "utf8",
      );
      assert.doesNotMatch(published, /mock-host|__preview/);
      assert.equal(
        (await fetch(`${base}/examples/${name}/app.js`)).status,
        200,
      );
    }
    assert.equal((await fetch(`${base}/src/index.js`)).status, 200);
    assert.equal((await fetch(`${base}/%2e%2e%2fpackage.json`)).status, 404);
    const feed = await fetch(`${base}/api/recipes`).then((r) => r.json());
    assert.equal(feed.source, "developer-backend-preview-fixture");
    assert.equal(
      (await fetch(`${base}/api/recipes`, { method: "POST" })).status,
      405,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("shared AppView backend helper coalesces reads, sends no token, and bounds errors", async () => {
  let calls = 0;
  const load = createTabsPublicReader({
    collection: "com.tabschat.game.score",
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url.origin, "https://api.tabschat.com");
      assert.equal(options.headers, undefined);
      assert.equal(options.credentials, "omit");
      return new Response(JSON.stringify({ records: [], nextCursor: null }));
    },
  });
  await Promise.all([load(), load(), load()]);
  await load();
  assert.equal(calls, 1);
  const limited = createTabsPublicReader({
    collection: "com.tabschat.game.score",
    fetcher: async () => new Response("{}", { status: 429 }),
  });
  await assert.rejects(limited(), { code: "RATE_LIMITED" });
  const oversized = createTabsPublicReader({
    collection: "com.tabschat.game.score",
    fetcher: async () => new Response("x".repeat(1024 * 1024 + 1)),
  });
  await assert.rejects(oversized(), /Oversized/);
});

test("file helper invokes a normal input and resolves cancellation without any broad file API", async () => {
  const listeners = new Map();
  let removed = false,
    clicked = false;
  const selected = { name: "chosen.txt", size: 7 };
  const input = {
    files: [selected],
    addEventListener: (name, fn) => listeners.set(name, fn),
    click: () => {
      clicked = true;
    },
    remove: () => {
      removed = true;
    },
  };
  const scope = {
    document: { createElement: () => input, body: { append: () => {} } },
  };
  const result = selectFiles({ accept: "image/*", multiple: true }, scope);
  assert.ok(clicked);
  assert.equal(input.type, "file");
  assert.equal(input.accept, "image/*");
  assert.equal(input.multiple, true);
  listeners.get("change")();
  assert.deepEqual(await result, [selected]);
  assert.ok(removed);
  const cancelled = selectFiles({}, scope);
  listeners.get("cancel")();
  assert.deepEqual(await cancelled, []);
});
