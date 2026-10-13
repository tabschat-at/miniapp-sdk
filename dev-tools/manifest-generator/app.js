import {
  features,
  starterLexicons,
  buildManifest,
  validateGenerated,
  discoverySnippet,
} from "./model.js";
import { validateManifest } from "../common/manifest.js";
import { schemaEditor } from "./fields.js";
import { createRecordSchemas } from "../common/records.js";
import {
  validateAppPackage,
  packageFiles,
  packageZip,
} from "../common/app-package.js";
import { permissionRows } from "/native-ui.js";

const $ = (id) => document.getElementById(id);
const keys = [
  "id",
  "name",
  "version",
  "entrypoint",
  "collections",
  "readCollections",
  "recordPurpose",
  "networkAccess",
  "minimumHostVersion",
];
let manifest,
  documents = [],
  valid = false;
const drafts = new Map(),
  imported = new Set();
let editorIds = "";
const query = new URLSearchParams(location.search);
if (query.get("name")) $("name").value = query.get("name").slice(0, 60);
if (query.get("url")) {
  try {
    const url = new URL(query.get("url"));
    if (url.protocol === "https:") {
      url.search = "";
      url.hash = "";
      url.username = "";
      url.password = "";
      $("entrypoint").value = url.href;
    }
  } catch {
    /* Keep the example production URL. */
  }
}
for (const [capability, title, description] of features) {
  const label = document.createElement("label"),
    checkbox = document.createElement("input"),
    text = document.createElement("span"),
    strong = document.createElement("strong"),
    small = document.createElement("small");
  label.className = "feature";
  checkbox.type = "checkbox";
  checkbox.value = capability;
  checkbox.name = "permission";
  checkbox.checked = capability === "identity.basic";
  strong.textContent = title;
  small.textContent = description;
  text.append(strong, small);
  label.append(checkbox, text);
  $("features").append(label);
}
const checkboxes = [...document.querySelectorAll('[name="permission"]')];
function setPermissions(permissions) {
  for (const checkbox of checkboxes)
    checkbox.checked = permissions.includes(checkbox.value);
}
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render(forceEditors = false) {
  const values = Object.fromEntries(keys.map((key) => [key, $(key).value]));
  values.permissions = checkboxes
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
  manifest = buildManifest(values);
  if (manifest.permissions.some((p) => p.startsWith("wallet.")))
    checkboxes.find((checkbox) => checkbox.value === "wallet.connect").checked =
      true;
  if (manifest.permissions.includes("blobs.upload"))
    checkboxes.find((checkbox) => checkbox.value === "records.write").checked =
      true;
  $("record-settings").hidden = !manifest.permissions.some((p) =>
    p.startsWith("records."),
  );
  $("write-setting").hidden = !manifest.permissions.includes("records.write");
  $("read-setting").hidden = !manifest.permissions.includes("records.read");
  $("collections").placeholder = $("readCollections").placeholder =
    `${manifest.id}.note`;
  const ids = [
    ...new Set([...manifest.collections, ...manifest.readCollections]),
  ];
  for (const doc of starterLexicons(manifest))
    if (!drafts.has(doc.id)) drafts.set(doc.id, doc);
  documents = [...new Set([...ids, ...imported])].map((id) => drafts.get(id));
  $("lexicon-settings").hidden = !documents.length;
  const nextIds = documents.map((doc) => doc.id).join("|");
  if (forceEditors === true || editorIds !== nextIds) {
    editorIds = nextIds;
    $("field-editors").replaceChildren(
      ...documents.map((doc) =>
        schemaEditor(doc, (force) => render(force === true)),
      ),
    );
  }
  const selected = $("record-collection").value;
  $("record-collection").replaceChildren(
    ...documents
      .filter((doc) => doc.defs.main?.type === "record")
      .map((doc) => {
        const option = document.createElement("option");
        option.value = option.textContent = doc.id;
        return option;
      }),
  );
  if (documents.some((doc) => doc.id === selected))
    $("record-collection").value = selected;
  if (selected !== $("record-collection").value) sampleRecord();
  $("json").textContent = JSON.stringify(manifest, null, 2);
  $("preview-name").textContent =
    `${manifest.name || "Your app"} would like access`;
  try {
    $("preview-host").textContent = new URL(manifest.entrypoint).hostname;
  } catch {
    $("preview-host").textContent = "Enter your production URL";
  }
  $("preview-permissions").replaceChildren(
    permissionRows(manifest.permissions),
  );
  if (!manifest.permissions.length)
    $("preview-permissions").textContent = "No host permissions requested.";
  $("preview-purpose").textContent = manifest.recordPurpose
    ? `App’s explanation: ${manifest.recordPurpose}`
    : "";
  try {
    if (!$("editor").checkValidity())
      throw Error("Complete the highlighted fields with valid values.");
    validateGenerated(manifest, documents);
    $("snippet").textContent = discoverySnippet($("iconUrl").value);
    valid = true;
    $("error").textContent = "";
    $("validation").textContent = "✓ Preflight passed";
  } catch (error) {
    valid = false;
    $("error").textContent = error.message;
    $("validation").textContent = "Needs attention";
    try {
      $("snippet").textContent = discoverySnippet($("iconUrl").value);
    } catch {
      $("snippet").textContent = discoverySnippet();
    }
  }
  $("validation").className = valid ? "valid" : "invalid";
  $("download-package").disabled =
    $("download").disabled =
    $("copy").disabled =
      !valid;
  $("schemas").hidden = !valid || !documents.length;
  $("schema-downloads").replaceChildren();
  if (valid)
    for (const doc of documents) {
      const button = document.createElement("button");
      button.textContent = `↓ ${doc.id}.json`;
      button.onclick = () => download(`${doc.id}.json`, doc);
      $("schema-downloads").append(button);
    }
}
$("editor").onsubmit = (event) => event.preventDefault();
$("editor").addEventListener("input", () => render());
$("template").onchange = () => {
  const selection = $("template").value;
  setPermissions(
    {
      basic: ["identity.basic"],
      notes: ["identity.basic", "records.read", "records.write"],
      signin: ["identity.basic", "identity.authenticate"],
      payments: ["identity.basic", "payments.request"],
    }[selection],
  );
  if (selection === "notes") {
    $("collections").value = $("readCollections").value =
      `${$("id").value}.note`;
    $("recordPurpose").value = "Save and manage your public notes.";
  } else $("recordPurpose").value = "";
  $("minimumHostVersion").value = "";
  render();
};
$("import").onchange = async () => {
  const file = $("import").files[0];
  if (!file) return;
  try {
    if (file.size > 1048576)
      throw new Error("Package is too large (maximum 1 MB).");
    const parsed = JSON.parse(await file.text());
    const pkg = parsed.manifest ? validateAppPackage(parsed) : null;
    const value = validateManifest(pkg?.manifest ?? parsed, [], {
      requireLexicons: false,
    });
    for (const key of keys)
      $(key).value = Array.isArray(value[key])
        ? value[key].join("\n")
        : value[key];
    setPermissions(value.permissions);
    if (pkg) {
      drafts.clear();
      imported.clear();
    }
    for (const doc of pkg?.lexicons ?? []) {
      drafts.set(doc.id, doc);
      imported.add(doc.id);
    }
    render(true);
    $("notice").textContent =
      "Imported. Existing schemas are preserved; import reviewed schemas before editing shared collections.";
  } catch (error) {
    $("notice").textContent = `Import failed: ${error.message}`;
  }
  $("import").value = "";
};
$("download").onclick = () => {
  if (valid) download("manifest.json", manifest);
};
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    $("notice").textContent = "Copied to clipboard.";
  } catch {
    $("notice").textContent =
      "Clipboard unavailable. Select and copy the preview text.";
  }
}
$("copy").onclick = () => {
  if (valid) copy($("json").textContent);
};
$("copy-snippet").onclick = () => copy($("snippet").textContent);
render();

$("download-package").onclick = () => {
  if (!valid) return;
  const zip = packageZip(
    packageFiles(manifest, documents, $("snippet").textContent),
  );
  const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${manifest.id}-package.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("import-schemas").onchange = async () => {
  try {
    const files = [...$("import-schemas").files];
    if (
      files.length > 128 ||
      files.reduce((sum, file) => sum + file.size, 0) > 1048576
    )
      throw Error("Schema import exceeds 128 files / 1 MB.");
    const docs = await Promise.all(
      files.map(async (file) => JSON.parse(await file.text())),
    );
    // Validate the complete candidate, including dependencies, before replacing any drafts.
    const candidate = new Map(drafts);
    for (const doc of docs) candidate.set(doc.id, doc);
    const activeIds = new Set([
      ...manifest.collections,
      ...manifest.readCollections,
      ...imported,
      ...docs.map((doc) => doc.id),
    ]);
    createRecordSchemas(
      [...candidate.values()].filter((doc) => activeIds.has(doc.id)),
    );
    for (const doc of docs) {
      drafts.set(doc.id, doc);
      imported.add(doc.id);
    }
    render(true);
    $("notice").textContent = "Lexicons imported unchanged.";
  } catch (error) {
    $("notice").textContent = `Schema import failed: ${error.message}`;
  }
  $("import-schemas").value = "";
};
function sampleRecord() {
  const id = $("record-collection").value;
  const properties = drafts.get(id)?.defs.main?.record?.properties ?? {};
  const value = { $type: id };
  for (const [name, def] of Object.entries(properties)) {
    if (def.type === "string")
      value[name] =
        def.format === "datetime" ? new Date().toISOString() : "Example";
    if (def.type === "integer") value[name] = def.minimum ?? 0;
    if (def.type === "boolean") value[name] = false;
    if (def.type === "array") value[name] = [];
  }
  $("record-example").value = JSON.stringify(value, null, 2);
  $("record-result").textContent = "";
}
$("record-collection").onchange = sampleRecord;
$("validate-record").onclick = () => {
  try {
    createRecordSchemas(documents).validate(
      $("record-collection").value,
      JSON.parse($("record-example").value),
    );
    $("record-result").textContent =
      "✓ Record matches the schema and host limits.";
    $("record-result").className = "valid";
  } catch (error) {
    $("record-result").textContent = error.message;
    $("record-result").className = "invalid";
  }
};
