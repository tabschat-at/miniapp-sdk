import { appUrl } from "./library.js";
import { validateManifest } from "../common/manifest.js";

export function addProjectFields({ input, fields, initialUrl, isDismissed }) {
  const url = input("App URL", "url", initialUrl);
  url.required = true;
  const hosted = document.documentElement.dataset.hosted === "true";
  url.placeholder = hosted
    ? "https://your-app.example.org/"
    : "http://localhost:3000";
  const preview = document.createElement("div"),
    image = document.createElement("img"),
    status = document.createElement("p");
  preview.className = "discovery-preview";
  status.setAttribute("role", "status");
  status.textContent =
    "Enter a URL to discover its name, icon and Tabs permissions.";
  image.alt = "Discovered app icon";
  image.referrerPolicy = "no-referrer";
  image.hidden = true;
  image.onerror = () => {
    image.hidden = true;
  };
  preview.append(image, status);
  fields.append(preview);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "native-text-button";
  retry.textContent = "Refresh app metadata";
  retry.onclick = () => {
    loadedUrl = null;
    discover().catch((error) => {
      status.textContent = error.message;
    });
  };
  fields.append(retry);
  const name = input("App name", "text");
  name.maxLength = 60;
  const generator = document.createElement("a");
  generator.href = "/manifest-generator/index.html";
  generator.target = "_blank";
  generator.rel = "noopener";
  generator.textContent = "Create a manifest with the generator ↗";
  generator.className = "native-text-button";
  fields.append(generator);
  const advanced = document.createElement("details"),
    summary = document.createElement("summary");
  summary.textContent = "Advanced: use a manifest override";
  advanced.append(summary);
  fields.append(advanced);
  const manifest = input("Manifest JSON override (optional)", "textarea");
  manifest.rows = 5;
  manifest.spellcheck = false;
  advanced.append(manifest.parentElement);
  const fallback = input(
    "Add without host permissions if no manifest is found",
    "checkbox",
  );
  fallback.checked = false;
  fallback.parentElement.className = "check";
  let timer, controller, pending, result, loadedUrl;
  async function discover() {
    clearTimeout(timer);
    const target = appUrl(url.value, location.origin);
    if (target === loadedUrl && pending) return pending;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    loadedUrl = target;
    result = null;
    status.textContent = "Looking for the app’s manifest and icon…";
    image.hidden = true;
    pending = (async () => {
      try {
        const response = await fetch(
          hosted
            ? "/developer-api/discover"
            : `/discover?url=${encodeURIComponent(target)}`,
          {
            ...(hosted
              ? {
                  method: "POST",
                  credentials: "omit",
                  body: JSON.stringify({ url: target }),
                }
              : {}),
            headers: hosted
              ? { "content-type": "application/json" }
              : { "x-tabs-simulator": "1" },
            signal: requestController.signal,
          },
        );
        const metadata = await response.json();
        if (!response.ok)
          throw new Error(
            typeof metadata.error === "string"
              ? metadata.error
              : "Discovery failed. Online discovery needs a public HTTPS URL; use the downloaded simulator for localhost.",
          );
        if (isDismissed() || requestController.signal.aborted) return;
        result = metadata;
        name.value = metadata.name;
        image.src = metadata.iconUrl;
        image.hidden = false;
        status.textContent = metadata.manifest
          ? `${metadata.manifest.name} · ${metadata.manifest.permissions.length} requested permissions\nLoaded ${metadata.manifestUrl} · ${metadata.lexicons?.length ?? 0} Lexicons\n${[...metadata.warnings, ...(metadata.issues ?? [])].join("\n")}`
          : metadata.warnings.join("\n");
        generator.href = `/manifest-generator/index.html?name=${encodeURIComponent(metadata.name)}&url=${encodeURIComponent(target)}`;
      } catch (error) {
        if (!isDismissed() && !requestController.signal.aborted)
          status.textContent = `Could not discover this app: ${error.message}`;
      }
    })();
    return pending;
  }
  url.oninput = () => {
    clearTimeout(timer);
    controller?.abort();
    loadedUrl = null;
    result = null;
    name.value = "";
    image.hidden = true;
    fallback.checked = false;
    status.textContent = "Enter a complete app URL to discover its manifest.";
    if (url.value.trim() && url.validity.valid)
      timer = setTimeout(() => discover().catch(() => {}), 450);
  };
  if (initialUrl) timer = setTimeout(() => discover().catch(() => {}), 0);
  return {
    cleanup() {
      clearTimeout(timer);
      controller?.abort();
    },
    async collect() {
      if (!url.reportValidity()) throw new Error("Enter your app URL.");
      const target = appUrl(url.value, location.origin);
      let value;
      if (manifest.value.trim())
        value = validateManifest(JSON.parse(manifest.value), [], {
          requireLexicons: false,
        });
      else {
        await discover();
        value = result?.manifest;
        if (!value && !fallback.checked)
          throw new Error(
            "Create a Tabs manifest, or select ‘Add without host permissions’ to preview layout only.",
          );
      }
      value ||= {
        v: 1,
        id: "dev.simulator.app",
        version: "1.0.0",
        name: name.value.trim() || new URL(target).hostname,
        entrypoint: target,
        permissions: [],
        collections: [],
        readCollections: [],
        recordPurpose: "",
        allowedPaymentAssets: [],
        minimumHostVersion: "0.0.52",
        networkAccess: [],
      };
      return {
        url: target,
        manifest: {
          ...value,
          name: name.value.trim() || value.name,
          entrypoint: target,
        },
        iconUrl: result?.iconUrl,
        manifestUrl: result?.manifestUrl,
        lexicons: result?.lexicons ?? [],
      };
    },
  };
}
