# Sign in and upload to your own backend

This complete example demonstrates an HTTPS mini-app using `identity.authenticate`
and `files.select` on Tabs host 0.0.51+. The developer operates its own HTTP service,
sessions and private file storage. It does not publish files to the PDS.

1. Replace the example frontend/backend domains in `manifest.json` and `app.js`.
   Keep the backend's exact HTTPS origin in `networkAccess`.
2. Deploy the web assets plus `sdk/src/index.js` at your entrypoint. The paths in
   this example assume the kit's existing directory layout.
3. Run Node 24.12+ behind your own HTTPS reverse proxy, with writable private storage:

```sh
APP_ORIGIN=https://uploads.example.org \
BACKEND_ORIGIN=https://api.uploads.example.org \
APP_ID=org.example.uploads \
TABS_ISSUER=https://api.tabschat.com \
APP_UPLOAD_DIR=/var/lib/my-app/private-uploads \
PORT=8787 node server.mjs
```

4. Register/publish the manifest through the normal Tabs operator workflow. No
   collections or new Tabs server route are needed for this application.
5. Open it in the updated Android host, grant login/selected-file access, sign in,
   choose a file and upload it. The response is bound to the verified DID. Sign out
   invalidates the app's session.

The protocol uses `/auth/challenge` → `host.auth.getAssertion` → `/auth/session`.
A login-attempt secret distinct from the signed nonce binds completion to the
requesting browser. The server consumes it once before async verification. Wrong
signature, issuer, backend audience, app ID, nonce or expiry is rejected. The JWT
is never reused as the developer session. No host bearer, PDS password, wallet key
or recovery data reaches this service. Cross-origin CORS allows only your frontend;
app bearer sessions are used because embedded third-party cookies are disabled.

This small example keeps challenges and ten-minute app sessions in memory, so a
backend restart signs clients out. Uploads persist as private binary files with an
8 MiB file limit, 64 MiB storage limit and 128-file limit. Uploads are serialized;
requests, source rate limits and session counts are bounded. Files have no public
serving route. Use your application's own persistent session store, storage quotas,
media validation, deletion and delivery policy when adapting it. If your proxy
shares one source IP, its clients share the example's source rate limit; configure
trusted proxy/source handling explicitly when replacing this demo service.

`npm run check` from the SDK tests this flow with a test signing key and an isolated
local backend. `npm run dev` previews the UI, but its mock host **cannot issue a
verified sign-in proof**. A real sign-in needs the updated host and a configured
Tabs issuer. The example domains are placeholders, not deployed services.

See [backend/login/file documentation](../../docs/backends.md) for the complete
security and interoperability contract.
