import { capabilities, validateManifest } from "../common/manifest.js";

export const features = [
  [
    "identity.basic",
    "Profile",
    "Read the signed-in user’s public name, handle and avatar.",
  ],
  [
    "identity.authenticate",
    "Server sign-in",
    "Request an authentication assertion for your backend. Host 0.0.51+.",
  ],
  [
    "files.select",
    "File picker",
    "Let the user choose files or capture a photo. Host 0.0.51+.",
  ],
  [
    "blobs.upload",
    "Upload attachments",
    "Publish blobs for app records. Also enables record writing; host 0.0.52+.",
  ],
  [
    "social.public.read",
    "Public social data",
    "Read public profiles, relationships and feeds.",
  ],
  [
    "records.read",
    "Read app records",
    "Read only the exact record collections you list below.",
  ],
  [
    "records.write",
    "Write app records",
    "Create, update and delete the user’s records in the collections you list.",
  ],
  [
    "payments.request",
    "Request a payment",
    "Ask the host to review a USDC payment. The user confirms each payment.",
  ],
  [
    "chat.openConversation",
    "Open a conversation",
    "Open Tabs chat with a contact; this does not send a message.",
  ],
  [
    "wallet.connect",
    "Connect a Sui wallet",
    "Share a public Sui address. Requires advanced mode and host 0.0.74+. Test wallet operations on a real device.",
  ],
  [
    "wallet.transactions",
    "Review Sui transactions",
    "Request a transaction review and passkey approval. Also enables wallet connection.",
  ],
  [
    "wallet.messages",
    "Sign wallet messages",
    "Request readable message review and passkey approval. Also enables wallet connection.",
  ],
];
const list = (value = "") => [
  ...new Set(value.split(/[\s,]+/).filter(Boolean)),
];
export function buildManifest(values) {
  const permissions = capabilities.filter((capability) =>
    values.permissions.includes(capability),
  );
  if (
    permissions.includes("blobs.upload") &&
    !permissions.includes("records.write")
  )
    permissions.push("records.write");
  if (
    permissions.some((p) => p.startsWith("wallet.")) &&
    !permissions.includes("wallet.connect")
  )
    permissions.push("wallet.connect");
  const minimum = permissions.some((p) => p.startsWith("wallet."))
    ? "0.0.74"
    : permissions.includes("blobs.upload")
      ? "0.0.52"
      : permissions.some((p) =>
            ["identity.authenticate", "files.select"].includes(p),
          )
        ? "0.0.51"
        : "0.0.50";
  return {
    v: 1,
    id: values.id.trim(),
    version: values.version.trim(),
    name: values.name.trim(),
    entrypoint: values.entrypoint.trim(),
    permissions,
    collections: permissions.includes("records.write")
      ? list(values.collections)
      : [],
    readCollections: permissions.includes("records.read")
      ? list(values.readCollections)
      : [],
    recordPurpose: values.recordPurpose.trim(),
    allowedPaymentAssets: permissions.includes("payments.request")
      ? ["USDC"]
      : [],
    minimumHostVersion: values.minimumHostVersion?.trim() || minimum,
    networkAccess: list(values.networkAccess),
  };
}
export function starterLexicons(manifest) {
  return [
    ...new Set([...manifest.collections, ...manifest.readCollections]),
  ].map((id) => ({
    lexicon: 1,
    id,
    defs: {
      main: {
        type: "record",
        key: "tid",
        record: {
          type: "object",
          required: ["text", "createdAt"],
          properties: {
            text: { type: "string", maxLength: 3000 },
            createdAt: { type: "string", format: "datetime" },
          },
        },
      },
    },
  }));
}
import { createRecordSchemas } from "../common/records.js";

export function validateGenerated(
  manifest,
  documents = starterLexicons(manifest),
) {
  validateManifest(manifest, [], { requireLexicons: false });
  validateManifest(manifest, documents);
  createRecordSchemas(documents);
  return documents;
}
export function discoverySnippet(iconUrl = "") {
  const escape = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  let snippet =
    '<link rel="tabs-manifest" href="./manifest.json" />\n<link rel="tabs-package" href="./app-package.json" />';
  if (iconUrl.trim()) {
    const url = new URL(iconUrl.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Icon URL must use HTTP or HTTPS without credentials.");
    snippet += `\n<link rel="icon" href="${escape(url.href)}" />`;
  }
  return snippet;
}
