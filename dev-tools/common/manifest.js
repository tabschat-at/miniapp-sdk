// Browser-safe validation shared by the CLI and developer tools.
export const capabilities = [
  "identity.basic",
  "identity.authenticate",
  "files.select",
  "blobs.upload",
  "social.public.read",
  "records.read",
  "records.write",
  "payments.request",
  "wallet.connect",
  "wallet.transactions",
  "wallet.messages",
  "chat.openConversation",
];
const fields = [
  "v",
  "id",
  "version",
  "name",
  "entrypoint",
  "permissions",
  "collections",
  "readCollections",
  "recordPurpose",
  "allowedPaymentAssets",
  "minimumHostVersion",
  "networkAccess",
];
const semver = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
export function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}
export function validateManifest(
  manifest,
  documents = [],
  { requireLexicons = true } = {},
) {
  requireCheck(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "Expected a manifest object",
  );
  requireCheck(
    Object.keys(manifest).sort().join() === [...fields].sort().join(),
    "Manifest must contain exactly the documented V1 fields",
  );
  requireCheck(manifest.v === 1, "Unsupported manifest version");
  requireCheck(
    typeof manifest.id === "string" &&
      /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,7}$/.test(manifest.id) &&
      manifest.id.length <= 80,
    "Invalid reversed-domain app ID",
  );
  requireCheck(
    typeof manifest.version === "string" &&
      semver.test(manifest.version) &&
      typeof manifest.minimumHostVersion === "string" &&
      semver.test(manifest.minimumHostVersion),
    "Use numeric major.minor.patch versions",
  );
  requireCheck(
    typeof manifest.name === "string" &&
      manifest.name.trim() &&
      manifest.name.length <= 60,
    "Name must have 1–60 characters",
  );
  requireCheck(
    typeof manifest.entrypoint === "string" &&
      manifest.entrypoint.length <= 2048,
    "Invalid entrypoint",
  );
  const url = new URL(manifest.entrypoint);
  requireCheck(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "Entrypoint must be HTTPS without credentials, query or fragment",
  );
  for (const key of [
    "permissions",
    "collections",
    "readCollections",
    "allowedPaymentAssets",
    "networkAccess",
  ])
    requireCheck(
      Array.isArray(manifest[key]) &&
        manifest[key].length <= 16 &&
        manifest[key].every((item) => typeof item === "string") &&
        new Set(manifest[key]).size === manifest[key].length,
      `Invalid ${key} list`,
    );
  requireCheck(
    manifest.permissions.every((item) => capabilities.includes(item)),
    "Unknown permission",
  );
  const floor = manifest.minimumHostVersion.split(".").map(Number);
  requireCheck(
    !manifest.permissions.some((p) =>
      ["identity.authenticate", "files.select"].includes(p),
    ) ||
      floor[0] > 0 ||
      floor[1] > 0 ||
      floor[2] >= 51,
    "Authentication and files require host 0.0.51",
  );
  requireCheck(
    !manifest.permissions.includes("blobs.upload") ||
      (manifest.permissions.includes("records.write") &&
        (floor[0] > 0 || floor[1] > 0 || floor[2] >= 52)),
    "Blob upload requires records.write and host 0.0.52",
  );
  requireCheck(
    !manifest.permissions.some((p) => p.startsWith("wallet.")) ||
      (manifest.permissions.includes("wallet.connect") &&
        (floor[0] > 0 || floor[1] > 0 || floor[2] >= 74)),
    "Sui wallet capabilities require wallet.connect and host 0.0.74",
  );
  requireCheck(
    manifest.collections.length > 0 ===
      manifest.permissions.includes("records.write"),
    "records.write requires exact write collections, and vice versa",
  );
  requireCheck(
    manifest.readCollections.length > 0 ===
      manifest.permissions.includes("records.read"),
    "records.read requires exact read collections, and vice versa",
  );
  requireCheck(
    manifest.allowedPaymentAssets.every((item) => item === "USDC"),
    "Only USDC is currently supported",
  );
  requireCheck(
    typeof manifest.recordPurpose === "string" &&
      manifest.recordPurpose.length <= 200 &&
      !/[\x00-\x1f\x7f]/.test(manifest.recordPurpose),
    "Invalid recordPurpose",
  );
  for (const origin of manifest.networkAccess) {
    const u = new URL(origin);
    requireCheck(
      u.protocol === "https:" &&
        u.origin === origin &&
        !u.username &&
        !u.password &&
        /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) &&
        !["api.tabschat.com", "auth.tabschat.com", "pds.tabschat.com"].includes(
          u.hostname,
        ),
      "Network access must list exact permitted HTTPS origins",
    );
  }
  const ids = new Set();
  for (const doc of documents) {
    requireCheck(
      doc.lexicon === 1 &&
        typeof doc.id === "string" &&
        doc.defs &&
        !ids.has(doc.id),
      "Invalid or duplicate Lexicon document",
    );
    ids.add(doc.id);
  }
  for (const id of [...manifest.collections, ...manifest.readCollections]) {
    requireCheck(
      /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(id) &&
        !id.startsWith("com.atproto.") &&
        id !== "app.bsky.actor.profile" &&
        !/^com\.tabschat\.(account|auth|identity|recovery|wallet|chat)(\.|$)/.test(
          id,
        ),
      "Invalid or protected collection",
    );
    requireCheck(
      !requireLexicons ||
        documents.some(
          (doc) => doc.id === id && doc.defs.main?.type === "record",
        ),
      `Include a record Lexicon for ${id} in this standalone package`,
    );
  }
  return manifest;
}
