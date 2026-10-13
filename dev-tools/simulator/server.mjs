#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { demoManifest, demoLexicons, parseManifest } from "./host.js";
import { loadLexicons } from "../../tools/validate.mjs";
import { discoverApp } from "./discovery.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
const assets = new Set([
  "index.html",
  "app.js",
  "style.css",
  "host.js",
  "devices.js",
  "motion.js",
  "preferences.js",
  "library.js",
  "native-ui.js",
  "sheets.js",
  "session.js",
  "welcome-tour.js",
  "live-host.js",
  "live-session.js",
  "bridge.js",
  "demo.html",
  "demo.js",
  "demo-icon.svg",
  "add-project.js",
  "../common/manifest.js",
  "../common/records.js",
  "../common/app-package.js",
  "../common/tool-theme.css",
  "../../src/bootstrap.js",
  "../vendor/lexicon.js",
  "../vendor/LICENSES.txt",
  "../manifest-generator/fields.js",
  "../manifest-generator/index.html",
  "../manifest-generator/app.js",
  "../manifest-generator/model.js",
  "../manifest-generator/style.css",
]);
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
};

export async function simulatorServer({ appDir, manifestFile } = {}) {
  const appRoot = appDir ? await realpath(resolve(appDir)) : null;
  const manifestPath = manifestFile
    ? resolve(manifestFile)
    : appRoot
      ? resolve(appRoot, "manifest.json")
      : null;
  const manifest = manifestPath
    ? parseManifest(JSON.parse(await readFile(manifestPath, "utf8")))
    : demoManifest;
  const lexicons = manifestPath
    ? await loadLexicons(dirname(manifestPath))
    : demoLexicons;
  return createServer(async (request, response) => {
    try {
      // Only serve a loopback Host, including when a browser follows a foreign link.
      if (
        !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? "")
      ) {
        response.writeHead(403).end();
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("cache-control", "no-store");
      response.setHeader("referrer-policy", "no-referrer");
      if (pathname === "/discover") {
        // A custom header prevents other websites from using this local fetcher.
        if (
          request.headers["x-tabs-simulator"] !== "1" ||
          request.method !== "GET"
        ) {
          response.writeHead(403).end();
          return;
        }
        response.setHeader("content-type", "application/json");
        try {
          const url = new URL(request.url, "http://localhost").searchParams.get(
            "url",
          );
          response.end(JSON.stringify(await discoverApp(url)));
        } catch (error) {
          response.writeHead(400).end(JSON.stringify({ error: error.message }));
        }
        return;
      }
      if (pathname === "/demo-package.json") {
        response.setHeader("content-type", "application/json");
        response.end(
          request.method === "HEAD"
            ? undefined
            : JSON.stringify({
                v: 1,
                manifest: demoManifest,
                lexicons: demoLexicons,
              }),
        );
        return;
      }
      if (pathname === "/demo-manifest.json") {
        response.setHeader("content-type", "application/json");
        response.end(
          request.method === "HEAD" ? undefined : JSON.stringify(demoManifest),
        );
        return;
      }
      if (pathname === "/config.json") {
        response.setHeader("content-type", "application/json");
        response.end(
          request.method === "HEAD"
            ? undefined
            : JSON.stringify({
                manifest,
                lexicons,
                appUrl: appRoot ? "/app/index.html" : "/demo.html",
              }),
        );
        return;
      }
      let target,
        local = false;
      if (appRoot && pathname.startsWith("/app/")) {
        const relative = pathname.slice(5);
        if (
          relative.split("/").some((part) => part.startsWith(".")) ||
          relative.includes("\\") ||
          relative.includes("\0")
        ) {
          response.writeHead(404).end();
          return;
        }
        target = await realpath(resolve(appRoot, relative || "index.html"));
        if (!target.startsWith(appRoot + sep)) {
          response.writeHead(404).end();
          return;
        }
        local = true;
      } else {
        const name =
          pathname === "/sdk/bootstrap.js"
            ? "../../src/bootstrap.js"
            : pathname === "/"
              ? "index.html"
              : pathname.startsWith("/manifest-generator/") ||
                  pathname.startsWith("/common/") ||
                  pathname.startsWith("/vendor/")
                ? ".." + pathname
                : pathname.slice(1);
        if (!assets.has(name)) {
          response.writeHead(404).end();
          return;
        }
        target = resolve(root, name);
      }
      const type = types[extname(target)];
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      let body = await readFile(target);
      if (local && extname(target) === ".html") {
        const script = '<script src="/bridge.js"></script>';
        const html = body.toString();
        body = /<head\b[^>]*>/i.test(html)
          ? html.replace(/<head\b[^>]*>/i, (match) => match + script)
          : html.replace(/^(<!doctype[^>]*>)?/i, (match) => match + script);
      }
      if (!local)
        response.setHeader(
          "content-security-policy",
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: http: https:; frame-src http: https:; base-uri 'none'; frame-ancestors 'self'",
        );
      response.setHeader("content-type", type);
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => null)) ===
    fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        app: { type: "string" },
        manifest: { type: "string" },
        port: { type: "string", default: "4174" },
        help: { type: "boolean" },
      },
    });
    if (values.help) {
      console.log(
        "Tabs SDK simulator\n  --app <static-folder>    Serve an app and inject the development bridge\n  --manifest <json-file>   Defaults to <app>/manifest.json\n  --port <port>           Loopback port (default 4174)\n\nFor a running dev server, open its URL in the simulator and add the bridge snippet shown in the UI.",
      );
    } else {
      const port = Number(values.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("Port must be 1–65535");
      const server = await simulatorServer({
        appDir: values.app,
        manifestFile: values.manifest,
      });
      server.on("error", (error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
      server.listen(port, "127.0.0.1", () =>
        console.log(
          `Tabs SDK simulator: http://127.0.0.1:${port}\nFixtures only. No real account, message, publication or payment.`,
        ),
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
