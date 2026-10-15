# SDK developer tools

Open the [online simulator](/tools/simulator/) or [app-package builder](/tools/package-builder/)
for public HTTPS apps. Use the local edition below for localhost apps, offline
work, or apps that cannot allow iframe embedding. [Submit a deployed app](/submit/)
after validation. Online discovery only accesses public HTTPS metadata.

[Download the current developer kit](https://developers.tabschat.com/downloads/tabs-developer-kit.tar.gz),
extract it into a folder, and run `npm run simulator` there with Node 24.12+.
The archive includes the tools' source, offline validator, examples and guides.

The browser host simulator runs without dependencies, a build step, a browser
extension, or Electron. From the SDK root, use Node 24.12+:

```sh
npm run simulator
# http://127.0.0.1:4174
```

If you installed `@tabschat/miniapp-sdk`, use `npx tabs-miniapp-simulate`.

## Apps screen and first run

The simulator starts on a Tabs-style **Apps** screen. Use **+** to add a project
by URL. Name, icon and requested permissions load automatically—no JSON paste or
CORS setup is needed. Discovery reads an HTML `<link rel="tabs-manifest">`, a
Tabs V1 manifest linked with `rel="manifest"`, then `manifest.json` beside the
entered URL and at the site root. Relative links and HTTP redirects are resolved.
Icons come from `apple-touch-icon`, PWA manifest icons, or `rel="icon"`, with a
favicon fallback. Broken icons fall back to the app’s initial. PWA manifests
provide branding only; they never grant Tabs capabilities.

If no valid Tabs manifest is found, the sheet explains why and links to the
app-package builder. You can explicitly add the app without host permissions to
preview its layout. An advanced JSON override remains available. Add the same
URL again to refresh its manifest and icon; changes renew first-run consent.
Added projects appear as app tiles on the Apps screen.
Use **Edit** on the Apps screen to remove a project.

Opening a project reviews its complete permission manifest before loading the
webapp. **Allow and open** grants the declared capabilities; **Not now** opens the
app with those capabilities denied. Decisions are remembered separately for each
project. Closing with **X** returns to Apps. The app header shows
**Tabs · App title**, with a **shield** to review, revoke, or allow access.
**Reset first run** in the header clears the active project's
fixture state so its next opening asks again, keeping the host user signed in. Updating its manifest also renews
consent, including changes to collection or network declarations.

The browser components reproduce the current Flutter source's permission labels,
28px sheet corners, grouped rows, spacing, purple gradient buttons, and header.
They mirror `MiniAppPermissionSheet`, `MiniAppPermissionRows`, `SettingsGroup`,
`AppPrimaryButton`, and `MiniAppScreen`; **Tabs appearance** previews the host's
light/dark color tokens from `AppColors`. These are HTML/CSS equivalents, not
Flutter widgets running in a browser. Fonts, icons and OS rendering can differ.
Contact-sharing and message-composition sheets remain proposed interactions.

## App-package builder

Open **App-package builder** in the simulator, or visit
`http://127.0.0.1:4174/manifest-generator/index.html` while it is running.
Choose a basic, notes, backend sign-in or payment template, enter your app details,
and select features using plain-language descriptions. The form produces the
exact documented V1 fields and previews the host’s first-run permission labels.
It sets capability dependencies, USDC payment assets and the minimum host version
for the chosen features. You can override the host version to check compatibility.

Define each collection in **Record fields**: add or rename fields, select text,
integer, yes/no, datetime or text-list types, mark required fields and set limits.
**Advanced Lexicon JSON** supports nested objects, references, unions, attachments
and other Lexicon features. Import existing Lexicon files or a complete package;
reviewed shared schemas should stay unchanged. A record JSON scratchpad checks
sample data against the edited schema and host limits.

**Download package.zip** includes `manifest.json`, `lexicons/<id>.json`, a portable
`app-package.json`, HTML discovery links and setup instructions. Copy the files
beside your app's HTML. Import `app-package.json` in the simulator inspector or
let URL discovery load it through `rel="tabs-package"`. Without a package index,
discovery checks `lexicons/<collection>.json` beside the manifest and follows
schema references. Keep the portable package and individual files synchronized.

The builder, simulator and CLI compile schemas with the bundled official
`@atproto/lexicon` library (the host's pinned version). Record validation enforces
required fields, types, formats, constraints, registered references, exact fields,
safe integers and the host's 16 KB limit. Invalid creates/updates leave fixture
records unchanged and report the failure in Activity. Missing schemas reject
writes with instructions to import them; no generic schema silently substitutes
for your app's schema. Schema imports persist per project and changed schemas
start a fresh session. Static `--app` launches load the `lexicons/` folder beside
the selected manifest.

Run `npx tabs-miniapp-validate ./your-app` on the complete package. Local checks
do not register or approve schemas with Tabs. The simulator keeps records in
memory and uses fixture identities; it does not contact a user's PDS. The tools
work locally and offline after download; the hosted builder also runs in your browser. Maintainers can rebuild the bundled
validator with `npm run dev-tools:build`; dependency licenses are in `vendor/`.

Add the generated links to your app’s HTML head:

```html
<link rel="tabs-manifest" href="./manifest.json" />
<link rel="tabs-package" href="./app-package.json" />
<link rel="icon" href="https://example.org/icon.png" />
```

The optional icon URL produces a separate HTML link; it is not an extra V1
manifest field. Wallet capabilities follow the current host's `wallet.connect`
dependency and 0.0.74 minimum, and need advanced mode and real-device testing.
Proposed simulator contact sharing/message composition is not generated.

## Workspace layout

Device, rotation, appearance and fit controls live above the preview. Preset
width and height stay visible in disabled fields; choose **Custom viewport** to
edit them or resize using the preview’s edge and corner handles. Use the appearance
icon to toggle light/dark host styling. Focus a handle and use arrow keys for one-pixel steps (Shift for ten).
Device selection, rotation, custom dimensions, appearance, fit,
inspector width and collapsed state are remembered across simulator reloads.

The upper-right header contains the simulator-wide host session. It starts signed
in as Alice. **Switch user** opens a fixture user picker; **Sign out** returns to
the Apps screen. Signed-out users choose a host user before opening an app. Once
app permissions are accepted, `host.identity.getSelf()` returns that user without
an app-level login prompt. Every project receives the same selected user.
Switching users or signing out clears every project’s consent and fixture records.
The selected fixture user (including signed-out state) is remembered on reload.

The collapsible **Host inspector** contains connection status, bridge setup,
manifest editing, schema/package import, the app-package builder, failure scenarios, permissions and
activity. The hamburger beside the display controls toggles it; drag the divider
to resize it, or focus the divider and use arrow keys.
On narrow windows it initially starts collapsed and opens as a drawer. Add and switch
projects from the Apps screen; close an active app with **X** to return there.

The collapsible Permissions section shows allowed and denied decisions alongside
attempted capabilities or collections missing from the manifest. Missing entries
remain rejected and are never granted through a host prompt. The warning count
stays visible while the section is collapsed. Clear resets decisions and observed
missing declarations; changing the manifest or host account also resets them.
Activity includes contact preview details and host error explanations.

## Device dimensions and motion

### Capture screenshots for submission

Use the camera button beside the theme and reload controls in desktop Chrome or
Edge. In the browser's sharing prompt, choose **this simulator tab**, then allow
capture. A preview opens with **Download PNG**; capture stops immediately once
the image is ready. Upload the downloaded file in the [app submission form](/submit/).
The image stays in your browser until you choose to upload it there.

The screenshot includes the current app, Tabs header, system bars and open host
prompts. It excludes the device bezel, simulator controls and inspector, including
when the app is hosted on another domain. Presets export at their listed panel
resolution, respecting rotation and folding. Custom viewports export at their CSS
screen dimensions, including host bars. The tool temporarily fits the complete
device without changing the app's CSS viewport or saved display preferences.
Export dimensions do not emulate a real device's pixel density; detail depends
on the visible browser capture. Screenshots also work with local apps through the
downloaded simulator. Review images for private data before submitting them.

This uses the browser's [Region Capture API](https://developer.chrome.com/docs/web-platform/region-capture).
Unsupported browsers show instructions instead of producing an incomplete image.

Presets now derive the full CSS screen from the physical panel resolution and a
reference layout density, then reserve 28 CSS px for status, 56 for the Tabs app
header and 20 for gesture navigation. **W/H** show the remaining mini-app viewport.
Rotation swaps the full screen before reserving that chrome. Previously the tool
added host chrome to a full-screen viewport, making phones too tall.

Panel resolutions were checked against [Google’s Pixel specifications](https://support.google.com/pixelphone/answer/7158570?hl=en),
[Samsung’s S24 specifications](https://www.samsung.com/uk/smartphones/galaxy-s24/specs/),
[Galaxy S26](https://www.samsung.com/au/business/smartphones/galaxy-s/galaxy-s26-black-256gb-sm-s942bzkeats/),
[S26 Ultra](https://www.samsung.com/ca/business/smartphones/galaxy-s/galaxy-s26-ultra-sm-s948wzdaxac/),
[Samsung’s Fold8 comparison](https://www.samsung.com/uk/support/mobile-devices/what-is-the-difference-between-the-galaxy-z-fold-models/),
and Apple’s [SE](https://support.apple.com/en-us/111882),
[16 Pro](https://support.apple.com/en-us/121031) and [17 Pro](https://support.apple.com/en-us/125090) specifications.
Each preset also carries its source URL in `devices.js`. Tablet is a generic layout.

New presets include Pixel 10/10 Pro XL, Galaxy S26/S26 Ultra, iPhone 17 Pro,
and folded/unfolded Pixel 10 Pro Fold and the short, wide Galaxy Z Fold8.
Foldable presets show a Fold/Unfold button that switches screens without reloading
the mini-app, preserving its state and the selected orientation.
Reference density is an approximation, not a verified WebView viewport: Android
screen zoom, resolution settings, navigation mode and safe-area insets can change
the real CSS dimensions. Use Custom viewport for measurements from an actual host.

Mini-apps and host sheets slide up on opening and down on dismissal, using a shared
280/220 ms cubic transition. Only the panel moves, by its own height, over a fixed
background; focus does not scroll the phone to reveal the entering panel.
Permission, payment and contact sheets use the same bottom-sheet motion.
Reset, sign-out and project changes cancel pending transitions and calls.
The browser’s reduced-motion preference disables the transitions.

## Test your own app

Serve a static build with its manifest. Paths are relative to your current working
directory; the default manifest is `<app>/manifest.json`:

```sh
npm run simulator -- --app /path/to/webapp/dist --manifest /path/to/webapp/manifest.json
# Optional: --port 4180
```

The local server injects the bridge before scripts in HTML responses under
`/app/`, without changing your files. Use relative asset URLs in static builds
(e.g. Vite's `base: './'`). Absolute `/assets/` URLs, development APIs and SPA
history routing should use your own development server instead.

For the online simulator, use a public HTTPS app that permits embedding by
`https://developers.tabschat.com` (including any CSP `frame-ancestors` policy).
Load the production-safe bootstrap before app code:

```html
<script src="https://developers.tabschat.com/sdk/0.2.0/bootstrap.js"></script>
```

It preserves native Tabs and standalone browsing. See [browser host setup](../docs/testing.md#browser-host-bootstrap)
for CSP and manifest setup. Simulated users remain the default. Choose **Real Tabs
account** to sign in with an existing passkey and test approved apps against their
production backend. The LIVE ACCOUNT notice means writes and permission changes
affect real data. Native payments, wallet signing, chat and blob uploads are
unavailable in live browser mode. Discovery never overrides approved policy.

For a running development server, add the following **only in development**,
before the application's scripts, then add its URL with **+** in the simulator:

```html
<script src="http://127.0.0.1:4174/bridge.js"></script>
```

The snippet shown in the UI uses the actual simulator origin and port. The
application must allow iframe embedding and script loading from that origin in
its development CSP. Supply its V1 manifest when adding it, or edit an open
project in **Connection & manifest**. The bridge installs synchronously before app startup; outside a frame
or when a host already exists it leaves the page alone. Remove the snippet from
production builds. The simulator serves local files and fetches bounded app metadata server-side.
It does not proxy external applications or alter their HTML. Discovery uses no
credentials, limits redirects and response sizes, and times out after ten seconds.

## What you can exercise

- Pixel, Galaxy, iPhone layout and tablet presets, custom 240–2000 CSS pixel
  dimensions, a resizable responsive viewport, rotation, and automatic scaling to the available canvas. The
  displayed dimensions are the iframe's app viewport, excluding simulated host
  chrome. Scaling changes presentation, not the app's CSS viewport.
- Fixture sign-in as Alice, Bob or Casey; sign-out and per-project first-run reset.
- Manifest-scoped capabilities and collection access, full first-run permission
  review, remembered decisions, individual revocation, and the header's permission
  management sheet. New permission requests always use a host prompt. Reset or
  clear permissions to re-test a decision. Undeclared capabilities always reject.
- Public identity and fixture handle resolution, in-memory create/update/delete
  and paginated reads, conversation review, and payment review with selected
  cancelled/sent/pending/failed/expired outcomes. All digests and record CIDs are
  fake. No signing, settlement or publication occurs.
- A deliberately unsigned assertion-shaped result for `auth.getAssertion`.
  Its token is `SIMULATOR_ONLY_UNSIGNED_ASSERTION`; real assertion verification
  must reject it. It cannot complete the SDK's real `signInWithTabs` backend
  flow. Use a separate development backend fixture for an app session.
- Host response delay and host-unavailable scenarios, a bounded activity log
  containing method names and outcomes, and an in-memory record inspector.
- Browser file selection in the playground. Blob upload and all wallet methods
  reject with `UNSUPPORTED_OPERATION`; they need real host testing.

The contact previews intentionally use a separate, development-only namespace:

```js
await window.tabsSimulator.shareToContact({
  title: "My app",
  url: "https://example.org/my-app",
});
await window.tabsSimulator.messageContact({ text: "Have a look!" });
// {status: 'simulated', recipientDid: 'did:plc:...'} or {status: 'cancelled'}
```

These show contact selection, share review and message composition. Nothing is
delivered. They are proposed UX fixtures, not capabilities in `window.host`, the
production manifest, or the published TypeScript bridge contract. The actual
`host.chat.openConversation({recipientDid})` opens a simulated conversation sheet
using fixture contacts such as `bob.demo.invalid`.

## Boundaries

This is a browser layout and host-interaction simulator. It does not emulate
Android WebView, OS permissions, keyboard insets, safe areas, touch input, user
agent, device pixel ratio, networking restrictions, cryptography or native
wallets. Preset DPR values are reference labels; the browser's DPR remains in
effect. iPhone presets test layout only; the SDK's supported host is Android.
Host-unavailable mode affects host calls, not the app's own browser fetches.

Manifest discovery currently loads the manifest and branding, not Lexicon files.
Simulated record writes check collection scope and `$type`, but do not validate
the record body against a Lexicon. A successful fixture write does not establish
that the real host will accept the record. The real host uses reviewed schemas,
rejects undeclared fields and enforces record bounds. The generator's starter
schemas must be adapted to your data model and included with your review package.

Project URLs, manifests, permission decisions, workspace settings and the selected
host fixture user are saved in the simulator origin's browser local storage. If
storage is unavailable, the tools still work in memory. Records stay in memory,
separately for each project. Closing, reopening, switching apps, and app reloads
preserve them; reloading the whole simulator clears records but keeps the host
user, saved project decisions and workspace settings. A changed manifest, removing
a project, or **Reset first run** clears the relevant project’s fixture state.
Switching host users or signing out clears all projects’ consent and records. The built-in playground
and a CLI-configured static app are restored to the library on simulator reload.

Closing or switching apps invalidates pending calls and replaces the iframe's
browsing context. Revocation invalidates in-flight host calls. Clearing
permissions prompts for a new review before reloading the active app. Fixture
host calls have a five-minute timeout and an eight-call concurrency limit. App
browser storage and its own backend sessions remain under the app's control.

Only open app code you trust: the iframe allows scripts, forms, downloads and
same-origin access so ordinary apps and ES modules can run. The server binds to
loopback, blocks path traversal and symlink escapes, and serves only recognized
static file extensions. It is a local development tool, not an isolation boundary
for untrusted pages. Always complete acceptance testing on a real Tabs device.
