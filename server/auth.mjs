import { createPublicKey, verify } from "node:crypto";

/** Server-only. Pin issuer/audience/appId in configuration, not token claims. */
export function verifyTabsAssertion(
  token,
  { issuer, audience, appId, nonce, jwks, now = Math.floor(Date.now() / 1000) },
) {
  const invalid = () => {
    throw new Error("Invalid Tabs sign-in assertion");
  };
  if (
    typeof issuer !== "string" ||
    !issuer.startsWith("https://") ||
    new URL(issuer).origin !== issuer ||
    typeof audience !== "string" ||
    !audience.startsWith("https://") ||
    new URL(audience).origin !== audience ||
    typeof appId !== "string" ||
    !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,7}$/.test(appId) ||
    typeof nonce !== "string" ||
    !/^[A-Za-z0-9_-]{22,128}$/.test(nonce) ||
    !Number.isInteger(now)
  )
    invalid();
  if (
    typeof token !== "string" ||
    token.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    invalid();
  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url"));
    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url"));
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "tabs-miniapp+jwt" ||
      typeof header.kid !== "string" ||
      Object.keys(header).sort().join() !== "alg,kid,typ"
    )
      invalid();
    const key = jwks?.keys?.find(
      (k) =>
        k.kid === header.kid &&
        k.kty === "OKP" &&
        k.crv === "Ed25519" &&
        k.alg === "EdDSA" &&
        k.use === "sig" &&
        !k.d,
    );
    if (
      !key ||
      !verify(
        null,
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(signature, "base64url"),
      )
    )
      invalid();
    if (
      claims.iss !== issuer ||
      claims.aud !== audience ||
      claims.app_id !== appId ||
      claims.nonce !== nonce ||
      !/^[A-Za-z0-9_-]{22,128}$/.test(nonce) ||
      !/^did:plc:[a-z2-7]{24}$/.test(claims.sub) ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      claims.iat > now + 5 ||
      claims.iat < now - 65 ||
      claims.exp <= now ||
      claims.exp - claims.iat !== 60 ||
      typeof claims.jti !== "string" ||
      !/^[a-f0-9-]{36}$/.test(claims.jti)
    )
      invalid();
    if (
      claims.payment_account !== undefined &&
      (claims.payment_account?.network !== "mainnet" ||
        !/^[0-9a-f]{64}$/.test(
          claims.payment_account?.senderCommitment ?? "",
        ) ||
        Object.keys(claims.payment_account).sort().join() !==
          "network,senderCommitment")
    )
      invalid();
    return Object.freeze(claims);
  } catch {
    invalid();
  }
}

/** Fetch from the configured issuer only; never follow token-provided URLs. */
export async function fetchTabsKeys(issuer) {
  const url = new URL(issuer);
  if (url.protocol !== "https:" || url.origin !== issuer)
    throw new Error("Configure an HTTPS Tabs issuer origin");
  const response = await fetch(`${issuer}/.well-known/miniapp-jwks.json`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Tabs signing keys unavailable");
  const text = await response.text();
  if (text.length > 16384) throw new Error("Invalid Tabs signing keys");
  const jwks = JSON.parse(text);
  if (!Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 8)
    throw new Error("Invalid Tabs signing keys");
  return jwks;
}
