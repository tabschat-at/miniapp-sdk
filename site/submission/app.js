import { permissionRows } from "/tools/simulator/native-ui.js";
const $ = (id) => document.getElementById(id);
let preview = null,
  epoch = 0;
async function api(path, body) {
  const response = await fetch(`/developer-api/${path}`, {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data.error?.code;
    throw Error(
      code === "CONFLICT"
        ? "The package changed since discovery. Discover it again before submitting."
        : code === "RATE_LIMITED"
          ? "Too many requests. Please wait a minute and try again."
          : code === "INVALID_INPUT"
            ? "Check the fields and use a public HTTPS URL. Localhost apps need the downloaded simulator."
            : "Could not complete this request. Please try again.",
    );
  }
  return data;
}
function lines(id, messages) {
  $(id).replaceChildren(
    ...messages.map((message) => {
      const li = document.createElement("li");
      li.textContent = message;
      return li;
    }),
  );
}
function show(data) {
  preview = data.valid ? data : null;
  $("preview").hidden = false;
  $("submission").hidden = !data.valid;
  $("name").textContent = data.name;
  $("identity").textContent = data.manifest
    ? `${data.manifest.id} · ${data.manifest.version}`
    : data.url;
  $("icon").hidden = !data.iconUrl;
  $("icon").src = data.iconUrl;
  $("icon").onerror = () => {
    $("icon").hidden = true;
  };
  lines(
    "issues",
    data.issues.length ? data.issues : ["Package passed validation."],
  );
  $("issues").className = data.valid ? "valid" : "";
  lines("warnings", data.warnings);
  $("requested-permissions").replaceChildren();
  $("scopes").replaceChildren();
  if (data.manifest) {
    $("requested-permissions").append(
      permissionRows(data.manifest.permissions),
    );
    for (const [label, value] of [
      ["Minimum Tabs host", [data.manifest.minimumHostVersion]],
      ["Public record purpose", [data.manifest.recordPurpose || "None"]],
      ["Write collections", data.manifest.collections],
      ["Read collections", data.manifest.readCollections],
      ["Network access", data.manifest.networkAccess],
      ["Payment assets", data.manifest.allowedPaymentAssets],
    ]) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value.join(", ") || "None";
      $("scopes").append(dt, dd);
    }
  }
  $("manifest").textContent = JSON.stringify(data.manifest, null, 2);
  $("schemas").textContent = JSON.stringify(data.lexicons, null, 2);
  $("schemas-title").textContent = `Lexicons (${data.lexicons.length})`;
}
$("url").addEventListener("input", () => {
  epoch++;
  preview = null;
  $("preview").hidden = $("submission").hidden = $("receipt").hidden = true;
  $("status").textContent = "";
});
$("discover").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = ++epoch;
  preview = null;
  $("inspect").disabled = true;
  $("submission").hidden = $("preview").hidden = $("receipt").hidden = true;
  $("status").textContent = "Discovering manifest and Lexicons…";
  try {
    const data = await api("discover", { url: $("url").value.trim() });
    if (current !== epoch) return;
    show(data);
    $("status").textContent = data.valid
      ? "Review the permissions and package before submitting."
      : "Resolve these validation issues, then discover the package again.";
  } catch (error) {
    if (current === epoch) $("status").textContent = error.message;
  } finally {
    $("inspect").disabled = false;
  }
});
$("submit").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!preview) return;
  const current = epoch;
  $("send").disabled = true;
  $("status").textContent = "Rechecking the package and submitting…";
  try {
    const data = await api("submit", {
      url: preview.url,
      fingerprint: preview.fingerprint,
      developer: $("developer").value,
      email: $("email").value,
      description: $("description").value,
      ownershipAcknowledged: $("ownership").checked,
    });
    if (current !== epoch) return;
    if (!data.submitted) {
      show(data);
      $("status").textContent =
        "The package no longer passes validation. Resolve the issues and try again.";
      return;
    }
    preview = null;
    $("submission").hidden = true;
    $("receipt").hidden = false;
    $("reference").textContent = data.duplicate
      ? "An identical package is already awaiting review."
      : `Submission reference: ${data.id}`;
    $("status").textContent = "";
    $("receipt").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    if (current === epoch) $("status").textContent = error.message;
  } finally {
    $("send").disabled = false;
  }
});
