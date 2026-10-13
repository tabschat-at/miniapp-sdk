import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check using npm run check:package");
const temporary = mkdtempSync(path.join(tmpdir(), "tabs-sdk-package-"));
const runNpm = (args, cwd) =>
  execFileSync(
    process.execPath,
    [npm, ...args, `--cache=${path.join(temporary, "cache")}`],
    { cwd, encoding: "utf8" },
  );
try {
  const [pack] = JSON.parse(
    runNpm(
      ["pack", "--ignore-scripts", "--json", `--pack-destination=${temporary}`],
      root,
    ),
  );
  const files = pack.files.map((file) => file.path);
  for (const required of [
    "src/index.js",
    "src/bootstrap.js",
    "src/index.d.ts",
    "server/auth.mjs",
    "server/auth.d.mts",
    "dev/mock-host.js",
    "dev/mock-host.d.ts",
    "dev-tools/simulator/server.mjs",
    "dev-tools/simulator/index.html",
    "dev-tools/simulator/bridge.js",
    "dev-tools/simulator/host.js",
    "dev-tools/simulator/library.js",
    "dev-tools/simulator/preferences.js",
    "dev-tools/simulator/motion.js",
    "dev-tools/simulator/session.js",
    "dev-tools/simulator/welcome-tour.js",
    "dev-tools/common/tool-theme.css",
    "dev-tools/simulator/native-ui.js",
    "dev-tools/simulator/sheets.js",
    "dev-tools/simulator/add-project.js",
    "dev-tools/simulator/discovery.mjs",
    "dev-tools/common/manifest.js",
    "dev-tools/common/records.js",
    "dev-tools/common/app-package.js",
    "dev-tools/vendor/lexicon.js",
    "dev-tools/vendor/LICENSES.txt",
    "dev-tools/manifest-generator/fields.js",
    "dev-tools/manifest-generator/index.html",
    "dev-tools/manifest-generator/app.js",
    "dev-tools/manifest-generator/model.js",
    "dev-tools/manifest-generator/style.css",
    "tools/validate.mjs",
    "LICENSE",
  ])
    assert.ok(files.includes(required), required);
  for (const file of files)
    assert.ok(
      !/^(examples|tests|site|reference|\.github|dist|node_modules)\/|(?:^|\/)\.env/.test(
        file,
      ),
      `Unexpected package file: ${file}`,
    );
  const consumer = path.join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  runNpm(
    [
      "install",
      path.join(temporary, pack.filename),
      "--offline",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    consumer,
  );
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {getHost} from '@tabschat/miniapp-sdk';
    import {createMockHost, installMockHost} from '@tabschat/miniapp-sdk/dev/mock-host';
    import {verifyTabsAssertion} from '@tabschat/miniapp-sdk/server/auth';
    const manifest={id:'org.example.hello',permissions:['identity.basic'],collections:[],readCollections:[]};
    assert.throws(()=>getHost({}),{code:'HOST_UNAVAILABLE'});
    const host=createMockHost(manifest);
    assert.equal((await host.identity.getSelf()).handle,'alice.demo.invalid');
    const scope={}; installMockHost(manifest,{},scope);
    assert.equal(getHost(scope).v,1);
    assert.equal(typeof verifyTabsAssertion,'function');
    const {createRecordSchemas}=await import('./node_modules/@tabschat/miniapp-sdk/dev-tools/common/records.js');
    const {demoLexicons,demoManifest}=await import('./node_modules/@tabschat/miniapp-sdk/dev-tools/simulator/host.js');
    const schemas=createRecordSchemas(demoLexicons), collection=demoManifest.collections[0];
    schemas.validate(collection,{$type:collection,text:'Offline fixture'});
    assert.throws(()=>schemas.validate(collection,{$type:collection,text:42}));
    console.log('Packed ESM exports work from an independent consumer');
  `,
    ],
    { cwd: consumer, encoding: "utf8" },
  );
  process.stdout.write(result);
  writeFileSync(
    path.join(consumer, "usage.ts"),
    `
    import {getHost, type ManifestV1, type HostBridgeV1} from '@tabschat/miniapp-sdk';
    import {createMockHost, installMockHost} from '@tabschat/miniapp-sdk/dev/mock-host';
    import {verifyTabsAssertion} from '@tabschat/miniapp-sdk/server/auth';
    declare const manifest: ManifestV1;
    const host: HostBridgeV1=createMockHost(manifest);
    installMockHost(manifest,{},{});
    getHost({host});
    void verifyTabsAssertion;
    // @ts-expect-error Payment amounts must be decimal strings.
    host.payments.request({recipientDid:'did:plc:abc',asset:'USDC',amount:1});
  `,
  );
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--target",
      "ES2024",
      "--lib",
      "ES2024,DOM",
      "usage.ts",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  const validation = execFileSync(
    process.execPath,
    [
      path.join(
        consumer,
        "node_modules/@tabschat/miniapp-sdk/tools/validate.mjs",
      ),
      path.join(root, "examples/hello-tabs"),
    ],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.match(validation, /local preflight passed/);
  assert.match(
    execFileSync(
      process.execPath,
      [npm, "exec", "--offline", "--", "tabs-miniapp-simulate", "--help"],
      {
        cwd: consumer,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: path.join(temporary, "cache"),
        },
      },
    ),
    /Tabs SDK simulator/,
  );
  assert.match(
    execFileSync(
      process.execPath,
      [
        npm,
        "exec",
        "--offline",
        "--",
        "tabs-miniapp-validate",
        path.join(root, "examples/recipe-notebook"),
      ],
      {
        cwd: consumer,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: path.join(temporary, "cache"),
        },
      },
    ),
    /local preflight passed/,
  );
  console.log(
    `Verified packed types, installed CLI and ${files.length} public runtime files`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
