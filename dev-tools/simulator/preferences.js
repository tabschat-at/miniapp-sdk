import { devices, deviceViewport } from "./devices.js";
import { profiles } from "./host.js";

export const preferencesKey = "tabs-sdk-simulator-workspace-v1";
export const clampDimension = (value) =>
  Math.min(2000, Math.max(240, Math.round(value)));
const size = (value, fallback) =>
  value &&
  [value.width, value.height].every(
    (n) => Number.isInteger(n) && n >= 240 && n <= 2000,
  )
    ? { width: value.width, height: value.height }
    : { ...fallback };
export function createWorkspacePreferences({
  storage,
  defaultInspectorOpen = false,
} = {}) {
  const first = devices[0];
  const defaults = {
    device: first.name,
    viewport: { width: first.width, height: first.height },
    custom: { width: 390, height: 844 },
    appearance: "light",
    inspectorOpen: defaultInspectorOpen,
    inspectorWidth: 320,
    fit: true,
    profileDid: profiles[0].did,
    tutorialComplete: false,
  };
  function normalize(value = {}) {
    const device = devices.find((d) => d.name === value.device);
    const selected =
      device?.name ??
      (["custom", "responsive"].includes(value.device)
        ? "custom"
        : defaults.device);
    // Keep the active dimensions when merging the former Responsive mode.
    const custom = size(
      value.device === "responsive" ? value.responsive : value.custom,
      defaults.custom,
    );
    let viewport = size(value.viewport, defaults.viewport);
    if (device) {
      const landscape = deviceViewport(device, true);
      const rotated =
        (viewport.width === landscape.width &&
          viewport.height === landscape.height) ||
        (viewport.width > device.screenWidth &&
          viewport.height === device.screenWidth);
      viewport = deviceViewport(device, rotated);
    } else viewport = selected === "custom" ? custom : defaults.viewport;
    return {
      device: selected,
      viewport,
      custom,
      appearance: ["light", "dark"].includes(value.appearance)
        ? value.appearance
        : defaults.appearance,
      inspectorOpen:
        typeof value.inspectorOpen === "boolean"
          ? value.inspectorOpen
          : defaults.inspectorOpen,
      inspectorWidth:
        Number.isInteger(value.inspectorWidth) &&
        value.inspectorWidth >= 260 &&
        value.inspectorWidth <= 560
          ? value.inspectorWidth
          : defaults.inspectorWidth,
      fit: typeof value.fit === "boolean" ? value.fit : defaults.fit,
      tutorialComplete: value.tutorialComplete === true,
      profileDid:
        value.profileDid === null ||
        profiles.some((p) => p.did === value.profileDid)
          ? value.profileDid
          : defaults.profileDid,
    };
  }
  let state = normalize();
  try {
    const saved = JSON.parse(storage?.getItem(preferencesKey) ?? "null");
    if (saved?.v === 1) state = normalize(saved);
  } catch {
    /* Invalid/unavailable storage uses defaults. */
  }
  return {
    get: () => structuredClone(state),
    set(patch) {
      state = normalize({ ...state, ...patch });
      try {
        storage?.setItem(preferencesKey, JSON.stringify({ v: 1, ...state }));
      } catch {
        /* Keep working in memory. */
      }
      return structuredClone(state);
    },
  };
}
