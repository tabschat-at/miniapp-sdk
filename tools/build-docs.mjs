import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  copyFile,
  stat,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { marked } from "marked";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");
const repository = "https://github.com/tabschat-at/miniapp-sdk";
const pages = new Map([
  ["site/home.md", "/"],
  ["README.md", "/kit/"],
  ["CHANGELOG.md", "/changelog/"],
  ["RELEASING.md", "/releasing/"],
]);
const navigation = [
  [
    "Get started",
    [
      ["Overview", "/"],
      ["Quickstart", "/docs/quickstart/"],
      ["SDK & host versions", "/docs/compatibility/"],
    ],
  ],
  [
    "Build your app",
    [
      ["Bridge API", "/docs/api/"],
      ["Permissions", "/docs/permissions/"],
      ["Manifest & schemas", "/docs/manifest/"],
      ["Backends & sign-in", "/docs/backends/"],
      ["ATProto media", "/docs/atproto-media/"],
      ["Shared AppView", "/docs/tabs-appview/"],
      ["Spark interoperability", "/docs/spark-interop/"],
    ],
  ],
  [
    "Test & publish",
    [
      ["Testing", "/docs/testing/"],
      ["Hosting & submission", "/docs/publishing/"],
      ["Developer kit", "/kit/"],
      ["Changelog", "/changelog/"],
    ],
  ],
  [
    "Examples",
    [
      ["Own backend", "/examples/own-backend/"],
      ["Own AppView", "/examples/own-appview/"],
      ["Tabs AppView", "/examples/tabs-appview/"],
    ],
  ],
];
for (const name of await readdir(path.join(root, "docs"))) {
  if (name.endsWith(".md"))
    pages.set(`docs/${name}`, `/docs/${name.slice(0, -3)}/`);
}
for (const name of ["own-backend", "own-appview", "tabs-appview"])
  pages.set(`examples/${name}/README.md`, `/examples/${name}/`);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (s) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
        })[s],
    );
const slug = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
const search = [];
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
for (const [source, route] of pages) {
  const markdown = await readFile(path.join(root, source), "utf8");
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? source;
  const headings = [];
  const seen = new Map();
  let html = marked.parse(markdown, { gfm: true, async: false });
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, depth, text) => {
    const base = slug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count ? `${base}-${count}` : base;
    if (depth === "2" || depth === "3")
      headings.push({ id, title: plain(text), depth });
    return `<h${depth} id="${escape(id)}">${text}<a class="anchor" href="#${escape(id)}" aria-label="Link to ${escape(plain(text))}">#</a></h${depth}>`;
  });
  const links = [...html.matchAll(/href="([^"]+)"/g)];
  const replacements = new Map();
  for (const [, encoded] of links) {
    const href = plain(encoded);
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    if (/^[a-z]+:/i.test(href) || href.startsWith("/"))
      throw new Error(`Unexpected link in ${source}: ${href}`);
    const [file, hash] = href.split("#");
    const relative = path.posix.normalize(
      path.posix.join(path.posix.dirname(source), file),
    );
    if (relative.startsWith("../"))
      throw new Error(`Link leaves SDK in ${source}: ${href}`);
    const info = await stat(path.join(root, relative)).catch(() => null);
    if (!info) throw new Error(`Broken source link in ${source}: ${href}`);
    const target =
      pages.get(relative) ??
      `${repository}/${info.isDirectory() ? "tree" : "blob"}/main/${relative.split("/").map(encodeURIComponent).join("/")}`;
    replacements.set(encoded, escape(target + (hash ? `#${hash}` : "")));
  }
  html = html.replace(/href="([^"]+)"/g, (match, href) =>
    replacements.has(href) ? `href="${replacements.get(href)}"` : match,
  );
  const nav = navigation
    .map(
      ([group, entries]) =>
        `<div class="nav-group"><p>${escape(group)}</p>${entries.map(([label, url]) => `<a href="${url}"${url === route ? ' aria-current="page"' : ""}>${escape(label)}</a>`).join("")}</div>`,
    )
    .join("");
  const toc = headings
    .map(
      ({ id, title, depth }) =>
        `<a class="depth-${depth}" href="#${escape(id)}">${escape(title)}</a>`,
    )
    .join("");
  const description =
    "Build a Tabs mini-app with the public SDK, examples, API reference and developer guides.";
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Tabs developers</title><meta name="description" content="${description}"><meta name="color-scheme" content="light"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/docs.css"><script defer src="/assets/docs.js"></script></head>
<body${route === "/" ? ' class="overview"' : ""}><a class="skip" href="#content">Skip to content</a>
<header><a class="brand" href="/" aria-label="Tabs developer home"><span class="brand-mark">t</span><strong>Tabs</strong><span class="brand-label">developers</span></a><div class="header-right"><span class="preview-badge">Developer preview</span><a href="${repository}">GitHub ↗</a></div></header>
<div class="layout"><aside class="sidebar"><label class="search-label" for="docs-search">Search documentation</label><input id="docs-search" type="search" placeholder="Find a guide or API…" autocomplete="off"><div id="search-results" aria-live="polite"></div><details class="navigation" open><summary>Documentation</summary><nav aria-label="Documentation">${nav}</nav></details><div class="sidebar-foot"><span>SDK 0.1.0 · Bridge V1</span><a href="${repository}/blob/main/LICENSE">AGPL-3.0-only</a></div></aside>
<main id="content"><p class="eyebrow">${route === "/" ? "THE TABS DEVELOPER KIT" : "TABS DOCUMENTATION"}</p><article>${html}</article><footer><a href="${repository}/blob/main/${source}">View this page's source ↗</a><span>Android developer preview</span></footer></main>
<aside class="toc" aria-label="On this page"><p>On this page</p>${toc}</aside></div></body></html>`;
  const directory = path.join(output, route.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), document);
  search.push({ title, url: route, text: plain(html).replace(/\s+/g, " ") });
}
for (const name of ["docs.css", "docs.js", "favicon.svg"])
  await copyFile(
    path.join(root, "site", name),
    path.join(output, "assets", name),
  );
await writeFile(
  path.join(output, "assets/search.json"),
  JSON.stringify(search),
);
await writeFile(path.join(output, "robots.txt"), "User-agent: *\nAllow: /\n");
await writeFile(
  path.join(output, "_headers"),
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'\n",
);
// Verify generated internal paths and anchors, including cross-page API links.
for (const [source, route] of pages) {
  const html = await readFile(
    path.join(output, route.slice(1), "index.html"),
    "utf8",
  );
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith("/") && !href.startsWith("#")) continue;
    const [target, fragment] = href.split("#");
    const file =
      target === ""
        ? path.join(output, route.slice(1), "index.html")
        : path.join(
            output,
            target.slice(1),
            target.endsWith("/") ? "index.html" : "",
          );
    const contents = await readFile(file, "utf8").catch(() => {
      throw new Error(`Broken generated link in ${source}: ${href}`);
    });
    if (fragment && !contents.includes(`id="${fragment}"`))
      throw new Error(`Broken generated anchor in ${source}: ${href}`);
  }
}
console.log(`Built and checked ${pages.size} documentation pages in dist/`);
