let csrf = "";
export async function liveApi(path, body = {}, options = {}) {
  const response = await fetch(`/developer-api/live/${path}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-tabs-developer-host": "1",
      ...(csrf ? { "x-tabs-developer-csrf": csrf } : {}),
    },
    body: JSON.stringify(body),
    ...options,
  });
  const result = await response.json();
  if (!response.ok) {
    const code = result.error?.code ?? "UNAVAILABLE";
    const messages = {
      UNAUTHORIZED:
        "Your live Tabs session expired or sign-in was not completed. Choose Real Tabs account to sign in again.",
      FORBIDDEN:
        "Live mode requires this approved app’s exact registered URL and current permissions. Manifest overrides cannot grant real access.",
      PERMISSION_DENIED:
        "Allow this app’s access in App permissions to continue.",
      UNSUPPORTED_OPERATION:
        "This capability needs the native Tabs app and is unavailable in the browser host.",
      RATE_LIMITED: "Too many requests. Wait a minute before trying again.",
      INVALID_INPUT: "The app sent an invalid host request.",
      CONFLICT: "The app or record changed. Reopen the app before retrying.",
    };
    throw Object.assign(
      new Error(
        messages[code] ?? "The live host request could not be completed.",
      ),
      { code },
    );
  }
  if (result.csrf) csrf = result.csrf;
  return result;
}
const decode = (value) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const encode = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export async function signInLive({ fresh = false } = {}) {
  if (location.origin !== "https://developers.tabschat.com")
    throw new Error(
      "Real Tabs accounts are available in the hosted simulator at developers.tabschat.com.",
    );
  // Reuse only this dedicated browser session, never a native bearer credential.
  if (!fresh)
    try {
      return await liveApi("session");
    } catch (error) {
      if (error.code !== "UNAUTHORIZED") throw error;
    }
  if (!navigator.credentials?.get)
    throw new Error("This browser does not support passkey sign-in.");
  const { challengeId, options } = await liveApi("options");
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: decode(options.challenge),
      ...(options.allowCredentials
        ? {
            allowCredentials: options.allowCredentials.map((item) => ({
              ...item,
              id: decode(item.id),
            })),
          }
        : {}),
    },
  });
  if (!credential) throw new Error("Sign-in was cancelled.");
  const response = credential.response;
  return liveApi("verify", {
    challengeId,
    credential: {
      id: credential.id,
      rawId: encode(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        authenticatorData: encode(response.authenticatorData),
        clientDataJSON: encode(response.clientDataJSON),
        signature: encode(response.signature),
        userHandle: response.userHandle
          ? encode(response.userHandle)
          : undefined,
      },
    },
  });
}
export async function signOutLive() {
  try {
    await liveApi("logout");
  } catch (error) {
    if (error.code !== "UNAUTHORIZED") throw error;
  }
  csrf = "";
}
