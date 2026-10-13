import { validateAppPackage } from "../common/app-package.js";
import { createRecordSchemas } from "../common/records.js";
import { validateManifest } from "../common/manifest.js";

function httpUrl(value, base) {
  const url = new URL(value, base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS URL without credentials.");
  return url;
}
function decode(value) {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (match, entity) => {
      if (entity[0] === "#") {
        const code =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[
        entity.toLowerCase()
      ];
    },
  );
}
export function pageMetadata(html, pageUrl) {
  const links = [],
    meta = {};
  // Only extract metadata, never execute the document or its scripts.
  html = html.replace(
    /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    "",
  );
  const tags = [
    ...html.matchAll(/<(link|meta|base)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi),
  ];
  let base = pageUrl;
  for (const tag of tags) {
    const attrs = {};
    for (const attr of tag[2].matchAll(
      /([^\s=/'"<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+))/g,
    ))
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4]);
    if (tag[1].toLowerCase() === "base" && attrs.href && base === pageUrl) {
      try {
        base = httpUrl(attrs.href, pageUrl).href;
      } catch {
        /* Ignore non-web bases. */
      }
    }
    if (tag[1].toLowerCase() === "link" && attrs.href) links.push(attrs);
    if (tag[1].toLowerCase() === "meta")
      meta[attrs.name ?? attrs.property] = attrs.content;
  }
  const resolve = (value) => {
    try {
      return httpUrl(value, base).href;
    } catch {
      return null;
    }
  };
  return {
    name: (
      meta["application-name"] ||
      meta["og:title"] ||
      decode(html.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1] ?? "")
    )
      .trim()
      .slice(0, 60),
    links: links
      .map((link) => ({
        ...link,
        href: resolve(link.href),
        rel: (link.rel ?? "").toLowerCase().split(/\s+/),
      }))
      .filter((link) => link.href),
  };
}

export async function discoverApp(
  value,
  { fetcher = fetch, timeout = 10000 } = {},
) {
  if (!value || value.length > 2048)
    throw new Error("Enter an app URL (up to 2048 characters).");
  const url = httpUrl(value),
    signal = AbortSignal.timeout(timeout);
  let requests = 0;
  async function load(target, limit = 262144) {
    let next = httpUrl(target);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (++requests > 150) throw new Error("Too many discovery requests.");
      const response = await fetcher(next, {
        signal,
        redirect: "manual",
        credentials: "omit",
        headers: { Accept: "text/html, application/json" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        next = httpUrl(response.headers.get("location"), next);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw new Error("Metadata is too large.");
      }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) throw new Error("Metadata is too large.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return { text: Buffer.concat(chunks).toString("utf8"), url: next.href };
    }
    throw new Error("Too many redirects.");
  }
  let page = { name: "", links: [] },
    pageUrl = url.href;
  const warnings = [];
  try {
    const loaded = await load(url, 1048576);
    pageUrl = loaded.url;
    page = pageMetadata(loaded.text, pageUrl);
  } catch {
    warnings.push(
      "Could not read the page’s HTML; checking the standard manifest locations.",
    );
  }
  const explicit = page.links.filter((link) =>
    link.rel.includes("tabs-manifest"),
  );
  const webLinks = page.links.filter((link) => link.rel.includes("manifest"));
  const candidates = [
    ...new Set([
      ...explicit.map((link) => link.href),
      ...webLinks.map((link) => link.href),
      new URL("./manifest.json", pageUrl).href,
      new URL("/manifest.json", pageUrl).href,
    ]),
  ].slice(0, 6);
  let manifest = null,
    manifestUrl = null,
    webManifest = null,
    webManifestUrl;
  for (const candidate of candidates) {
    if (manifest && !webLinks.some((link) => link.href === candidate)) continue;
    try {
      const loaded = await load(candidate);
      const parsed = JSON.parse(loaded.text);
      if (parsed?.v === 1 || explicit.some((link) => link.href === candidate)) {
        validateManifest(parsed, [], { requireLexicons: false });
        if (!manifest) {
          manifest = parsed;
          manifestUrl = loaded.url;
        }
        if (!webLinks.length || webManifest) break;
      }
      if (webLinks.some((link) => link.href === candidate)) {
        webManifest = parsed;
        webManifestUrl = loaded.url;
        if (manifest) break;
      }
    } catch (error) {
      if (
        explicit.some((link) => link.href === candidate) ||
        /Manifest|permission|collection|host|Entrypoint|Name|Invalid|version|Unknown|Network|USDC|Blob|Authentication/.test(
          error.message,
        )
      )
        warnings.push(`${candidate}: ${error.message}`);
    }
  }
  let lexicons = [];
  // A portable package contains the complete dependency set, including helper Lexicons.
  const packageLinks = page.links
    .filter((link) => link.rel.includes("tabs-package"))
    .slice(0, 2);
  if (!packageLinks.length && manifestUrl)
    packageLinks.push({
      href: new URL("./app-package.json", manifestUrl).href,
    });
  for (const link of packageLinks) {
    try {
      const loaded = await load(link.href, 1048576);
      const pkg = validateAppPackage(JSON.parse(loaded.text));
      if (
        manifest &&
        JSON.stringify(canonical(manifest)) !==
          JSON.stringify(canonical(pkg.manifest))
      )
        throw Error(
          "Package manifest differs from manifest.json; rebuild the package.",
        );
      manifest ||= pkg.manifest;
      manifestUrl ||= loaded.url;
      lexicons = pkg.lexicons;
      break;
    } catch (error) {
      if (
        page.links.some(
          (item) =>
            item.rel.includes("tabs-package") && item.href === link.href,
        )
      )
        warnings.push(`App package: ${error.message}`);
    }
  }
  // Existing packages without a portable index use lexicons/<collection>.json beside the manifest.
  if (!lexicons.length && manifest && manifestUrl) {
    const pending = [
        ...new Set([...manifest.collections, ...manifest.readCollections]),
      ],
      loadedIds = new Set();
    const docs = [];
    while (pending.length && loadedIds.size < 128) {
      const id = pending.shift();
      if (loadedIds.has(id)) continue;
      loadedIds.add(id);
      if (!/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/.test(id)) {
        warnings.push(`Invalid Lexicon reference: ${id}`);
        continue;
      }
      try {
        const loaded = await load(
          new URL(`./lexicons/${id}.json`, manifestUrl),
        );
        const doc = JSON.parse(loaded.text);
        if (doc.id !== id) throw Error("Lexicon identity mismatch.");
        docs.push(doc);
        if (Buffer.byteLength(JSON.stringify(docs)) > 1048576)
          throw Error("Schemas exceed 1 MB.");
        const visit = (value) => {
          if (!value || typeof value !== "object") return;
          const refs =
            value.type === "ref"
              ? [value.ref]
              : value.type === "union"
                ? value.refs
                : [];
          for (const ref of refs ?? [])
            if (typeof ref === "string" && !ref.startsWith("#"))
              pending.push(ref.replace(/^lex:/, "").split("#")[0]);
          Object.values(value).forEach(visit);
        };
        visit(doc.defs);
      } catch (error) {
        warnings.push(`${id}: ${error.message}`);
      }
    }
    try {
      createRecordSchemas(docs);
      lexicons = docs;
    } catch (error) {
      warnings.push(`Record schemas could not be loaded: ${error.message}`);
    }
  }
  const missing = [
    ...new Set([
      ...(manifest?.collections ?? []),
      ...(manifest?.readCollections ?? []),
    ]),
  ].filter(
    (id) =>
      !lexicons.some(
        (doc) => doc.id === id && doc.defs.main?.type === "record",
      ),
  );
  if (missing.length)
    warnings.push(
      `Missing record schemas: ${missing.join(", ")}. Import them in the inspector before testing record writes.`,
    );
  let iconUrl = page.links.find((link) =>
    link.rel.includes("apple-touch-icon"),
  )?.href;
  if (!iconUrl && Array.isArray(webManifest?.icons)) {
    const icons = webManifest.icons.filter(
      (icon) => typeof icon.src === "string",
    );
    const best =
      icons.find((icon) => /(?:192|256|512)x/.test(icon.sizes ?? "")) ??
      icons[0];
    try {
      if (best) iconUrl = httpUrl(best.src, webManifestUrl).href;
    } catch {
      /* Ignore invalid icons. */
    }
  }
  iconUrl ||=
    page.links.find((link) => link.rel.includes("icon"))?.href ??
    new URL("/favicon.ico", pageUrl).href;
  if (!manifest)
    warnings.push(
      "No valid Tabs V1 manifest found. A web app manifest supplies branding, but cannot declare Tabs permissions.",
    );
  return {
    url: url.href,
    name:
      manifest?.name ||
      page.name ||
      String(
        webManifest?.name ?? webManifest?.short_name ?? url.hostname,
      ).slice(0, 60),
    iconUrl,
    manifest,
    manifestUrl,
    lexicons,
    warnings,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
