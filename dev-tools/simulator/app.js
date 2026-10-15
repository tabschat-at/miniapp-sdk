import { createRecordSchemas } from "../common/records.js";
import { validateAppPackage } from "../common/app-package.js";
import {
  createSimulator,
  demoManifest,
  demoLexicons,
  profiles,
} from "./host.js";
import { createWorkspacePreferences, clampDimension } from "./preferences.js";
import { chooseFixtureUser } from "./session.js";
import {
  devices,
  deviceViewport,
  toggleFold,
  hostChrome,
  chromeHeight,
} from "./devices.js";
import { slide, stopMotion } from "./motion.js";
import { createProjectLibrary, appUrl, sameManifest } from "./library.js";
import { icon } from "./native-ui.js";
import { showPrompt, cancelPrompt } from "./sheets.js";
import { showWelcomeTour } from "./welcome-tour.js";
import { createLiveHost } from "./live-host.js";
import { signInLive, signOutLive } from "./live-session.js";
import { setupScreenshots } from "./screenshots.js";

const $ = (id) => document.getElementById(id);
let frame = $("app-frame");
const channel = "tabs-sdk-simulator-v1";
let targetOrigin = location.origin,
  runtime = null,
  connectionTimer,
  operation = 0;
let current = null,
  simulator = null,
  activeRequests = new Set(),
  editing = false;
let viewport = { width: 412, height: 915 },
  dpr = devices[0].dpr;
const models = new Map();
const settings = {
  offline: false,
  latency: 0,
  paymentResult: "cancelled",
};
const config = await fetch("/config.json").then((response) => response.json());
let storage;
try {
  storage = localStorage;
} catch {
  /* In-memory library remains usable. */
}
const preferences = createWorkspacePreferences({ storage });
let workspaceSettings = preferences.get();
let hostIdentity =
  profiles.find((p) => p.did === workspaceSettings.profileDid) ?? null;
// A reload always starts in fixture mode. Live account authority is never a
// localStorage preference and fixture consent never grants real permissions.
let sessionMode = "simulated",
  liveExpiryTimer;
function rememberWorkspace(patch) {
  workspaceSettings = preferences.set(patch);
}
function renderSession() {
  const live = sessionMode === "live";
  $("session-mode").value = sessionMode;
  $("live-notice").hidden = !live;
  for (const id of ["offline", "latency", "payment-result"])
    $(id).disabled = live;
  $("host-status").textContent = live
    ? "WEB HOST · LIVE ACCOUNT ▰"
    : "SIMULATED HOST ▰";
  $("identity").textContent = hostIdentity?.displayName ?? "Signed out";
  $("handle").textContent = hostIdentity?.handle ?? "Choose a fixture user";
  $("session-avatar").textContent = $("launcher-avatar").textContent =
    hostIdentity?.displayName.slice(0, 1) ?? "?";
  $("signin").textContent = hostIdentity ? "Switch user" : "Sign in";
  $("signout").disabled = !hostIdentity;
}
const library = createProjectLibrary({
  storage,
  baseUrl: location.origin,
  seeds: [
    {
      url: config.appUrl,
      lexicons: config.lexicons ?? [],
      manifest: {
        ...config.manifest,
        entrypoint: appUrl(config.appUrl, location.origin),
      },
    },
    {
      url: "/demo.html",
      lexicons: demoLexicons,
      manifest: {
        ...demoManifest,
        entrypoint: appUrl("/demo.html", location.origin),
      },
    },
  ],
  onStorageError: (message) => {
    $("error").textContent = message;
  },
});
$("snippet").textContent =
  `<script src="${location.origin}/sdk/${document.documentElement.dataset.hosted === "true" ? "0.2.0/" : ""}bootstrap.js"></script>`;
$("close-app").append(icon("close"));
$("app-permissions").append(icon("shield"));
$("add-app").append(icon("plus"));

function addLog({ method, status, detail }) {
  const item = document.createElement("li"),
    time = document.createElement("small");
  item.textContent = `${method} · ${status}`;
  item.className = status === "ok" ? "allow" : "deny";
  if (detail) {
    const description = document.createElement("div");
    description.textContent = detail;
    item.append(description);
  }
  time.textContent = new Date().toLocaleTimeString();
  item.append(time);
  $("activity").prepend(item);
  while ($("activity").children.length > 80) $("activity").lastChild.remove();
}
function renderState(state = { identity: null, permissions: {}, records: [] }) {
  $("permissions").replaceChildren();
  for (const [capability, status] of Object.entries(state.permissions)) {
    const row = document.createElement("div"),
      name = document.createElement("span"),
      decision = document.createElement("span");
    name.textContent = capability;
    decision.textContent = status === "allow" ? "Allowed" : "Denied by user";
    decision.className = status;
    row.append(name, decision);
    if (status === "allow" && !state.live) {
      const revoke = document.createElement("button");
      revoke.textContent = "Revoke";
      revoke.onclick = () => {
        cancelPrompt();
        Promise.resolve(simulator?.revoke(capability)).catch((error) => {
          $("error").textContent = error.message;
        });
      };
      row.append(revoke);
    }
    $("permissions").append(row);
  }
  const missing = state.missingDeclarations ?? [];
  $("permission-warning").hidden = !missing.length;
  $("permission-warning").textContent = `${missing.length} missing`;
  for (const diagnostic of missing) {
    const row = document.createElement("div"),
      name = document.createElement("span"),
      detail = document.createElement("small"),
      status = document.createElement("span");
    name.textContent = diagnostic.name;
    detail.textContent = `${diagnostic.methods.join(", ")} · ${diagnostic.attempts} attempt${diagnostic.attempts === 1 ? "" : "s"} · add to ${diagnostic.field}`;
    name.append(detail);
    status.textContent = "Missing from manifest";
    status.className = "deny";
    row.append(name, status);
    $("permissions").append(row);
  }
  if (!Object.keys(state.permissions).length && !missing.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = current
      ? "No decisions yet."
      : "Open an app to inspect its access.";
    $("permissions").append(empty);
  }
  const docs = state.lexicons ?? [];
  const collections = [
    ...new Set([
      ...(state.manifest?.collections ?? []),
      ...(state.manifest?.readCollections ?? []),
    ]),
  ];
  const missingSchemas = collections.filter(
    (id) =>
      !docs.some((doc) => doc.id === id && doc.defs.main?.type === "record"),
  );
  $("schema-status").textContent = current
    ? `${docs.length} Lexicon${docs.length === 1 ? "" : "s"} loaded.${missingSchemas.length ? ` Missing: ${missingSchemas.join(", ")}. Writes to these collections will fail.` : " Record writes are validated before saving."}`
    : "Open an app to inspect or import its record schemas.";
  $("schema-status").className = missingSchemas.length ? "deny" : "hint";
  $("import-package").disabled = !current || sessionMode === "live";
  $("records").textContent = JSON.stringify(state.records, null, 2);
  $("record-count").textContent = state.records.length;
}
function renderLibrary() {
  const projects = library.list();
  $("app-grid").replaceChildren();
  $("edit-apps").textContent = editing ? "Done" : "Edit";
  for (const project of projects) {
    const tile = document.createElement("div");
    tile.className = "launcher-tile";
    const button = document.createElement("button");
    button.className = "launcher-open";
    button.setAttribute("aria-label", `Open ${project.manifest.name}`);
    const badge = document.createElement("span"),
      name = document.createElement("span");
    badge.className = "launcher-app-icon";
    badge.textContent =
      project.manifest.name.trim().slice(0, 1).toUpperCase() || "A";
    if (project.iconUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = project.iconUrl;
      image.referrerPolicy = "no-referrer";
      image.onerror = () => image.remove();
      badge.append(image);
    }
    name.className = "launcher-app-name";
    name.textContent = project.manifest.name;
    button.append(badge, name);
    button.onclick = () => openProject(project.url);
    tile.append(button);
    if (editing) {
      const remove = document.createElement("button");
      remove.className = "launcher-remove";
      remove.setAttribute("aria-label", `Remove ${project.manifest.name}`);
      remove.append(icon("close"));
      remove.onclick = () => removeProject(project);
      tile.append(remove);
    }
    $("app-grid").append(tile);
  }
  const add = document.createElement("button");
  add.className = "launcher-open launcher-add-tile";
  const badge = document.createElement("span"),
    label = document.createElement("span");
  badge.className = "launcher-app-icon";
  badge.append(icon("plus"));
  label.className = "launcher-app-name";
  label.textContent = "Add app";
  add.append(badge, label);
  add.onclick = () => addProject();
  $("app-grid").append(add);
}
function modelFor(project) {
  let model = models.get(project.url);
  if (
    model &&
    (!sameManifest(model.state().manifest, project.manifest) ||
      !sameManifest(model.state().lexicons, project.lexicons))
  ) {
    model.suspend();
    models.delete(project.url);
    model = null;
  }
  if (!model) {
    const create = sessionMode === "live" ? createLiveHost : createSimulator;
    model = create({
      manifest: project.manifest,
      lexicons: project.lexicons,
      consent: project,
      identity: hostIdentity,
      url: project.url,
      prompt: (kind, detail) =>
        showPrompt(kind, {
          appName: project.manifest.name,
          entrypoint: project.url,
          ...detail,
        }),
      changed: (state) => {
        if (!state.live) library.remember(project.url, state);
        if (current?.url === project.url) renderState(state);
        renderLibrary();
      },
      log: addLog,
    });
    models.set(project.url, model);
  }
  model.configure(settings);
  return model;
}
function stopCurrent() {
  cancelPrompt();
  stopMotion($("miniapp-surface"));
  $("miniapp-surface").hidden = true;
  $("miniapp-surface").inert = false;
  operation++;
  simulator?.suspend();
  runtime = null;
  activeRequests = new Set();
  clearTimeout(connectionTimer);
  // A fresh browsing context prevents queued messages from a closed app from
  // being mistaken for requests from the next project at the same origin.
  const nextFrame = frame.cloneNode(false);
  nextFrame.src = "about:blank";
  nextFrame.hidden = true;
  frame.replaceWith(nextFrame);
  frame = nextFrame;
}
function showHome() {
  stopCurrent();
  current = null;
  simulator = null;
  editing = false;
  $("launcher").hidden = false;
  $("launcher").inert = false;
  $("miniapp-header").hidden = true;
  $("app-loading").hidden = true;
  $("connection").textContent =
    "Choose an app from your library, or add one with +.";
  $("manifest").value = "";
  $("app-url").textContent = "Open an app to view its connection and manifest.";
  $("manifest").disabled = true;
  $("apply-manifest").disabled = true;
  $("reset").disabled = true;
  $("reload").disabled = true;
  $("clear-permissions").disabled = true;
  renderState();
  renderLibrary();
}
async function openProject(url) {
  if (!hostIdentity) {
    const signedIn = await signIn(false);
    if (!signedIn) return;
  }
  const project = library.get(url);
  if (!project) return;
  stopCurrent();
  const ticket = operation;
  current = project;
  $("launcher").inert = true;
  $("miniapp-header").hidden = false;
  $("app-loading").hidden = false;
  $("miniapp-title").textContent = `Tabs · ${project.manifest.name}`;
  $("manifest").value = JSON.stringify(project.manifest, null, 2);
  $("app-url").textContent = project.url;
  $("manifest").disabled = sessionMode === "live";
  $("apply-manifest").disabled = sessionMode === "live";
  $("reset").disabled = sessionMode === "live";
  $("reload").disabled = false;
  $("clear-permissions").disabled = sessionMode === "live";
  $("connection").textContent = "Opening app…";
  $("error").textContent = "";
  const model = modelFor(project);
  simulator = model;
  renderState(model.state());
  renderLibrary();
  try {
    // Let a dismissed sheet release its host prompt before reopening this app.
    await Promise.resolve();
    if (ticket !== operation) return;
    await model.open();
    if (ticket !== operation) return;
    $("manifest").value = JSON.stringify(model.state().manifest, null, 2);
    $("miniapp-title").textContent = `Tabs · ${model.state().manifest.name}`;
    targetOrigin = new URL(project.url).origin;
    $("connection").textContent = "Connecting to app…";
    frame.hidden = false;
    frame.src = project.url;
    $("app-loading").hidden = true;
    $("launcher").inert = true;
    $("miniapp-surface").hidden = false;
    void slide($("miniapp-surface"), true);
    connectionTimer = setTimeout(() => {
      if (ticket === operation && !runtime)
        $("connection").textContent =
          "App loaded, but its host bridge is not connected. Add the SDK bootstrap before app code and allow framing by this simulator.";
    }, 5000);
  } catch (error) {
    if (ticket === operation) {
      showHome();
      $("error").textContent = error.message;
    }
  }
}
async function addProject(url = "") {
  try {
    const answer = await showPrompt("addProject", { url });
    if (answer === "cancel") return null;
    const old = library.get(answer.url),
      project = library.add(answer);
    if (
      old &&
      (!sameManifest(old.manifest, project.manifest) ||
        !sameManifest(old.lexicons, project.lexicons))
    ) {
      models.get(project.url)?.suspend();
      models.delete(project.url);
    }
    if (current?.url === project.url) await openProject(project.url);
    else renderLibrary();
    return project;
  } catch (error) {
    $("error").textContent = error.message;
    return null;
  }
}
async function removeProject(project) {
  if ((await showPrompt("removeProject", project)) !== "remove") return;
  if (current?.url === project.url) showHome();
  models.get(project.url)?.suspend();
  models.delete(project.url);
  library.remove(project.url);
  renderLibrary();
}
function resetProject(url) {
  cancelPrompt();
  library.forgetConsent(url);
  models.get(url)?.reset();
  if (current?.url === url) openProject(url);
  else renderLibrary();
}
async function managePermissions() {
  if (!current || !simulator) return;
  const model = simulator,
    project = current;
  try {
    const state = model.state();
    const answer = await showPrompt("managePermissions", {
      manifest: state.manifest,
      grants: state.permissions,
      live: state.live,
    });
    if (simulator !== model || current !== project) return;
    if (["allow", "revoke"].includes(answer))
      await model.setPermissionDecision(answer === "allow");
  } catch (error) {
    $("error").textContent = error.message;
  }
}
addEventListener("message", async (event) => {
  const data = event.data;
  if (
    !current ||
    !simulator ||
    event.source !== frame.contentWindow ||
    event.origin !== targetOrigin ||
    data?.channel !== channel ||
    typeof data.session !== "string" ||
    data.session.length > 100
  )
    return;
  const model = simulator;
  if (data.type === "ready") {
    if (runtime && runtime !== data.session) {
      cancelPrompt();
      activeRequests = new Set();
      try {
        await model.open();
      } catch {
        return;
      }
      if (simulator !== model || event.source !== frame.contentWindow) return;
    }
    runtime = data.session;
    clearTimeout(connectionTimer);
    $("connection").textContent = "● Simulator bridge connected";
    event.source.postMessage(
      { channel, type: "connected", session: runtime, mode: sessionMode },
      event.origin,
    );
    $("connection").textContent =
      sessionMode === "live"
        ? "● Live Tabs host connected · real data"
        : "● Simulated host connected · fixture data";
    return;
  }
  if (
    data.type !== "call" ||
    data.session !== runtime ||
    typeof data.id !== "string" ||
    !data.id.startsWith(`${runtime}:`) ||
    data.id.length > 130 ||
    activeRequests.has(data.id)
  )
    return;
  const requests = activeRequests,
    session = runtime;
  const respond = (message) => {
    if (
      simulator === model &&
      runtime === session &&
      requests === activeRequests
    )
      event.source.postMessage(
        { channel, type: "result", session, id: data.id, ...message },
        event.origin,
      );
  };
  if (requests.size >= 8) {
    respond({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Too many pending calls" },
    });
    return;
  }
  requests.add(data.id);
  try {
    if (JSON.stringify(data).length > 65536)
      throw Object.assign(new Error("Request is too large"), {
        code: "INVALID_INPUT",
      });
    respond({ ok: true, result: await model.call(data.method, data.params) });
  } catch (error) {
    respond({
      ok: false,
      error: {
        code: error.code || "INVALID_INPUT",
        message: error.message || "Simulator request failed",
      },
    });
  } finally {
    requests.delete(data.id);
  }
});
$("add-app").onclick = () => addProject();
$("edit-apps").onclick = () => {
  editing = !editing;
  renderLibrary();
};
$("close-app").onclick = async () => {
  const ticket = ++operation;
  simulator?.suspend();
  runtime = null;
  activeRequests = new Set();
  clearTimeout(connectionTimer);
  cancelPrompt();
  $("miniapp-surface").inert = true;
  await slide($("miniapp-surface"), false);
  if (ticket === operation) showHome();
};
$("app-permissions").onclick = managePermissions;
$("reload").onclick = () => current && openProject(current.url);
$("reset").onclick = () => current && resetProject(current.url);
function changeUser(did) {
  if (
    sessionMode === "simulated" &&
    (hostIdentity?.did === did || (!hostIdentity && did === null))
  )
    return;
  showHome();
  clearTimeout(liveExpiryTimer);
  sessionMode = "simulated";
  hostIdentity = profiles.find((p) => p.did === did) ?? null;
  for (const project of library.list()) library.forgetConsent(project.url);
  for (const model of models.values()) {
    model.setIdentity(hostIdentity);
    model.suspend();
  }
  models.clear();
  rememberWorkspace({ profileDid: hostIdentity?.did ?? null });
  renderSession();
}
async function signIn(resume = true) {
  if (sessionMode === "live") return enterLive(true);
  const url = resume ? current?.url : null;
  showHome();
  const did = await chooseFixtureUser(hostIdentity?.did);
  if (did) changeUser(did);
  if (url && hostIdentity) await openProject(url);
  return Boolean(did);
}
$("signin").onclick = () => signIn();
function sessionError(error) {
  $("session-error").textContent =
    error.name === "NotAllowedError"
      ? "Passkey sign-in was cancelled or unavailable. You can retry or use a simulated user."
      : error.message;
  $("session-error").hidden = false;
}
async function enterLive(fresh = false) {
  const url = current?.url;
  showHome();
  $("session-error").hidden = true;
  for (const id of ["session-mode", "signin", "signout", "leave-live"])
    $(id).disabled = true;
  try {
    if (!(await chooseFixtureUser(hostIdentity?.did, true))) return false;
    const account = await signInLive({ fresh });
    for (const model of models.values()) model.suspend();
    models.clear();
    sessionMode = "live";
    hostIdentity = account.identity;
    clearTimeout(liveExpiryTimer);
    liveExpiryTimer = setTimeout(
      () => {
        void leaveLive().then(() =>
          sessionError(
            new Error(
              "Your live Tabs session expired. The simulator has returned to simulated mode.",
            ),
          ),
        );
      },
      Math.max(0, Date.parse(account.expiresAt) - Date.now()),
    );
    renderSession();
    if (url) await openProject(url);
    return true;
  } catch (error) {
    sessionError(error);
    return false;
  } finally {
    for (const id of ["session-mode", "signin", "signout", "leave-live"])
      $(id).disabled = false;
    renderSession();
  }
}
async function leaveLive(signOut = false) {
  showHome();
  try {
    await signOutLive();
  } catch (error) {
    sessionError(error);
  }
  changeUser(signOut ? null : workspaceSettings.profileDid);
}
$("session-mode").onchange = () => {
  if ($("session-mode").value === "live") void enterLive();
  else if (sessionMode === "live") void leaveLive();
};
$("leave-live").onclick = () => leaveLive();
$("signout").onclick = () =>
  sessionMode === "live" ? leaveLive(true) : changeUser(null);
$("clear-permissions").onclick = () => {
  if (sessionMode === "live") return;
  if (current) {
    cancelPrompt();
    simulator.clearPermissions();
    openProject(current.url);
  }
};
$("clear-log").onclick = () => $("activity").replaceChildren();
$("apply-manifest").onclick = () => {
  if (sessionMode === "live") return;
  try {
    if (!current) return;
    const manifest = JSON.parse($("manifest").value);
    manifest.entrypoint = current.url;
    const project = library.add({ url: current.url, manifest });
    openProject(project.url);
  } catch (error) {
    $("error").textContent = error.message;
  }
};
function configure(options) {
  Object.assign(settings, options);
  for (const model of models.values()) model.configure(settings);
}
$("offline").onchange = () => configure({ offline: $("offline").checked });
$("latency").onchange = () =>
  configure({ latency: Number($("latency").value) });
$("payment-result").onchange = () =>
  configure({ paymentResult: $("payment-result").value });
function renderAppearance() {
  const dark = workspaceSettings.appearance === "dark";
  $("phone").dataset.theme = workspaceSettings.appearance;
  $("appearance").textContent = dark ? "☀" : "☾";
  $("appearance").setAttribute("aria-pressed", String(dark));
  $("appearance").title = `Switch to ${dark ? "light" : "dark"} appearance`;
}
$("appearance").onclick = () => {
  rememberWorkspace({
    appearance: workspaceSettings.appearance === "dark" ? "light" : "dark",
  });
  renderAppearance();
};

for (const [index, device] of devices.entries()) {
  const option = document.createElement("option");
  option.value = index;
  option.textContent = device.name;
  $("device").append(option);
}
for (const [value, label] of [["custom", "Custom viewport"]]) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  $("device").append(option);
}
const selectedIndex = devices.findIndex(
  (d) => d.name === workspaceSettings.device,
);
$("device").value =
  selectedIndex >= 0 ? String(selectedIndex) : workspaceSettings.device;
viewport = { ...workspaceSettings.viewport };
dpr = devices[selectedIndex]?.dpr ?? null;
renderAppearance();
$("fit").checked = workspaceSettings.fit;
function rememberDisplay() {
  const mode = $("device").value;
  rememberWorkspace({
    device: devices[Number(mode)]?.name ?? mode,
    viewport,
    ...(mode === "custom" ? { custom: viewport } : {}),
  });
}
let previewScale = 1,
  screenshotCapturing = false;
$("screenshot").append(icon("camera"));
let screenshotScroll, screenshotControls;
setupScreenshots({
  button: $("screenshot"),
  phone: $("phone"),
  getDisplay: () => ({
    device: devices[Number($("device").value)] ?? null,
    viewport: { ...viewport },
    app: current?.manifest.name ?? "Tabs Apps",
  }),
  prepare() {
    screenshotScroll = {
      top: $("canvas").scrollTop,
      left: $("canvas").scrollLeft,
    };
    screenshotControls = [
      ...document.querySelectorAll(
        ".preview-toolbar input, .preview-toolbar select, .preview-toolbar button",
      ),
    ].map((control) => [control, control.disabled]);
    for (const [control] of screenshotControls) control.disabled = true;
    screenshotCapturing = true;
    document.body.classList.add("screenshot-capturing");
    resize();
    $("canvas").scrollTo(0, 0);
  },
  restore() {
    screenshotCapturing = false;
    document.body.classList.remove("screenshot-capturing");
    for (const [control, disabled] of screenshotControls)
      control.disabled = disabled;
    resize();
    $("canvas").scrollTo(screenshotScroll.left, screenshotScroll.top);
  },
  status: $("screenshot-status"),
  dialog: $("screenshot-dialog"),
  preview: $("screenshot-preview"),
  details: $("screenshot-details"),
  download: $("download-screenshot"),
  close: $("close-screenshot"),
});
function resize() {
  const isCustom = $("device").value === "custom";
  for (const id of ["resize-width", "resize-height", "resize-both"])
    $(id).hidden = !isCustom;
  $("width").disabled = $("height").disabled = !isCustom || screenshotCapturing;
  const canvas = $("canvas"),
    outerWidth = viewport.width + hostChrome.border * 2,
    outerHeight = viewport.height + chromeHeight + hostChrome.border * 2;
  const scale =
    $("fit").checked || screenshotCapturing
      ? Math.min(
          1,
          Math.max(0.1, (canvas.clientWidth - 56) / outerWidth),
          Math.max(0.1, (canvas.clientHeight - 56) / outerHeight),
        )
      : 1;
  previewScale = scale;
  $("phone").style.width = `${outerWidth}px`;
  $("phone").style.height = `${outerHeight}px`;
  $("phone").style.transform = `scale(${scale})`;
  $("device-holder").style.width = `${outerWidth * scale}px`;
  $("device-holder").style.height = `${outerHeight * scale}px`;
  const preset = devices[Number($("device").value)];
  $("fold-device").hidden = !preset?.foldFamily;
  $("fold-device").textContent = preset?.folded ? "Unfold" : "Fold";
  $("fold-device").title = preset?.folded ? "Unfold device" : "Fold device";
  $("display-note").textContent = preset
    ? `${preset.physicalWidth} × ${preset.physicalHeight} panel px · reference density ${dpr}. W/H show app CSS px after Tabs and system bars. Density and insets vary by device settings.`
    : "W/H show app CSS px, excluding Tabs and system bars. DPR, touch and OS stay those of your browser.";
  $("width").value = viewport.width;
  $("height").value = viewport.height;
  $("app-grid").style.gridTemplateColumns =
    `repeat(${Math.max(2, Math.min(6, Math.floor((viewport.width - 32) / 84)))}, minmax(0, 1fr))`;
}
$("device").onchange = () => {
  const mode = $("device").value;
  if (mode === "custom") {
    viewport = { ...workspaceSettings[mode] };
    dpr = null;
  } else {
    const device = devices[Number(mode)];
    viewport = deviceViewport(device);
    dpr = device.dpr;
  }
  rememberDisplay();
  resize();
};
$("fold-device").onclick = () => {
  const next = toggleFold(devices[Number($("device").value)], viewport);
  if (!next) return;
  $("device").value = String(devices.indexOf(next.device));
  viewport = next.viewport;
  dpr = next.device.dpr;
  rememberDisplay();
  resize();
};
function customSize() {
  if ($("device").value !== "custom") return;
  const width = Number($("width").value),
    height = Number($("height").value);
  if (
    ![width, height].every(
      (value) => Number.isInteger(value) && value >= 240 && value <= 2000,
    )
  ) {
    $("error").textContent =
      "Viewport dimensions must be integers between 240 and 2000.";
    return;
  }
  viewport = { width, height };
  dpr = null;
  $("error").textContent = "";
  rememberDisplay();
  resize();
}
$("width").onchange = customSize;
$("height").onchange = customSize;
$("rotate").onclick = () => {
  const device = devices[Number($("device").value)];
  if (device) {
    const rotated = deviceViewport(device, true);
    viewport = deviceViewport(
      device,
      viewport.width !== rotated.width || viewport.height !== rotated.height,
    );
  } else viewport = { width: viewport.height, height: viewport.width };
  rememberDisplay();
  resize();
};
$("fit").onchange = () => {
  rememberWorkspace({ fit: $("fit").checked });
  resize();
};
function setInspector(open, persist = true) {
  if (persist) rememberWorkspace({ inspectorOpen: open });
  $("inspector-resizer").hidden = !open;
  $("inspector").hidden = !open;
  $("workspace").classList.toggle("inspector-collapsed", !open);
  $("toggle-inspector").setAttribute("aria-expanded", String(open));
  $("toggle-inspector").setAttribute(
    "aria-label",
    open ? "Hide inspector" : "Show inspector",
  );
  $("toggle-inspector").title = open ? "Hide inspector" : "Show inspector";
}
$("toggle-inspector").onclick = () => setInspector($("inspector").hidden);
$("close-inspector").onclick = () => {
  setInspector(false);
  $("toggle-inspector").focus();
};
setInspector(workspaceSettings.inspectorOpen, false);
function inspectorWidth(width) {
  const next = Math.max(260, Math.min(560, Math.round(width)));
  $("workspace").style.setProperty("--inspector-width", `${next}px`);
  $("inspector-resizer").setAttribute("aria-valuenow", String(next));
  rememberWorkspace({ inspectorWidth: next });
}
inspectorWidth(workspaceSettings.inspectorWidth);
function dragControl(element, start, move) {
  let dragging;
  element.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = { x: event.clientX, y: event.clientY, ...start() };
    element.setPointerCapture(event.pointerId);
    $("workspace").classList.add("resizing");
  };
  element.onpointermove = (event) => {
    if (dragging)
      move(event.clientX - dragging.x, event.clientY - dragging.y, dragging);
  };
  element.onpointerup = element.onpointercancel = () => {
    dragging = null;
    $("workspace").classList.remove("resizing");
  };
  element.onlostpointercapture = () => {
    dragging = null;
    $("workspace").classList.remove("resizing");
  };
}
for (const [id, horizontal, vertical] of [
  ["resize-width", true, false],
  ["resize-height", false, true],
  ["resize-both", true, true],
]) {
  const handle = $(id);
  const update = (width, height) => {
    viewport = { width: clampDimension(width), height: clampDimension(height) };
    rememberDisplay();
    resize();
  };
  dragControl(
    handle,
    () => ({ ...viewport, scale: previewScale }),
    (x, y, initial) =>
      update(
        initial.width + (horizontal ? x / initial.scale : 0),
        initial.height + (vertical ? y / initial.scale : 0),
      ),
  );
  handle.onkeydown = (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    update(
      viewport.width +
        (horizontal
          ? ({ ArrowLeft: -step, ArrowRight: step }[event.key] ?? 0)
          : 0),
      viewport.height +
        (vertical ? ({ ArrowUp: -step, ArrowDown: step }[event.key] ?? 0) : 0),
    );
  };
}
dragControl(
  $("inspector-resizer"),
  () => ({ width: workspaceSettings.inspectorWidth }),
  (x, _y, initial) => inspectorWidth(initial.width - x),
);
$("inspector-resizer").onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 30 : 10;
  inspectorWidth(
    event.key === "Home"
      ? 260
      : event.key === "End"
        ? 560
        : workspaceSettings.inspectorWidth +
          (event.key === "ArrowLeft" ? step : -step),
  );
};
renderSession();
new ResizeObserver(resize).observe($("canvas"));
showHome();
resize();
if (!workspaceSettings.tutorialComplete)
  showWelcomeTour({
    user: hostIdentity,
    complete: () => rememberWorkspace({ tutorialComplete: true }),
  });

$("import-package").onchange = async () => {
  if (sessionMode === "live") return;
  const target = current?.url;
  try {
    if (!target) return;
    const files = [...$("import-package").files];
    if (!files.length) return;
    if (
      files.length > 128 ||
      files.reduce((sum, file) => sum + file.size, 0) > 1048576
    )
      throw Error("Import exceeds 128 files / 1 MB.");
    const values = await Promise.all(
      files.map(async (file) => JSON.parse(await file.text())),
    );
    const old = library.get(target);
    let manifest = old.manifest,
      lexicons;
    if (values.length === 1 && values[0].manifest) {
      const pkg = validateAppPackage(values[0]);
      manifest = { ...pkg.manifest, entrypoint: target };
      lexicons = pkg.lexicons;
    } else {
      const merged = new Map(old.lexicons.map((doc) => [doc.id, doc]));
      for (const doc of values) merged.set(doc.id, doc);
      lexicons = [...merged.values()];
      createRecordSchemas(lexicons);
    }
    if (current?.url !== target) return;
    library.add({ url: target, manifest, lexicons });
    await openProject(target);
    addLog({
      method: "schemas.import",
      status: "ok",
      detail: `${lexicons.length} Lexicons loaded.`,
    });
  } catch (error) {
    $("error").textContent = `Import failed: ${error.message}`;
  }
  $("import-package").value = "";
};
