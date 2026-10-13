import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkspacePreferences,
  preferencesKey,
} from "../dev-tools/simulator/preferences.js";
import {
  createSimulator,
  profiles,
  demoManifest,
} from "../dev-tools/simulator/host.js";
import { devices, deviceViewport } from "../dev-tools/simulator/devices.js";

test("fresh workspaces start with a user, a closed inspector and a one-time tour", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
  };
  const preferences = createWorkspacePreferences({ storage });
  assert.equal(preferences.get().inspectorOpen, false);
  assert.equal(preferences.get().profileDid, profiles[0].did);
  assert.equal(preferences.get().tutorialComplete, false);
  preferences.set({ tutorialComplete: true, inspectorOpen: true });
  const reloaded = createWorkspacePreferences({ storage });
  assert.equal(reloaded.get().tutorialComplete, true);
  assert.equal(reloaded.get().inspectorOpen, true);
  // Users upgrading from the earlier simulator keep their inspector preference
  // and see the new introduction once.
  const upgraded = createWorkspacePreferences({
    storage: { getItem: () => JSON.stringify({ v: 1, inspectorOpen: true }) },
  });
  assert.equal(upgraded.get().inspectorOpen, true);
  assert.equal(upgraded.get().tutorialComplete, false);
});

test("workspace reload restores modes, orientation, independent dimensions and host user", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
  };
  const settings = createWorkspacePreferences({ storage });
  settings.set({ device: "custom", custom: { width: 530, height: 780 } });
  settings.set({
    device: devices[1].name,
    viewport: deviceViewport(devices[1], true),
    appearance: "dark",
    inspectorOpen: false,
    inspectorWidth: 440,
    fit: false,
    profileDid: profiles[1].did,
  });
  const reloaded = createWorkspacePreferences({
    storage,
    defaultInspectorOpen: true,
  });
  assert.deepEqual(reloaded.get(), settings.get());
  assert.deepEqual(reloaded.get().viewport, deviceViewport(devices[1], true));
  assert.deepEqual(reloaded.set({ device: "custom" }).viewport, {
    width: 530,
    height: 780,
  });
  reloaded.set({ profileDid: null });
  assert.equal(createWorkspacePreferences({ storage }).get().profileDid, null);
  assert.equal(JSON.parse(saved.get(preferencesKey)).v, 1);
});

test("legacy responsive selection migrates to the unified custom viewport", () => {
  for (const device of ["responsive", "custom"]) {
    const saved = {
      v: 1,
      device,
      custom: { width: 530, height: 780 },
      responsive: { width: 990, height: 470 },
      appearance: "dark",
      inspectorOpen: false,
    };
    const preferences = createWorkspacePreferences({
      storage: { getItem: () => JSON.stringify(saved) },
    });
    const expected = device === "responsive" ? saved.responsive : saved.custom;
    assert.equal(preferences.get().device, "custom");
    assert.deepEqual(preferences.get().viewport, expected);
    assert.deepEqual(preferences.get().custom, expected);
    assert.equal(preferences.get().appearance, "dark");
    assert.equal(preferences.get().inspectorOpen, false);
    preferences.set({ device: devices[0].name });
    assert.deepEqual(preferences.set({ device: "custom" }).viewport, expected);
    assert.equal("responsive" in preferences.get(), false);
  }
});

test("old full-screen presets retain orientation with the corrected app height", () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        v: 1,
        device: "Pixel 9",
        viewport: { width: 915, height: 412 },
      }),
  };
  assert.deepEqual(
    createWorkspacePreferences({ storage }).get().viewport,
    deviceViewport(devices[0], true),
  );
});

test("workspace rejects corrupt and invalid preferences and tolerates blocked storage", () => {
  const defaults = createWorkspacePreferences({
    defaultInspectorOpen: false,
  }).get();
  for (const raw of [
    "broken JSON",
    "null",
    JSON.stringify({ v: 9, appearance: "dark" }),
    JSON.stringify({
      v: 1,
      device: "missing",
      appearance: "neon",
      viewport: { width: 1, height: 9000 },
      custom: { width: 500.5, height: 600 },
      responsive: { width: 250, height: 9999 },
      inspectorWidth: 1,
      inspectorOpen: "no",
      fit: 2,
      profileDid: "unknown",
    }),
  ]) {
    assert.deepEqual(
      createWorkspacePreferences({
        storage: { getItem: () => raw },
        defaultInspectorOpen: false,
      }).get(),
      defaults,
    );
  }
  const blocked = createWorkspacePreferences({
    storage: {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    },
  });
  blocked.set({ appearance: "dark", inspectorOpen: false });
  assert.equal(blocked.get().appearance, "dark");
  const snapshot = blocked.get();
  snapshot.custom.width = 999;
  assert.equal(blocked.get().custom.width, 390);
});

test("accepted mini-apps receive the shared host identity without an app login", async () => {
  const prompts = [];
  const make = () =>
    createSimulator({
      identity: profiles[1],
      prompt: async (kind) => {
        prompts.push(kind);
        return "allow";
      },
    });
  const first = make(),
    second = make();
  await first.open();
  await second.open();
  assert.equal((await first.call("identity.getSelf")).did, profiles[1].did);
  assert.equal((await second.call("identity.getSelf")).did, profiles[1].did);
  first.reset();
  await first.open();
  assert.equal((await first.call("identity.getSelf")).did, profiles[1].did);
  assert.deepEqual(prompts, ["permissions", "permissions", "permissions"]);
  first.signOut();
  await assert.rejects(first.open(), { code: "UNAUTHORIZED" });
  await assert.rejects(first.call("identity.getSelf"), {
    code: "UNAUTHORIZED",
  });
  assert.equal(prompts.length, 3);
});

test("changing the host user clears records and consent and invalidates pending prompts", async () => {
  let answer;
  const model = createSimulator({
    prompt: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const opening = model.open();
  model.setIdentity(profiles[1]);
  answer("allow");
  await assert.rejects(opening, { code: "UNAUTHORIZED" });
  model.configure({ permissionMode: "allow" });
  await model.open();
  await model.call("records.create", {
    collection: demoManifest.collections[0],
    value: { $type: demoManifest.collections[0], text: "Bob's note" },
  });
  model.setIdentity(profiles[2]);
  assert.deepEqual(model.state().records, []);
  assert.deepEqual(model.state().permissions, {});
  assert.equal(model.state().reviewed, false);
  await model.open();
  assert.equal((await model.call("identity.getSelf")).did, profiles[2].did);
});
