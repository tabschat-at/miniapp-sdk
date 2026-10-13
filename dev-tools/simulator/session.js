import { profiles } from "./host.js";

export function chooseFixtureUser(currentDid, live = false) {
  const dialog = document.getElementById("session-dialog"),
    select = document.getElementById("session-user");
  if (dialog.open) return Promise.resolve(null);
  select.replaceChildren();
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.did;
    option.textContent = `${profile.displayName} · @${profile.handle}`;
    select.append(option);
  }
  select.value = currentDid ?? profiles[0].did;
  document.getElementById("session-user-fields").hidden = live;
  document.getElementById("session-title").textContent = live
    ? "Use a real Tabs account"
    : "Choose a simulated Tabs user";
  document.getElementById("session-description").textContent = live
    ? "Sign in with your Tabs passkey. Approved apps can access your real profile, sign you into their live backend, and publish or delete real records after you accept permissions. Payments, wallet signing and native chat are unavailable here."
    : "Choose the simulated Tabs user entering your apps. This fixture identity is shared across mini-apps; it cannot sign into a production backend. Switching users clears fixture consent and records.";
  document.getElementById("session-confirm").textContent = live
    ? "Continue with Tabs passkey"
    : "Use this user";
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () =>
        resolve(
          dialog.returnValue === "confirm"
            ? live
              ? "live"
              : select.value
            : null,
        ),
      { once: true },
    );
    dialog.showModal();
  });
}
