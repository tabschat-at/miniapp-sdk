import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchTabsKeys, verifyTabsAssertion } from "../../server/auth.mjs";

/** Small, runnable developer-owned service. Host assertions never become PDS tokens. */
export function createAppBackend({
  issuer,
  audience,
  appId,
  appOrigin,
  storageDir,
  getKeys = () => fetchTabsKeys(issuer),
}) {
  for (const origin of [issuer, audience, appOrigin]) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin)
      throw new Error("Configure exact HTTPS origins");
  }
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,7}$/.test(appId))
    throw new Error("Configure the registered app ID");
  const challenges = new Map(),
    sessions = new Map(),
    sources = new Map();
  let busy = 0,
    uploadBusy = false;
  async function body(request, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw Error();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  function prune(map) {
    for (const [key, value] of map)
      if (value.expires <= Date.now()) map.delete(key);
  }
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    const send = (status, data) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    };
    const path = request.url;
    let acquired = false,
      uploading = false;
    try {
      if (request.headers.origin !== appOrigin) {
        send(403, { error: "ORIGIN_DENIED" });
        return;
      }
      response.setHeader("access-control-allow-origin", appOrigin);
      response.setHeader("vary", "Origin");
      if (request.method === "OPTIONS") {
        response.setHeader("access-control-allow-methods", "POST, PUT");
        response.setHeader(
          "access-control-allow-headers",
          "content-type, authorization",
        );
        response.writeHead(204);
        response.end();
        return;
      }
      if (busy >= 4) {
        send(429, { error: "BUSY" });
        return;
      }
      busy++;
      acquired = true;
      prune(challenges);
      prune(sessions);
      prune(sources);
      const source = request.socket.remoteAddress ?? "unknown";
      const rate = sources.get(source) ?? {
        count: 0,
        expires: Date.now() + 60000,
      };
      if (rate.count++ >= 30 || (sources.size >= 512 && !sources.has(source))) {
        send(429, { error: "RATE_LIMITED" });
        return;
      }
      sources.set(source, rate);
      if (request.method === "POST" && path === "/auth/challenge") {
        if (challenges.size >= 512) {
          send(429, { error: "BUSY" });
          return;
        }
        const loginId = randomBytes(32).toString("base64url"),
          nonce = randomBytes(32).toString("base64url");
        challenges.set(loginId, { nonce, expires: Date.now() + 60000 });
        send(200, { loginId, nonce });
        return;
      }
      if (request.method === "POST" && path === "/auth/session") {
        if (request.headers["content-type"] !== "application/json")
          throw Error();
        const input = JSON.parse(await body(request, 12288));
        if (!input || Object.keys(input).sort().join() !== "loginId,token")
          throw Error();
        const challenge = challenges.get(input.loginId);
        challenges.delete(input.loginId); // Atomic one-use consumption before any async verification.
        if (!challenge || challenge.expires <= Date.now()) {
          send(401, { error: "SIGN_IN_EXPIRED" });
          return;
        }
        let claims;
        try {
          claims = verifyTabsAssertion(input.token, {
            issuer,
            audience,
            appId,
            nonce: challenge.nonce,
            jwks: await getKeys(),
          });
        } catch {
          send(401, { error: "SIGN_IN_DENIED" });
          return;
        }
        if (sessions.size >= 512) {
          send(429, { error: "BUSY" });
          return;
        }
        const sessionToken = randomBytes(32).toString("base64url"),
          expires = Date.now() + 10 * 60000;
        sessions.set(sessionToken, { did: claims.sub, expires });
        send(200, {
          sessionToken,
          did: claims.sub,
          expiresAt: new Date(expires).toISOString(),
        });
        return;
      }
      const header = request.headers.authorization ?? "";
      const session = sessions.get(
        header.startsWith("Bearer ") ? header.slice(7) : "",
      );
      if (!session || session.expires <= Date.now()) {
        send(401, { error: "APP_SESSION_REQUIRED" });
        return;
      }
      if (request.method === "POST" && path === "/auth/logout") {
        sessions.delete(header.slice(7));
        send(200, { signedOut: true });
        return;
      }
      if (request.method === "PUT" && path === "/upload") {
        if (uploadBusy) {
          send(429, { error: "UPLOAD_BUSY" });
          return;
        }
        uploadBusy = true;
        uploading = true;
        const bytes = await body(request, 8 * 1024 * 1024);
        if (!bytes.length) throw Error();
        await mkdir(storageDir, { recursive: true, mode: 0o700 });
        const existing = await readdir(storageDir);
        const sizes = await Promise.all(
          existing.map((file) => stat(join(storageDir, file))),
        );
        if (
          existing.length >= 128 ||
          sizes.reduce((n, s) => n + s.size, 0) + bytes.length >
            64 * 1024 * 1024
        ) {
          send(413, { error: "APP_STORAGE_FULL" });
          return;
        }
        const id = randomUUID();
        await writeFile(join(storageDir, `${id}.bin`), bytes, {
          mode: 0o600,
          flag: "wx",
        });
        send(201, { id, did: session.did, size: bytes.length });
        return;
      }
      send(404, { error: "NOT_FOUND" });
    } catch {
      if (!response.headersSent) send(400, { error: "INVALID_REQUEST" });
      else response.destroy();
    } finally {
      if (acquired) busy--;
      if (uploading) uploadBusy = false;
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createAppBackend({
    issuer: process.env.TABS_ISSUER ?? "https://api.tabschat.com",
    audience: process.env.BACKEND_ORIGIN,
    appOrigin: process.env.APP_ORIGIN,
    appId: process.env.APP_ID,
    storageDir: process.env.APP_UPLOAD_DIR ?? "./private-uploads",
  });
  server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1", () =>
    console.log(
      "Developer backend listening on loopback; expose it through your HTTPS proxy.",
    ),
  );
}
