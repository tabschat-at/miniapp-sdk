# Developer-owned backends, login and media

A Tabs mini-app is an independently deployed HTTPS web app. Own its UI, database,
private app state, media storage, processing, CDN, notifications and service APIs.
Use ordinary `fetch`, `FormData`, browser `File` and HTML media elements. Tabs
provides reusable identity, scoped account actions, user-selected files and native
payment/chat review. An app feature does not require its own Tabs backend route.

Declare external HTTPS origins in `networkAccess`. The entrypoint's origin is
already allowed. Your backend must allow the actual app origin through CORS.
Tabs disables third-party cookies, so cross-origin app sessions should use the
app's own bearer token in memory. Do not send a Tabs session token to your server.

## Verified sign-in (host 0.0.51 and later)

`host.identity.getSelf()` is public profile data. It is not proof of login.
Declare `identity.authenticate` for the separate login capability. Adding it to
an existing manifest requires fresh host consent.

1. Your backend creates a random, 60-second nonce and a separate unpredictable
   login-attempt secret. Bind both to that browser's attempt in your own store.
2. The page calls `host.auth.getAssertion({ audience, nonce })`. `audience` is the
   exact HTTPS origin of your backend, which must be the app origin or a declared
   network origin. The host checks the active account, session, runtime and grant.
3. Tabs returns `{ token, issuer, expiresAt }`. The Ed25519 JWT lasts 60 seconds.
   It contains `iss`, `sub` (DID), `aud`, `app_id`, `nonce`, `iat`, `exp` and `jti`.
   Its header is `alg: EdDSA`, `typ: tabs-miniapp+jwt`, and a public-key `kid`.
4. The page sends the proof and its login-attempt secret to your backend. Verify
   the signature with keys from the **configured** issuer's
   `/.well-known/miniapp-jwks.json`, the exact issuer/audience/app ID, nonce, token
   type and time window. Atomically consume the challenge once. Never use a key
   URL, issuer or audience supplied by an unverified token as trusted config.
5. Your backend issues its own session and owns expiry, logout and app access.

The portable kit exports `signInWithTabs({backendOrigin})` for this challenge
protocol, plus server-only `verifyTabsAssertion` and `fetchTabsKeys` from
`@tabschat/miniapp-sdk/server/auth`. See the complete
[own-backend example](../examples/own-backend/README.md), including private file
uploads, CORS, bounded requests, one-use challenges and explicit app logout.

An assertion authenticates a DID to your application; it is not a PDS access
token, ATProto service-auth token, OAuth grant, wallet signature or account key.
The signing key belongs to the Tabs issuer and is distinct from those keys.
Revoking host consent/session blocks new proofs; a previously issued proof remains
valid until its 60-second expiry. Your own sessions do not automatically end on
Tabs logout or consent withdrawal: give them an appropriate lifetime and provide
app logout/revocation. Handles can change; use the verified DID as your user key.

The operator configures `MINIAPP_AUTH_ISSUER` as the public HTTPS API origin and
`MINIAPP_AUTH_PRIVATE_KEY` as base64 PKCS8 DER for a dedicated Ed25519 key.
Test-host bootstrap generates it once in protected config and preserves it on
updates. Without a configured key, assertion issuance is unavailable. Keep the
key stable across restarts; during rotation, retain old public verification keys
for outstanding proofs or expect those attempts to retry. This issuer currently
publishes one active key. Fetch/cache JWKS for at most 60 seconds and refresh on an
unknown key. Public keys are public; private configuration never ships in an app.

## User-selected files (host 0.0.51 and later)

Declare `files.select`. Use standard HTML, directly from a user action:

```html
<input type="file" accept="image/*,video/mp4" multiple />
```

Or import `selectFiles({accept: 'image/*', multiple: true})` from the SDK and call
it synchronously in a button click handler. It resolves to ordinary `File[]`;
cancellation resolves to `[]`. Pass a file directly to `fetch` or `FormData`.
There is no binary/base64 bridge transport and no Tabs media-storage requirement.

Android opens its system document picker after permission validation. The host
accepts at most eight selected files, copies at most 64 MiB per file and 128 MiB
per open app into a private temporary cache, and returns read-only copies to the
WebView. It rejects private host providers, non-content URIs, directory/write
selection and missing read grants. Originals are not modified or permanently
granted. Selection is checked again after returning to the foreground; closing,
navigation, account changes, runtime expiry or withdrawn permission prevent
late delivery. Temporary copies are cleared on app close or host restart. Upload
or finish reading while the app is open; do not persist local URI assumptions.

File names, MIME types and contents are untrusted. Enforce your backend's own
size/type/quota limits and media validation. Picker limits are host resource bounds,
not a storage plan for your application. Camera/microphone capture and background
workers remain separate capabilities; they are not enabled by `files.select`.

## AT Protocol media and interoperability

Uploading to your own service works with login and selection above. Uploading a
blob **to the user's PDS** is a separate account action. A Bluesky image embed or
Spark media record references an authorized ATProto blob, not an arbitrary URL.
Host 0.0.52 provides the generic `blobs.upload` capability and standard ATProto
blob references; see [ATProto media](atproto-media.md). ATProto service
authentication remains a separate extension. Independently deployed websites can use ATProto OAuth, but the
embedded host needs a controlled authorization/return flow for that route.

Public repository streaming/indexing is also independent of mini-app deployment.
The Tabs PDS now has a working `com.atproto.sync.subscribeRepos` WebSocket and
Bluesky relay ingestion. That makes signed records discoverable to that relay;
it does not make every other application index Tabs or accept its login proof.

[The Spark compatibility assessment](spark-interop.md) distinguishes the reusable
host capabilities from each application's schemas, AppView and authentication.

For paid app fulfilment on host 0.0.62+, an optional signed payment sender commitment
binds the authenticated DID to a chain sender without returning a wallet address.
See [payment fulfilment identity](api.md#payment-fulfilment-identity-host-0062).
