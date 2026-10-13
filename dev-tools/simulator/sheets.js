import { addProjectFields } from "./add-project.js";
import { permissionRows } from "./native-ui.js";
import { slide, stopMotion } from "./motion.js";

const $ = (id) => document.getElementById(id);
let finishPrompt;
export function cancelPrompt() {
  finishPrompt?.("cancel", true);
}

export function showPrompt(kind, detail = {}) {
  if (finishPrompt)
    return Promise.reject(
      Object.assign(new Error("Finish the open host sheet first."), {
        code: "BUSY",
      }),
    );
  const overlay = $("sheet-overlay"),
    sheet = overlay.querySelector(".sheet"),
    fields = $("sheet-fields"),
    actions = $("sheet-actions"),
    title = $("sheet-title"),
    description = $("sheet-description");
  const previousFocus = document.activeElement;
  const blocked = [$("launcher"), $("miniapp-header"), $("app-frame")].map(
    (element) => ({ element, inert: element.inert }),
  );
  fields.replaceChildren();
  actions.replaceChildren();
  $("sheet-error").textContent = "";
  sheet.dataset.kind = kind;
  description.hidden = false;
  let selector, message, collect, cleanup;
  let dismissed = false;
  function input(label, type = "text", value = "") {
    const wrapper = document.createElement("label"),
      element = document.createElement(
        type === "textarea" ? "textarea" : "input",
      );
    wrapper.textContent = label;
    element.setAttribute("aria-label", label);
    element.value = value;
    if (type !== "textarea") element.type = type;
    wrapper.append(element);
    fields.append(wrapper);
    return element;
  }
  function contacts(people, label) {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    selector = document.createElement("select");
    selector.setAttribute("aria-label", label);
    for (const person of people) {
      const option = document.createElement("option");
      option.value = person.did;
      option.textContent = `${person.displayName} · @${person.handle}`;
      selector.append(option);
    }
    wrapper.append(selector);
    fields.append(wrapper);
  }
  const titles = {
    permission: `${detail.app} would like access`,
    permissions: `${detail.manifest?.name} would like access`,
    managePermissions: `${detail.manifest?.name} permissions`,
    conversation: "Open conversation",
    payment: `${detail.appName} requests a payment`,
    share: "Share with a contact",
    message: "Message a contact",
    addProject: "Add a development app",
    removeProject: `Remove ${detail.manifest?.name}?`,
  };
  title.textContent = titles[kind];
  const descriptions = {
    conversation: `Open your simulated conversation with ${detail.person?.displayName}?`,
    payment: `@${detail.person?.handle}`,
    share: "Choose a contact to preview sharing this link.",
    message: "Choose a contact and compose a preview message.",
    addProject: "Add your app’s URL to this simulator’s Apps screen.",
    removeProject:
      "This removes the app from your Apps page and resets its permissions.",
  };
  description.textContent = descriptions[kind] ?? "";
  if (["permissions", "permission", "managePermissions"].includes(kind)) {
    const manifest = detail.manifest;
    if (detail.live) {
      const notice = document.createElement("p");
      notice.className = "native-live-notice";
      notice.textContent =
        "LIVE ACCOUNT · These permissions affect your real Tabs account. Record operations publish or delete real data. Changes to app access also apply in Tabs.";
      fields.append(notice);
    }
    if (kind === "managePermissions") description.hidden = true;
    else {
      try {
        description.textContent = new URL(
          manifest?.entrypoint ?? detail.entrypoint,
        ).host;
      } catch {
        description.textContent = "Development app";
      }
    }
    fields.append(
      permissionRows(
        manifest?.permissions ?? [detail.capability],
        kind === "managePermissions" ? detail.grants : undefined,
      ),
    );
    if (kind !== "managePermissions" && manifest?.recordPurpose) {
      const purpose = document.createElement("p");
      purpose.className = "native-purpose";
      purpose.textContent = `App’s explanation: ${manifest.recordPurpose}`;
      fields.append(purpose);
    }
  }
  if (["share", "message"].includes(kind)) contacts(detail.profiles, "Contact");
  if (kind === "share") {
    const preview = document.createElement("pre");
    preview.textContent = `${detail.title ?? "Shared link"}\n${detail.url}`;
    fields.append(preview);
  }
  if (kind === "message") {
    message = input("Message", "textarea", detail.text);
    message.rows = 3;
    message.maxLength = 4096;
  }
  if (kind === "payment") {
    const amount = document.createElement("p");
    amount.className = "native-payment-amount";
    amount.textContent = `${detail.amount} ${detail.asset}`;
    fields.append(amount);
    if (detail.memo) {
      const memo = document.createElement("p");
      memo.textContent = detail.memo;
      fields.append(memo);
    }
  }
  if (kind === "addProject") {
    const editor = addProjectFields({
      input,
      fields,
      initialUrl: detail.url ?? "",
      isDismissed: () => dismissed,
    });
    collect = editor.collect;
    cleanup = editor.cleanup;
  }
  overlay.hidden = false;
  void slide(sheet, true);
  $("launcher").inert = true;
  $("miniapp-header").inert = true;
  $("app-frame").inert = true;
  return new Promise((resolve) => {
    function finish(value, immediate = false) {
      if (finishPrompt !== finish) return;
      if (dismissed) {
        if (immediate) complete();
        return;
      }
      dismissed = true;
      cleanup?.();
      sheet.removeEventListener("keydown", keyboard);
      function complete() {
        if (finishPrompt !== finish) return;
        finishPrompt = null;
        stopMotion(sheet);
        overlay.hidden = true;
        for (const { element, inert } of blocked) element.inert = inert;
        if (previousFocus?.isConnected)
          previousFocus.focus({ preventScroll: true });
        resolve(value);
      }
      if (immediate) complete();
      else void slide(sheet, false).then(complete);
    }
    finishPrompt = finish;
    overlay.onclick = (event) => {
      if (event.target === overlay) finish("cancel");
    };
    function action(label, value, primary = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.className = primary ? "primary" : "native-text-button";
      button.onclick = async () => {
        try {
          button.disabled = true;
          const answer = typeof value === "function" ? await value() : value;
          if (dismissed) return;
          finish(answer);
        } catch (error) {
          if (!dismissed) $("sheet-error").textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
      actions.append(button);
    }
    if (["permission", "permissions"].includes(kind)) {
      action("Allow and open", "allow", true);
      action("Not now", "deny");
    } else if (kind === "managePermissions") {
      const granted = Object.values(detail.grants).includes("allow");
      action(
        granted ? "Revoke app access" : "Allow requested access",
        granted ? "revoke" : "allow",
        true,
      );
      action("Done", "cancel");
    } else if (kind === "addProject") {
      action("Add app", collect, true);
      action("Cancel", "cancel");
    } else if (kind === "removeProject") {
      action("Remove", "remove", true);
      action("Cancel", "cancel");
    } else {
      if (kind === "payment") action("Cancel", "cancel");
      action(
        kind === "payment"
          ? "Send payment"
          : kind === "share"
            ? "Share"
            : kind === "message"
              ? "Send message"
              : "Open conversation",
        () => (selector ? selector.value : "confirm"),
        true,
      );
      if (kind !== "payment") action("Cancel", "cancel");
    }
    function keyboard(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish("cancel");
      }
      if (event.key === "Tab") {
        const focusable = [
            ...sheet.querySelectorAll("button, select, textarea, input"),
          ].filter((element) => !element.disabled),
          first = focusable[0],
          last = focusable.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === sheet)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    sheet.addEventListener("keydown", keyboard);
    // The panel starts below the screen. Default focus would scroll the clipped
    // phone to reveal it, moving the launcher and mini-app behind the sheet.
    sheet.focus({ preventScroll: true });
  });
}
