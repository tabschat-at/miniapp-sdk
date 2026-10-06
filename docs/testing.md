# Testing and troubleshooting

From the copied SDK root:

```sh
npm run check
npm run dev
npm run validate -- examples/hello-tabs
npm run validate -- examples/recipe-notebook
npm run validate -- examples/native-actions
```

`check` validates example packages, checks JavaScript syntax and runs standalone
tests. It needs no npm installation. `dev` binds only loopback at port 4173. It
inserts a mock through the preview server; the production HTML never imports it.
Use both granted and denied links. The mock is a UI fixture, not a security,
cryptography, native prompt, money or network-authentication simulator. Reloading
resets its records. Preview Bob is `bob.demo.invalid`; preview payment results
always say cancelled. Developer-feed fixtures are separate from mock publications.

For TypeScript, install the kit's development dependencies and check the supplied
usage sample from the public SDK root:

```sh
npm ci
npm run typecheck
```

Optional verified indexer checks/install are described in
[own-appview](../examples/own-appview/README.md). They use official ATProto
libraries, signed fixtures and no production credentials.

Before releasing a reviewed app on a real Android device, check:

- First-visit Allow/Deny, remembered consent on reopening and explicit revocation.
- Added permissions/network/schema changes request renewed consent.
- Safe disabled states when calls reject or the host is unavailable.
- Correct script/API origins and CORS under the host sandbox.
- Duplicate clicks, invalid record bodies, missing records, stale feed/cache,
  network loss and ambiguous publication results.
- Backgrounding, reopening, navigation and account changes during native actions.
- Payment cancellation and uncertain result handling; funded settlement needs
  separate explicit acceptance, never an automated preview test.

Typical causes: `HOST_UNAVAILABLE` means the page is outside Tabs; `FORBIDDEN` or
`PERMISSION_DENIED` can mean absent consent, undeclared collection or foreign-app
record ownership; a working desktop fetch can fail in Tabs due to an undeclared
origin or missing CORS; immediate post-publication queries can lag a poll; `BUSY`
means a native action is already running. Avoid retry loops and log only bounded
error codes. Public data is still user data; do not log tokens or private content.

The `own-backend` example's real sign-in requires host 0.0.51 and a configured Tabs
issuer. Browser mocks deliberately reject verified assertion issuance; they never
pretend a public DID or fixture token is a real login. The SDK test suite runs a
separate isolated backend with a test signing key and tests claim/signature checks,
challenge replay, authenticated upload and app logout. Test HTML file selection on
Android as well as in a browser: return from the system picker, cancel, revoke the
grant while the picker is open, close the app, and change accounts. No late file
should be delivered after those authority changes.
