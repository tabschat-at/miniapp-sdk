# Build a Tabs mini-app

A Tabs mini-app is your HTTPS webapp running in Tabs' Android WebView. You host
the page, APIs and any AppView/indexer you need. Tabs supplies public identity,
permission-controlled publication to the user's PDS, native chat opening and
native payment review through `window.host`. The App Store lists your reviewed
URL and permission manifest. Using Tabs' shared AppView is optional.

This is the public portable developer kit, version 0.2.0, bridge V1. The browser
runtime has no production dependencies or build step. Android is the supported
host; iOS is deferred. See [host compatibility](docs/compatibility.md) for feature
minimums. The SDK, examples and documentation are licensed AGPL-3.0-only; see
[LICENSE](LICENSE). This repository contains only the developer kit.

## Get the SDK

Clone the public kit to get all examples and the preview:

```sh
git clone https://github.com/tabschat-at/miniapp-sdk.git
cd miniapp-sdk
npm run dev
```

For an application using a bundler, install the npm package:

```sh
npm install @tabschat/miniapp-sdk
```

The full developer kit and examples are also available in the
[downloadable source kit](https://developers.tabschat.com/downloads/tabs-developer-kit.tar.gz).

## Build with an AI coding agent

Use the [copyable compatibility prompt](docs/ai-agents.md) with an agent working
in your app repository. It covers the manifest, custom Lexicons, mobile layout,
permissions, backend boundaries, validation and submission.

## Start here

With Node 24.12+ (24.x):

```sh
npm run check
npm run dev
# Open http://127.0.0.1:4173 in your desktop browser.
npm run simulator
# Open http://127.0.0.1:4174 for devices, sign-in and host prompts.
npm run validate -- examples/recipe-notebook
```

The preview is explicitly a fixture. It offers granted and denied permissions,
uses fake identities, keeps publications in memory, and always cancels payments.
It never connects to a real account. You do not need to install dependencies for
these commands. The optional own-AppView example installs its own dependencies.

The [host simulator](dev-tools/README.md) starts on a Tabs-style Apps screen with
saved projects, a plus button for app URLs, first-run permission review, and the
app's X/title/shield header. It adds phone/tablet viewport presets, custom sizes,
fixture sign-in, permission revocation, chat/payment review, and proposed
share/message contact previews. Its light/dark host UI mirrors the Flutter source.
Run `npm run simulator -- --app ./your-app --manifest ./your-app/manifest.json`
to test a static app, or load a running dev server with the development bridge
snippet shown in the simulator. Installed-package users can run
`npx tabs-miniapp-simulate`. All host results are local fixtures.

## Contents

| Location                                               | What it provides                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| [src/](src/)                                           | Browser ES module helpers and standalone TypeScript declarations  |
| [docs/quickstart.md](docs/quickstart.md)               | Copy, develop, host and register a webapp                         |
| [docs/api.md](docs/api.md)                             | Every bridge method, inputs, results and errors                   |
| [docs/permissions.md](docs/permissions.md)             | Reusable permissions, consent and revocation                      |
| [docs/manifest.md](docs/manifest.md)                   | Complete manifest and Lexicon package contract                    |
| [docs/backends.md](docs/backends.md)                   | Your own backend/indexer and identity boundaries                  |
| [docs/tabs-appview.md](docs/tabs-appview.md)           | Optional shared AppView, query examples and server load           |
| [docs/testing.md](docs/testing.md)                     | Local fixtures, types, device acceptance and troubleshooting      |
| [docs/publishing.md](docs/publishing.md)               | Hosting, review, updates and current App Store submission         |
| [examples/hello-tabs/](examples/hello-tabs/)           | Minimal public identity app                                       |
| [examples/recipe-notebook/](examples/recipe-notebook/) | Public create/update/delete plus a developer-owned feed           |
| [examples/native-actions/](examples/native-actions/)   | Explicit chat and payment buttons                                 |
| [examples/own-appview/](examples/own-appview/)         | Token-free, signature-verifying PDS indexer and recipe API        |
| [examples/tabs-appview/](examples/tabs-appview/)       | Optional SDK query and cached server-side shared-AppView reads    |
| [dev/](dev/)                                           | Clearly marked local browser preview and mock host                |
| [dev-tools/](dev-tools/)                               | Device viewport simulator, interactive host prompts and inspector |
| [tools/](tools/)                                       | Dependency-free manifest preflight and kit checks                 |
| [reference/bridge.js](reference/bridge.js)             | Exact host-injected bridge source, for reference only             |

## Use in your app

Copy `src/index.js` alongside your webapp (or import the local package in your
bundler). Tabs injects the actual bridge before your page scripts:

```js
import { getHost, describeError } from "./tabs-sdk/index.js";

document.querySelector("button").onclick = async () => {
  try {
    const person = await getHost().identity.getSelf();
    document.querySelector("#result").textContent = `@${person.handle}`;
  } catch (error) {
    document.querySelector("#result").textContent = describeError(error);
  }
};
```

Do not load `reference/bridge.js`, install a mock, or create a second transport in
your production page. The helper consumes the trusted host; it does not grant
permissions. See [quickstart](docs/quickstart.md) for the corresponding manifest.

Verified app-backend sign-in and selected-file uploads are available on host
0.0.51+: [the complete example](examples/own-backend/README.md) includes a developer-
owned server, one-use challenges, app sessions and private uploads. The
[backend contract](docs/backends.md) explains how developers own their services
and where ATProto delegation is separate.

Download the portable source kit from
[GitHub Releases](https://github.com/tabschat-at/miniapp-sdk/releases).
Maintainers should follow [the release guide](RELEASING.md).

## Submit your app

Host your app over HTTPS and add `tabs-manifest` and `tabs-package` links to its
HTML head. The [package builder](https://developers.tabschat.com/tools/package-builder/)
generates the files and discovery snippet. Enter your public app URL in the
[submission tool](https://developers.tabschat.com/submit/), resolve validation
issues, review requested permissions and send the package for review.
Contact details are private to Tabs reviewers; public package files must contain
no credentials or private user data. Publisher ownership verification and operator
approval are required before publication. See the [publishing guide](docs/publishing.md).

Use the [online simulator](https://developers.tabschat.com/tools/simulator/) for
public HTTPS previews, or [download the current kit](https://developers.tabschat.com/downloads/tabs-developer-kit.tar.gz)
for localhost testing with `npm run simulator`.

PDS media publishing on host 0.0.52 uses [the universal blob API](docs/atproto-media.md).

The [app-package builder](dev-tools/README.md#app-package-builder) turns feature
choices and record fields into a validated package of manifest and Lexicons. The simulator’s
**+ Add app** flow discovers the app’s manifest, name and icon automatically.
