import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRecordSchemas } from "../dev-tools/common/records.js";
import {
  packageFiles,
  packageZip,
  validateAppPackage,
} from "../dev-tools/common/app-package.js";
import {
  starterLexicons,
  discoverySnippet,
} from "../dev-tools/manifest-generator/model.js";
import { createSimulator, demoManifest } from "../dev-tools/simulator/host.js";
import { createProjectLibrary } from "../dev-tools/simulator/library.js";
import { discoverApp } from "../dev-tools/simulator/discovery.mjs";
import { validatePackage } from "../tools/validate.mjs";

const manifest = structuredClone(demoManifest),
  id = manifest.collections[0];
const lexicons = starterLexicons(manifest);
const record = {
  $type: id,
  text: "A public note",
  createdAt: "2026-10-11T12:00:00.000Z",
};

test("record validation enforces required fields, types, formats, limits and exact properties", () => {
  const schema = createRecordSchemas(lexicons);
  assert.deepEqual(schema.validate(id, record), record);
  for (const invalid of [
    { ...record, text: undefined },
    { ...record, text: 42 },
    { ...record, text: "x".repeat(3001) },
    { ...record, createdAt: "yesterday" },
    { ...record, extra: true },
    { ...record, $type: "org.example.other.note" },
  ])
    assert.throws(() => schema.validate(id, invalid));
  assert.throws(
    () => schema.validate("org.example.absent.note", record),
    /No record Lexicon/,
  );
  const large = structuredClone(lexicons);
  large[0].defs.main.record.properties.text.maxLength = 20000;
  assert.throws(
    () =>
      createRecordSchemas(large).validate(id, {
        ...record,
        text: "x".repeat(17000),
      }),
    /16 KB/,
  );
});

test("nested references, unions and arrays compile and enforce Tabs exact-field policy", () => {
  const docs = structuredClone(lexicons);
  docs[0].defs.main.record.properties.items = {
    type: "array",
    maxLength: 2,
    items: { type: "ref", ref: "#detail" },
  };
  docs[0].defs.detail = {
    type: "object",
    required: ["count"],
    properties: { count: { type: "integer", minimum: 0, maximum: 10 } },
  };
  docs[0].defs.main.record.properties.variant = {
    type: "union",
    refs: ["org.shared.schemas#choice"],
    closed: true,
  };
  docs.push({
    lexicon: 1,
    id: "org.shared.schemas",
    defs: {
      choice: {
        type: "object",
        required: ["label"],
        properties: { label: { type: "string" } },
      },
    },
  });
  const before = structuredClone(docs),
    schemas = createRecordSchemas(docs);
  const value = {
    ...record,
    items: [{ count: 1 }],
    variant: { $type: "org.shared.schemas#choice", label: "Choice" },
  };
  schemas.validate(id, value);
  assert.deepEqual(docs, before);
  assert.throws(
    () =>
      schemas.validate(id, { ...value, items: [{ count: 1, extra: true }] }),
    /undeclared field/,
  );
  assert.throws(() =>
    schemas.validate(id, { ...value, items: [{ count: 11 }] }),
  );
  assert.throws(
    () => schemas.validate(id, { ...value, items: [{ count: 1.5 }] }),
    /safe integers/,
  );
  assert.throws(
    () => createRecordSchemas(docs.slice(0, 1)),
    /Missing Lexicon reference/,
  );
  assert.throws(() => createRecordSchemas([...docs, docs[0]]), /Duplicate/);
  validateAppPackage({ v: 1, manifest, lexicons: docs }); // Shared dependency namespaces are legitimate.
});

test("invalid creates and updates do not mutate simulator records; missing schemas fail explicitly", async () => {
  const logs = [],
    host = createSimulator({
      manifest,
      lexicons,
      prompt: async () => "allow",
      log: (event) => logs.push(event),
    });
  await host.open();
  await assert.rejects(
    host.call("records.create", {
      collection: id,
      value: { ...record, text: 7 },
    }),
    { code: "INVALID_INPUT" },
  );
  assert.deepEqual(host.state().records, []);
  const created = await host.call("records.create", {
    collection: id,
    value: record,
  });
  const rkey = created.uri.split("/").at(-1);
  await assert.rejects(
    host.call("records.update", {
      collection: id,
      rkey,
      value: { ...record, extra: true },
    }),
    /undeclared field/,
  );
  assert.deepEqual(host.state().records[0].record, record);
  await host.call("records.update", {
    collection: id,
    rkey,
    value: { ...record, text: "Updated" },
  });
  assert.equal(host.state().records[0].record.text, "Updated");
  assert.match(
    logs.find((event) => event.detail?.includes("undeclared field")).detail,
    /extra/,
  );
  const missing = createSimulator({
    manifest,
    lexicons: [],
    prompt: async () => "allow",
  });
  await missing.open();
  await assert.rejects(
    missing.call("records.create", { collection: id, value: record }),
    /No record Lexicon/,
  );
});

test("downloaded ZIP round-trips through the CLI with identical edited schemas", async () => {
  const folder = await mkdtemp(join(tmpdir(), "tabs-package-"));
  try {
    const docs = structuredClone(lexicons);
    docs[0].defs.main.record.properties.published = { type: "boolean" };
    const files = packageFiles(manifest, docs, discoverySnippet());
    await writeFile(join(folder, "package.zip"), packageZip(files));
    execFileSync("unzip", ["-t", join(folder, "package.zip")]);
    execFileSync("unzip", [
      "-q",
      join(folder, "package.zip"),
      "-d",
      join(folder, "app"),
    ]);
    assert.deepEqual(
      (await validatePackage(join(folder, "app"))).documents,
      docs,
    );
    const pkg = validateAppPackage(
      JSON.parse(await readFile(join(folder, "app/app-package.json"), "utf8")),
    );
    assert.deepEqual(pkg.lexicons, docs);
    await writeFile(
      join(folder, "app/lexicons", `${id}.json`),
      JSON.stringify({
        ...docs[0],
        defs: {
          main: {
            type: "record",
            key: "tid",
            record: {
              type: "object",
              properties: { bad: { type: "not-a-type" } },
            },
          },
        },
      }),
    );
    await assert.rejects(validatePackage(join(folder, "app")));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("project schemas persist and changed schemas renew consent without overwriting on manifest edits", () => {
  let saved;
  const options = {
    baseUrl: "http://localhost:4174",
    storage: {
      getItem: () => saved,
      setItem: (_, value) => {
        saved = value;
      },
    },
  };
  let library = createProjectLibrary(options);
  const project = library.add({ url: "/demo", manifest, lexicons });
  library.remember(project.url, {
    manifest,
    reviewed: true,
    permissions: { "records.write": "allow" },
  });
  library = createProjectLibrary(options);
  assert.deepEqual(library.get(project.url).lexicons, lexicons);
  assert.equal(library.add({ url: project.url, manifest }).reviewed, true);
  const docs = structuredClone(lexicons);
  docs[0].defs.main.record.properties.text.maxLength = 20;
  assert.equal(
    library.add({ url: project.url, manifest, lexicons: docs }).reviewed,
    false,
  );
  assert.throws(() =>
    library.add({ url: project.url, manifest, lexicons: [null] }),
  );
  assert.deepEqual(library.get(project.url).lexicons, docs);
});

const fetcher = (pages) => async (url) =>
  new Response(pages[String(url)] ?? "Missing", {
    status: pages[String(url)] ? 200 : 404,
  });
test("discovery loads a portable package and refuses a stale package manifest", async () => {
  const pkg = { v: 1, manifest, lexicons };
  const pages = {
    "http://localhost:3000/":
      '<link rel="tabs-manifest" href="/manifest.json"><link rel="tabs-package" href="/app-package.json">',
    "http://localhost:3000/manifest.json": JSON.stringify(manifest),
    "http://localhost:3000/app-package.json": JSON.stringify(pkg),
  };
  const found = await discoverApp("http://localhost:3000/", {
    fetcher: fetcher(pages),
  });
  assert.deepEqual(found.lexicons, lexicons);
  assert.deepEqual(found.warnings, []);
  pages["http://localhost:3000/app-package.json"] = JSON.stringify({
    ...pkg,
    manifest: { ...manifest, name: "Stale" },
  });
  const stale = await discoverApp("http://localhost:3000/", {
    fetcher: fetcher(pages),
  });
  assert.deepEqual(stale.lexicons, []);
  assert.match(stale.warnings.join(), /differs/);
});

test("discovery loads conventional schema files and their referenced dependencies", async () => {
  const docs = structuredClone(lexicons);
  docs[0].defs.main.record.properties.detail = {
    type: "ref",
    ref: "org.shared.schemas#detail",
  };
  const helper = {
    lexicon: 1,
    id: "org.shared.schemas",
    defs: {
      detail: { type: "object", properties: { ok: { type: "boolean" } } },
    },
  };
  const pages = {
    "http://localhost:3000/":
      '<link rel="tabs-manifest" href="/manifest.json">',
    "http://localhost:3000/manifest.json": JSON.stringify(manifest),
    [`http://localhost:3000/lexicons/${id}.json`]: JSON.stringify(docs[0]),
    "http://localhost:3000/lexicons/org.shared.schemas.json":
      JSON.stringify(helper),
  };
  const found = await discoverApp("http://localhost:3000/", {
    fetcher: fetcher(pages),
  });
  assert.deepEqual(found.lexicons, [...docs, helper]);
  assert.deepEqual(found.warnings, []);
});

test("static seeds preserve imported schema overrides until files on disk change", () => {
  let saved;
  const storage = {
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value;
    },
  };
  const seed = { url: "/app/index.html", manifest, lexicons };
  const options = { storage, baseUrl: "http://localhost:4174", seeds: [seed] };
  let library = createProjectLibrary(options);
  const imported = structuredClone(lexicons);
  imported[0].defs.main.record.properties.text.maxLength = 10;
  const project = library.add({ ...seed, lexicons: imported });
  library.remember(project.url, {
    manifest,
    lexicons: imported,
    reviewed: true,
    permissions: { "records.write": "allow" },
  });
  library = createProjectLibrary(options);
  assert.deepEqual(library.get(project.url).lexicons, imported);
  assert.equal(library.get(project.url).reviewed, true);
  const changedFiles = structuredClone(lexicons);
  changedFiles[0].defs.main.record.properties.text.maxLength = 50;
  library = createProjectLibrary({
    ...options,
    seeds: [{ ...seed, lexicons: changedFiles }],
  });
  assert.deepEqual(library.get(project.url).lexicons, changedFiles);
  assert.equal(library.get(project.url).reviewed, false);
});
