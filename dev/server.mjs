import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const examples = [
  "hello-tabs",
  "recipe-notebook",
  "native-actions",
  "own-backend",
];
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/plain",
};
export function previewServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method !== "GET") {
        response.writeHead(405).end();
        return;
      }
      response.setHeader(
        "content-security-policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
      );
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("cache-control", "no-store");
      if (url.pathname === "/") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          `<h1>Tabs SDK browser preview</h1><p>Fixtures only. No real identity, publications, chat or payments.</p>${examples.map((name) => `<p><a href="/examples/${name}/index.html">${name}</a> · <a href="/examples/${name}/index.html?deny=1">permissions denied</a></p>`).join("")}`,
        );
        return;
      }
      if (url.pathname === "/__preview/bootstrap.mjs") {
        const name = url.searchParams.get("example");
        if (!examples.includes(name)) {
          response.writeHead(404).end();
          return;
        }
        response.setHeader("content-type", "application/javascript");
        response.end(`import {installMockHost} from '/dev/mock-host.js';
const manifest=await fetch('/examples/${name}/manifest.json').then(r=>r.json());
installMockHost(manifest,{denied:location.search.includes('deny=1')});
const banner=document.createElement('p');banner.className='preview';banner.textContent='BROWSER PREVIEW — fixtures only; payment requests cancel; records reset on reload.';document.body.prepend(banner);
await import('/examples/${name}/app.js');`);
        return;
      }
      if (url.pathname === "/api/recipes") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            source: "developer-backend-preview-fixture",
            records: [
              {
                uri: "preview:recipe",
                cid: "preview-cid",
                author: {
                  did: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
                  handle: "bob.demo.invalid",
                },
                record: {
                  $type: "org.example.recipes.recipe",
                  title: "Bob's preview soup",
                  ingredients: [{ name: "Carrot", quantity: 2 }],
                },
                publishedAt: "2026-01-01T00:00:00Z",
              },
            ],
            nextCursor: null,
          }),
        );
        return;
      }
      const target = await realpath(
        resolve(root, "." + decodeURIComponent(url.pathname)),
      );
      if (!target.startsWith(root + sep)) {
        response.writeHead(404).end();
        return;
      }
      const type = types[extname(target)];
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      let body = await readFile(target);
      const example = /^\/examples\/([^/]+)\/index\.html$/.exec(
        url.pathname,
      )?.[1];
      if (example && examples.includes(example))
        body = Buffer.from(
          body
            .toString()
            .replace(
              '<script type="module" src="./app.js"></script>',
              `<script type="module" src="/__preview/bootstrap.mjs?example=${example}"></script>`,
            ),
        );
      response.setHeader("content-type", type + "; charset=utf-8");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  previewServer().listen(4173, "127.0.0.1", () =>
    console.log(
      "Fixture preview: http://127.0.0.1:4173 — not a real Tabs session",
    ),
  );
}
