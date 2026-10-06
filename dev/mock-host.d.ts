import type { ManifestV1, HostBridgeV1 } from "../src/index.js";

/** Local fixtures only; never use this module in a deployed mini-app. */
export function createMockHost(
  manifest: ManifestV1,
  options?: { denied?: boolean },
): HostBridgeV1;
export function installMockHost(
  manifest: ManifestV1,
  options?: { denied?: boolean },
  scope?: { host?: HostBridgeV1 },
): void;
