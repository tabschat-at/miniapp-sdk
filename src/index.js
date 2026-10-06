/** Tabs injects window.host before page scripts. This module never installs a bridge. */
export function getHost(scope = globalThis) {
  const host = scope.host;
  if (!host || host.v !== 1) {
    throw Object.assign(new Error("Open this app inside Tabs."), {
      code: "HOST_UNAVAILABLE",
    });
  }
  return host;
}

/** Uses a normal HTML file input; call directly from a user's click handler. */
export function selectFiles(
  { accept = "", multiple = false } = {},
  scope = globalThis,
) {
  if (
    typeof accept !== "string" ||
    accept.length > 2048 ||
    typeof multiple !== "boolean"
  )
    throw new Error("Invalid file selection options");
  const input = scope.document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;
  input.hidden = true;
  scope.document.body.append(input);
  return new Promise((resolve) => {
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      input.remove();
      resolve(files);
    };
    const timer = setTimeout(() => finish([]), 300000);
    input.addEventListener(
      "change",
      () => finish(Array.from(input.files || [])),
      { once: true },
    );
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
}

/** The returned session belongs to the developer's server. Keep it in app memory. */
export async function signInWithTabs({
  backendOrigin,
  host = getHost(),
  paymentAccount = false,
}) {
  const origin = new URL(backendOrigin);
  if (origin.protocol !== "https:" || origin.origin !== backendOrigin)
    throw new Error("Configure an HTTPS backend origin");
  async function post(path, body) {
    const response = await fetch(`${backendOrigin}${path}`, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("App sign-in unavailable");
    return response.json();
  }
  const challenge = await post("/auth/challenge", {});
  if (
    !/^[A-Za-z0-9_-]{22,128}$/.test(challenge.nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge.loginId)
  )
    throw new Error("Invalid app sign-in challenge");
  const proof = await host.auth.getAssertion({
    audience: backendOrigin,
    nonce: challenge.nonce,
    ...(paymentAccount ? { paymentAccount: true } : {}),
  });
  return post("/auth/session", {
    loginId: challenge.loginId,
    token: proof.token,
  });
}

/** Fixed, user-facing descriptions; never display raw backend error bodies. */
export function describeError(error) {
  switch (error?.code) {
    case "HOST_UNAVAILABLE":
      return "Open this app inside Tabs.";
    case "PERMISSION_DENIED":
      return "Allow this app's access in Tabs App permissions to use this feature.";
    case "FORBIDDEN":
      return "This app cannot perform that action with the current permissions or record ownership.";
    case "UNAUTHORIZED":
      return "Reopen this app in Tabs to refresh your session.";
    case "BUSY":
      return "Finish the current Tabs action before starting another.";
    case "RATE_LIMITED":
      return "Pause before trying again. You may need to reopen this app.";
    case "INVALID_INPUT":
      return "Check the entered information and try again.";
    case "CONFLICT":
      return "This record changed or the operation is still being checked. Refresh first.";
    case "NOT_FOUND":
      return "That person or record could not be found.";
    case "TIMEOUT":
    case "PAYMENT_PENDING":
      return "The result is uncertain. Check Tabs before retrying a payment or publication.";
    default:
      return "The request could not be completed. Try again when connected.";
  }
}

/** Extract an ATProto record key from a returned URI without accepting another collection. */
export function recordKey(uri, collection) {
  const match =
    /^at:\/\/(did:plc:[a-z2-7]{24})\/([^/]+)\/([A-Za-z0-9._~:-]{1,512})$/.exec(
      uri,
    );
  if (!match || match[2] !== collection)
    throw new Error("Unexpected record URI");
  return match[3];
}
