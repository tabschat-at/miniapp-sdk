# Testing and troubleshooting

From the copied SDK root:

```sh
npm run check
npm run dev
npm run simulator
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

For device viewport presets, a host-level user picker and permission prompts, contact
previews, and configurable payment results, use the
[developer-tools simulator](../dev-tools/README.md) on port 4174. It accepts static
builds or a running app with the SDK browser bootstrap. Its unsigned assertion
fixture never passes real backend assertion verification, and share/message
composition previews are separate from the production host API. Browser layout
simulation still requires real Android acceptance testing.

## Browser host bootstrap

Load this before app code in your regular deployment:

```html
<script src="https://developers.tabschat.com/sdk/0.2.0/bootstrap.js"></script>
```

Or, with SDK 0.2.0 and a bundler, import the side-effect module before calling
`getHost()`:

```js
import "@tabschat/miniapp-sdk/bootstrap";
import { getHost } from "@tabschat/miniapp-sdk";
```

The bootstrap preserves an existing native `window.host` and does nothing on a
standalone page. In a frame it connects only to the HTTPS developer site or an
HTTP localhost simulator, checks message source/origin and waits for the host
handshake before returning calls. It never signs in or invents a host account.
Allow framing by `https://developers.tabschat.com` in your CSP and allow the
bootstrap script origin if you restrict scripts. Declare that script origin in
`networkAccess`; updated manifest policy requires review. Keep production mock
injection out of your app. The older `/tools/simulator/bridge.js` is a legacy
fixture bridge and should remain development-only.

The hosted simulator always starts with **Simulated user**, even after a live
session. Choose **Real Tabs account** in the upper-right and continue with an
existing Tabs passkey. The persistent LIVE ACCOUNT notice means operations can
affect real data: writes publish real records, backend sign-in is real, and
permission changes apply to the same app in Tabs. Return to simulated mode to
revoke the simulator session. Other Tabs device sessions remain signed in.

Live mode accepts only the app's exact server-approved entrypoint and approved
manifest. Discovery and local overrides cannot authorize real access. Supported
methods are identity lookup, app-scoped authentication assertions, public queries
and record create/update/delete. Payments, wallet signing, native chat and blob
uploads explicitly reject in this browser host. Test these on a real device.
An unapproved app can still use simulated users. Real account mode is available
only on the hosted developer site; localhost projects use simulated users.

`host.environment?.mode` is an optional browser-only UI hint (`connecting`,
`simulated` or `live`), not authentication proof. Read it after a host call has
connected. Backends must still verify signed assertions, their audience, app ID
and single-use challenge. Never accept a DID or this mode flag as a login.

The simulator starts on an Apps launcher. Add multiple projects with **+**, supply
a URL to discover its manifest, and open a tile to test the first-run consent sheet. Use the app
header's **X** to return to the launcher and **shield** to manage access. Saved
projects, permission decisions, display settings, inspector state and the selected
host fixture user survive simulator reload; fixture records stay in memory.
Choose the signed-in user in the upper-right header. Mini-apps can read that
identity immediately after consent, without an app-level login prompt. Switching
host users clears all app consent and fixture records. **Reset first run** clears
one project's consent and fixture state while keeping the host user signed in. Permission sheets and the header mirror the Flutter UI's wording
and light/dark design tokens in HTML/CSS.

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
