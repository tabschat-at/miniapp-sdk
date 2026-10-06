import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTabsAssertion } from "../server/auth.mjs";
import { createAppBackend } from "../examples/own-backend/server.mjs";
import { createMockHost } from "../dev/mock-host.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const issuer = "https://api.tabschat.com",
  audience = "https://api.uploads.example.org",
  appId = "org.example.uploads",
  appOrigin = "https://uploads.example.org";
const jwks = {
  keys: [
    {
      ...publicKey.export({ format: "jwk" }),
      kid: "test",
      alg: "EdDSA",
      use: "sig",
    },
  ],
};
function token(nonce, overrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({
      alg: "EdDSA",
      typ: "tabs-miniapp+jwt",
      kid: "test",
      ...headerOverrides,
    }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      app_id: appId,
      sub: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
      nonce,
      iat: now,
      exp: now + 60,
      jti: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      ...overrides,
    }),
  ).toString("base64url");
  const message = `${header}.${payload}`;
  return `${message}.${sign(null, Buffer.from(message), privateKey).toString("base64url")}`;
}
test("verifier requires valid signature, pinned claims, nonce, lifetime and token type", () => {
  const nonce = randomBytes(32).toString("base64url");
  const options = { issuer, audience, appId, nonce, jwks };
  assert.equal(
    verifyTabsAssertion(token(nonce), options).sub,
    "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  );
  for (const overrides of [
    { iss: "https://attacker.example" },
    { aud: appOrigin },
    { app_id: "org.example.other" },
    { nonce: "b".repeat(43) },
    { exp: 1 },
    { exp: Math.floor(Date.now() / 1000) + 600 },
    { iat: Math.floor(Date.now() / 1000) + 10 },
    { sub: "alice" },
  ])
    assert.throws(() => verifyTabsAssertion(token(nonce, overrides), options));
  for (const header of [
    { alg: "none" },
    { typ: "JWT" },
    { kid: "wrong" },
    { jku: "https://attacker.example/keys" },
  ])
    assert.throws(() => verifyTabsAssertion(token(nonce, {}, header), options));
  const wrongKey = generateKeyPairSync("ed25519").publicKey.export({
    format: "jwk",
  });
  assert.throws(() =>
    verifyTabsAssertion(token(nonce), {
      ...options,
      jwks: { keys: [{ ...wrongKey, kid: "test", alg: "EdDSA", use: "sig" }] },
    }),
  );
  assert.throws(() =>
    verifyTabsAssertion(token(nonce), { ...options, issuer: undefined }),
  );
});
test("own backend consumes challenges once, scopes sessions, and accepts selected bytes without host credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tabs-developer-backend-"));
  const server = createAppBackend({
    issuer,
    audience,
    appId,
    appOrigin,
    storageDir: directory,
    getKeys: async () => jwks,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  async function post(path, body, origin = appOrigin) {
    return fetch(url + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  try {
    assert.equal(
      (await post("/auth/challenge", {}, "https://attacker.example")).status,
      403,
    );
    const first = await (await post("/auth/challenge", {})).json();
    const second = await (await post("/auth/challenge", {})).json();
    const proof = token(first.nonce);
    assert.equal(
      (await post("/auth/session", { loginId: second.loginId, token: proof }))
        .status,
      401,
    );
    assert.equal(
      (await post("/auth/session", { loginId: first.nonce, token: proof }))
        .status,
      401,
    );
    const response = await post("/auth/session", {
      loginId: first.loginId,
      token: proof,
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(
      (await post("/auth/session", { loginId: first.loginId, token: proof }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(url + "/upload", {
          method: "PUT",
          headers: { origin: appOrigin },
          body: "unauthenticated",
        })
      ).status,
      401,
    );
    const selectedBytes = Buffer.from("user-selected document");
    const uploaded = await fetch(url + "/upload", {
      method: "PUT",
      headers: {
        origin: appOrigin,
        authorization: `Bearer ${session.sessionToken}`,
      },
      body: selectedBytes,
    });
    assert.equal(uploaded.status, 201);
    const record = await uploaded.json();
    assert.equal(record.did, session.did);
    assert.deepEqual(
      await readFile(join(directory, `${record.id}.bin`)),
      selectedBytes,
    );
    assert.equal(
      (
        await fetch(url + "/auth/logout", {
          method: "POST",
          headers: {
            origin: appOrigin,
            authorization: `Bearer ${session.sessionToken}`,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(url + "/upload", {
          method: "PUT",
          headers: {
            origin: appOrigin,
            authorization: `Bearer ${session.sessionToken}`,
          },
          body: "after logout",
        })
      ).status,
      401,
    );
  } finally {
    server.close();
    await once(server, "close");
    await rm(directory, { recursive: true, force: true });
  }
});
test("preview host cannot issue verified assertions, even with preview permission", async () => {
  const mock = createMockHost({
    id: appId,
    permissions: ["identity.authenticate"],
  });
  await assert.rejects(
    mock.auth.getAssertion({ audience, nonce: "a".repeat(43) }),
    { code: "UNSUPPORTED_OPERATION" },
  );
});
