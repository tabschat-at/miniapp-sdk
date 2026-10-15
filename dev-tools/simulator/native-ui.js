// Browser equivalents of MiniAppPermissionRows, MiniAppPermissionSheet,
// SettingsGroup and AppPrimaryButton in apps/mobile/lib. Keep labels and tokens
// aligned with miniapp_permission_sheet.dart and core/app_appearance.dart.
export const permissionLabels = {
  "identity.basic": "Use your public Tabs profile",
  "identity.authenticate": "Sign in to this app using your Tabs identity",
  "files.select": "Use files you choose to share with this app",
  "blobs.upload": "Upload media to your public ATProto repository",
  "social.public.read": "Find public profiles",
  "payments.request": "Ask you to review payments in Tabs",
  "wallet.connect": "Connect your Sui address and public wallet activity",
  "wallet.transactions": "Ask you to review Sui transactions and network fees",
  "wallet.messages": "Ask you to sign messages with your Sui wallet",
  "chat.openConversation": "Open conversations in Tabs",
  "records.read": "Read public data from apps",
  "records.write":
    "Publish and manage this app’s public data under your profile",
};
const paths = {
  camera:
    '<path d="M8 5 9.5 3h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/>',
  profile:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  login: '<path d="M14 3h6v18h-6M3 12h12m-4-4 4 4-4 4"/>',
  file: '<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-8 14 10-10"/>',
  upload:
    '<path d="M6 17a5 5 0 1 1 1-10 6 6 0 0 1 11 2 4 4 0 0 1 0 8M12 12v10m-4-6 4-4 4 4"/>',
  search:
    '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 10-6"/><circle cx="17" cy="16" r="4"/><path d="m20 19 3 3"/>',
  payment:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9v6m14-6v6"/>',
  wallet:
    '<path d="M20 6H4V3h14v3M4 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16V6zm16 5h-6v6h6"/>',
  link: '<path d="m10 8 3-3a5 5 0 0 1 7 7l-3 3M14 16l-3 3a5 5 0 0 1-7-7l3-3m1 7 8-8"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-4-4zM14 6l4 4"/>',
  chat: '<path d="M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',
  article:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
};
const permissionIcons = {
  "identity.basic": "profile",
  "identity.authenticate": "login",
  "files.select": "file",
  "blobs.upload": "upload",
  "social.public.read": "search",
  "payments.request": "payment",
  "wallet.connect": "link",
  "wallet.transactions": "wallet",
  "wallet.messages": "edit",
  "chat.openConversation": "chat",
  "records.read": "article",
  "records.write": "edit",
};
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  svg.innerHTML = paths[name] ?? paths.article;
  return svg;
}
export function permissionRows(capabilities, grants) {
  const group = document.createElement("div");
  group.className = "native-settings-group";
  for (const capability of capabilities) {
    const row = document.createElement("div"),
      badge = document.createElement("span"),
      label = document.createElement("span");
    row.className = "native-settings-row";
    badge.className = "native-row-icon";
    badge.append(icon(permissionIcons[capability]));
    label.textContent =
      permissionLabels[capability] ?? "Manage its public app records";
    row.append(badge, label);
    if (grants) {
      const status = document.createElement("span");
      const allowed = grants[capability] === "allow";
      status.className = `native-grant ${allowed ? "granted" : "blocked"}`;
      status.setAttribute("aria-label", allowed ? "Allowed" : "Not allowed");
      status.append(icon(allowed ? "check" : "block"));
      row.append(status);
    }
    group.append(row);
  }
  if (!capabilities.length) {
    const empty = document.createElement("p");
    empty.className = "native-empty-permissions";
    empty.textContent = "This app does not request additional access.";
    group.append(empty);
  }
  return group;
}
