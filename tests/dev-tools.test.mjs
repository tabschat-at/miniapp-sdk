import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverApp,
  pageMetadata,
} from "../dev-tools/simulator/discovery.mjs";
import {
  buildManifest,
  validateGenerated,
  discoverySnippet,
} from "../dev-tools/manifest-generator/model.js";
import { validateManifest, validatePackage } from "../tools/validate.mjs";
import { simulatorServer } from "../dev-tools/simulator/server.mjs";
import { createProjectLibrary } from "../dev-tools/simulator/library.js";

const values = {
  id: "org.example.notebook",
  name: "Notebook",
  version: "1.0.0",
  entrypoint: "https://example.org/app/",
  permissions: ["identity.basic", "records.read", "records.write"],
  collections: "org.example.notebook.note",
  readCollections: "org.example.notebook.note",
  recordPurpose: "Save public notes.",
  networkAccess: "",
};
const manifest = buildManifest(values);
function fixture(pages) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, options) => {
      calls.push({ url: String(url), options });
      const value = pages[String(url)];
      return value instanceof Response
        ? value
        : new Response(value ?? "Missing", { status: value ? 200 : 404 });
    },
  };
}
test("discovers explicit Tabs manifest, real name and resolved icon without CORS", async () => {
  const source = fixture({
    "https://example.org/app/":
      '<base href="/assets/"><title>Fallback name</title><link REL="tabs-manifest" href="../tabs.json"><link rel="apple-touch-icon" href="icon.png?x=1&amp;y=2">',
    "https://example.org/tabs.json": JSON.stringify(manifest),
  });
  const result = await discoverApp(values.entrypoint, source);
  assert.deepEqual(result.manifest, manifest);
  assert.equal(result.name, "Notebook");
  assert.equal(result.iconUrl, "https://example.org/assets/icon.png?x=1&y=2");
  assert.equal(result.manifestUrl, "https://example.org/tabs.json");
  assert.equal(source.calls[0].options.credentials, "omit");
  assert.equal(source.calls[0].options.redirect, "manual");
});
test("PWA metadata supplies branding, never host capabilities, and falls back to root Tabs manifest", async () => {
  const source = fixture({
    "http://localhost:3000/projects/notes/":
      '<link rel="manifest" href="/app.webmanifest">',
    "http://localhost:3000/app.webmanifest": JSON.stringify({
      name: "PWA notebook",
      permissions: ["wallet.messages"],
      icons: [{ src: "/large.png", sizes: "192x192" }],
    }),
    "http://localhost:3000/manifest.json": JSON.stringify(manifest),
  });
  const result = await discoverApp(
    "http://localhost:3000/projects/notes/",
    source,
  );
  assert.equal(result.name, "Notebook");
  assert.equal(result.iconUrl, "http://localhost:3000/large.png");
  assert.deepEqual(result.manifest.permissions, manifest.permissions);
  const absent = await discoverApp(
    "http://localhost:3000/projects/notes/",
    fixture({
      "http://localhost:3000/projects/notes/":
        '<title>Layout only</title><link rel="manifest" href="/app.webmanifest">',
      "http://localhost:3000/app.webmanifest": JSON.stringify({
        permissions: ["identity.basic"],
      }),
    }),
  );
  assert.equal(absent.manifest, null);
  assert.equal(absent.name, "Layout only");
  assert.match(absent.warnings.join(), /No valid Tabs V1 manifest/);
});
test("discovery rejects invalid manifests, unsafe URLs/redirects, excessive metadata and redirect loops", async () => {
  for (const url of [
    "file:///etc/passwd",
    "http://alice:secret@localhost/",
    "data:text/html,hello",
  ])
    await assert.rejects(discoverApp(url));
  const invalid = await discoverApp(
    "https://example.org/",
    fixture({
      "https://example.org/":
        '<link rel="tabs-manifest" href="/manifest.json">',
      "https://example.org/manifest.json": JSON.stringify({
        ...manifest,
        permissions: ["made.up"],
      }),
    }),
  );
  assert.equal(invalid.manifest, null);
  assert.match(invalid.warnings.join(), /Unknown permission/);
  const redirect = fixture({
    "https://example.org/": new Response(null, {
      status: 302,
      headers: { location: "file:///etc/passwd" },
    }),
  });
  await discoverApp("https://example.org/", redirect);
  assert.ok(redirect.calls.every((call) => call.url.startsWith("https:")));
  let calls = 0;
  const looping = await discoverApp("https://example.org/", {
    fetcher: async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: "/" } });
    },
  });
  assert.equal(looping.manifest, null);
  assert.ok(calls <= 10);
  const huge = await discoverApp(
    "https://example.org/",
    fixture({ "https://example.org/manifest.json": " ".repeat(262145) }),
  );
  assert.equal(huge.manifest, null);
  const timeout = await discoverApp("https://example.org/", {
    timeout: 5,
    fetcher: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason));
      }),
  });
  assert.equal(timeout.manifest, null);
});
test("HTML metadata ignores scripts/comments and resolves only web URLs", () => {
  const result = pageMetadata(
    '<!--<link rel="icon" href="bad.png">--><script>"<link rel=icon href=bad2.png>"</script><title>Notes &amp; ideas</title><link rel=icon href="javascript:alert(1)">',
    "https://example.org/",
  );
  assert.equal(result.name, "Notes & ideas");
  assert.deepEqual(result.links, []);
});
test("generated manifests use feature dependencies, exact collections, USDC and host version floors", () => {
  assert.deepEqual(
    buildManifest({
      ...values,
      permissions: ["blobs.upload"],
      collections: "org.example.notebook.note, org.example.notebook.note",
    }).permissions,
    ["blobs.upload", "records.write"],
  );
  assert.equal(
    buildManifest({ ...values, permissions: ["blobs.upload"] })
      .minimumHostVersion,
    "0.0.52",
  );
  assert.equal(
    buildManifest({ ...values, permissions: ["identity.authenticate"] })
      .minimumHostVersion,
    "0.0.51",
  );
  assert.deepEqual(
    buildManifest({ ...values, permissions: ["payments.request"] })
      .allowedPaymentAssets,
    ["USDC"],
  );
  assert.deepEqual(
    buildManifest({ ...values, permissions: [] }).collections,
    [],
  );
  assert.equal(validateGenerated(manifest).length, 1);
  assert.throws(
    () =>
      validateGenerated({
        ...manifest,
        collections: ["com.atproto.repo.record"],
      }),
    /protected/,
  );
  assert.throws(
    () =>
      validateGenerated({ ...manifest, entrypoint: "http://localhost:3000/" }),
    /HTTPS/,
  );
  assert.throws(() => validateManifest(manifest), /Include a record Lexicon/);
  assert.throws(
    () =>
      validateManifest({ ...manifest, icon: "https://example.org/icon.png" }),
    /exactly/,
  );
  assert.throws(
    () =>
      validateGenerated({
        ...manifest,
        permissions: ["blobs.upload", "records.write"],
        readCollections: [],
        minimumHostVersion: "0.0.50",
      }),
    /Blob upload/,
  );
});
test("downloaded starter package passes the real CLI package validator", async () => {
  const folder = await mkdtemp(join(tmpdir(), "tabs-generated-"));
  try {
    await mkdir(join(folder, "lexicons"));
    await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
    for (const doc of validateGenerated(manifest))
      await writeFile(
        join(folder, "lexicons", `${doc.id}.json`),
        JSON.stringify(doc),
      );
    assert.deepEqual((await validatePackage(folder)).manifest, manifest);
    assert.match(
      discoverySnippet('https://example.org/icon.png?a=1&b="<'),
      /&amp;/,
    );
    assert.throws(() => discoverySnippet("javascript:alert(1)"), /HTTP/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("project branding persists while changed discovered capabilities renew first-run consent", () => {
  let data;
  const storage = {
    getItem: () => data,
    setItem: (_key, value) => {
      data = value;
    },
  };
  const library = createProjectLibrary({
    storage,
    baseUrl: "https://example.org",
  });
  library.add({
    url: "/app/",
    manifest,
    iconUrl: "/icon.png",
    manifestUrl: "/manifest.json",
  });
  library.remember("https://example.org/app/", {
    manifest,
    reviewed: true,
    permissions: { "identity.basic": "allow" },
  });
  const restored = createProjectLibrary({
    storage,
    baseUrl: "https://example.org",
  });
  assert.equal(restored.list()[0].iconUrl, "https://example.org/icon.png");
  assert.equal(restored.list()[0].reviewed, true);
  restored.add({
    url: "/app/",
    manifest: { ...manifest, permissions: [] },
    iconUrl: "javascript:alert(1)",
  });
  assert.equal(restored.list()[0].reviewed, false);
  assert.equal(restored.list()[0].iconUrl, undefined);
});
test("local discovery endpoint rejects foreign requests and serves all generator modules", async (t) => {
  const server = await simulatorServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (
      await fetch(
        `${base}/discover?url=${encodeURIComponent(base + "/demo.html")}`,
      )
    ).status,
    403,
  );
  const result = await fetch(
    `${base}/discover?url=${encodeURIComponent(base + "/demo.html")}`,
    { headers: { "x-tabs-simulator": "1" } },
  ).then((response) => response.json());
  assert.equal(result.manifest.name, "Host playground");
  assert.equal(result.iconUrl, base + "/demo-icon.svg");
  for (const path of [
    "/manifest-generator/index.html",
    "/manifest-generator/app.js",
    "/manifest-generator/model.js",
    "/manifest-generator/style.css",
    "/common/manifest.js",
    "/common/tool-theme.css",
    "/welcome-tour.js",
    "/add-project.js",
  ])
    assert.equal((await fetch(base + path)).status, 200, path);
});

test("wallet manifests match the existing host dependency and 0.0.74 floor", async () => {
  const generated = buildManifest({
    ...values,
    permissions: ["wallet.transactions", "wallet.messages"],
  });
  assert.deepEqual(generated.permissions, [
    "wallet.transactions",
    "wallet.messages",
    "wallet.connect",
  ]);
  assert.equal(generated.minimumHostVersion, "0.0.74");
  validateManifest(generated);
  assert.throws(
    () => validateManifest({ ...generated, permissions: ["wallet.messages"] }),
    /wallet.connect/,
  );
  assert.throws(
    () => validateManifest({ ...generated, minimumHostVersion: "0.0.73" }),
    /0.0.74/,
  );
  const discovered = await discoverApp(
    "https://example.org/",
    fixture({
      "https://example.org/":
        '<link rel="tabs-manifest" href="/tabs.json"><link rel="manifest" href="/pwa.json">',
      "https://example.org/tabs.json": JSON.stringify(generated),
      "https://example.org/pwa.json": JSON.stringify({
        icons: [{ src: "/wallet.png", sizes: "512x512" }],
      }),
    }),
  );
  assert.deepEqual(discovered.manifest, generated);
  assert.equal(discovered.iconUrl, "https://example.org/wallet.png");
});
