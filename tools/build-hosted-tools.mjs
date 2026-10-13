import {
  mkdir,
  readdir,
  readFile,
  lstat,
  writeFile,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoManifest, demoLexicons } from "../dev-tools/simulator/host.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const tools = "/tools/simulator";
const sdkVersion = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
).version;
export async function buildHostedTools(output) {
  const sources = [
    ["dev-tools/simulator", "tools/simulator"],
    ["dev-tools/manifest-generator", "tools/package-builder"],
    ["dev-tools/common", "tools/common"],
    ["dev-tools/vendor", "tools/vendor"],
    ["site/submission", "submit"],
  ];
  const digest = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .update(await readFile(path.join(root, "src/bootstrap.js")));
  for (const [source] of sources)
    for (const name of (await readdir(path.join(root, source))).sort()) {
      if (/\.(js|css|html|svg)$/.test(name))
        digest
          .update(source + "/" + name)
          .update(await readFile(path.join(root, source, name)));
    }
  const version = digest.digest("hex").slice(0, 16);
  await mkdir(path.join(output, `sdk/${sdkVersion}`), { recursive: true });
  await copyFile(
    path.join(root, "src/bootstrap.js"),
    path.join(output, `sdk/${sdkVersion}/bootstrap.js`),
  );
  for (const [source, target] of sources) {
    const directory = path.join(output, target);
    await mkdir(directory, { recursive: true });
    for (const name of await readdir(path.join(root, source))) {
      if (!/\.(js|css|html|svg)$/.test(name) && name !== "LICENSES.txt")
        continue;
      let content = await readFile(path.join(root, source, name), "utf8");
      if (source.startsWith("dev-tools/")) {
        content = content.replaceAll(
          "/manifest-generator/",
          "/tools/package-builder/",
        );
        // Only rewrite observed root asset URLs; ES module relative imports stay portable.
        for (const file of [
          "style.css",
          "app.js",
          "native-ui.js",
          "config.json",
          "demo.html",
          "demo.js",
          "demo-icon.svg",
          "demo-manifest.json",
          "demo-package.json",
          "bridge.js",
        ])
          content = content.replace(
            new RegExp(`(?<=["'\x60(}])/${file.replaceAll(".", "\\.")}`, "g"),
            `${tools}/${file}`,
          );
        if (name === "index.html") {
          content = content.replace(
            '<html lang="en">',
            '<html lang="en" data-hosted="true">',
          );
          content = content.replace(
            "</head>",
            '<link rel="stylesheet" href="/tools/tool-nav.css"></head>',
          );
          content = content.replace(
            '<a href="/">Open the simulator</a>',
            '<a href="/tools/simulator/">Open the simulator</a>',
          );
          content = content.replace(
            "ready to test locally.",
            "ready to discover, test and submit.",
          );
          content = content.replace(
            '<span class="badge">DEVELOPER TOOLS</span>',
            '<nav class="tool-nav"><a href="/">Docs</a><a href="/tools/package-builder/">Package builder</a><a href="/submit/">Submit app</a><a href="/downloads/tabs-developer-kit.tar.gz">Download local tools</a></nav>',
          );
          content = content.replace(
            '<a href="/">← Host simulator</a>',
            '<nav class="tool-nav"><a href="/">Docs</a><a href="/tools/simulator/">Simulator</a><a href="/submit/">Submit app</a></nav>',
          );
        }
      }
      // Cloudflare may impose a minimum TTL on static assets. Version all module
      // imports, styles and entry scripts together so HTML never mixes releases.
      content = content.replace(
        /(["'`])((?:\.{1,2}\/|\/|https?:\/\/|\$\{location\.origin\}\/)[^"'`\s<>]*\.(?:js|css))\1/g,
        (_, quote, url) => `${quote}${url}?v=${version}${quote}`,
      );
      await writeFile(path.join(directory, name), content);
    }
  }
  const manifest = {
    ...demoManifest,
    entrypoint: `https://developers.tabschat.com${tools}/demo.html`,
  };
  for (const [name, value] of [
    [
      "config.json",
      { manifest, lexicons: demoLexicons, appUrl: `${tools}/demo.html` },
    ],
    ["demo-manifest.json", manifest],
    ["demo-package.json", { v: 1, manifest, lexicons: demoLexicons }],
  ])
    await writeFile(
      path.join(output, "tools/simulator", name),
      JSON.stringify(value),
    );
  await writeFile(
    path.join(output, "tools/tool-nav.css"),
    ".tool-nav{display:flex;gap:16px;align-items:center;font:500 12px system-ui;letter-spacing:0}.tool-nav a{color:#08657a;text-decoration:none}.tool-nav a:hover{text-decoration:underline}@media(max-width:900px){.topbar{flex-wrap:wrap}.tool-nav{gap:12px}.topbar .host-session{margin-left:auto}}",
  );
  await mkdir(path.join(output, "downloads"), { recursive: true });
  const publicSources = [];
  async function collect(relative) {
    const name = path.basename(relative);
    if (
      name.startsWith(".") ||
      name === "node_modules" ||
      /\.(pem|key|log)$/.test(name)
    )
      return;
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink())
      throw Error("SDK download cannot contain symlinks.");
    if (info.isDirectory())
      for (const child of await readdir(path.join(root, relative)))
        await collect(path.join(relative, child));
    else publicSources.push(relative);
  }
  for (const source of [
    "src",
    "server",
    "dev",
    "dev-tools",
    "tools",
    "docs",
    "site",
    "reference",
    "examples",
    "tests",
    "README.md",
    "CHANGELOG.md",
    "RELEASING.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
  ])
    await collect(source);
  execFileSync(
    "tar",
    [
      "--no-xattrs",
      "-czf",
      path.join(output, "downloads/tabs-developer-kit.tar.gz"),
      "-C",
      root,
      ...publicSources.sort(),
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  await copyFile(
    path.join(root, "dev-tools/vendor/LICENSES.txt"),
    path.join(output, "tools/vendor/LICENSES.txt"),
  );
}
