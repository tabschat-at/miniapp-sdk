# Build a Tabs mini-app

A Tabs mini-app is your HTTPS webapp running in Tabs' Android WebView. You host
the page, APIs and any AppView/indexer you need. Tabs supplies public identity,
permission-controlled publication to the user's PDS, native chat opening and
native payment review through `window.host`. The App Store lists your reviewed
URL and permission manifest. Using Tabs' shared AppView is optional.

This is the public portable developer kit, version 0.1.0, bridge V1. The browser
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

The full developer kit and examples are also available as the tagged GitHub
release `v0.1.0`. Install from GitHub with
`npm install github:tabschat-at/miniapp-sdk#v0.1.0` if preferred.

## Start here

With Node 24.12+ (24.x):

```sh
npm run check
npm run dev
# Open http://127.0.0.1:4173 in your desktop browser.
npm run validate -- examples/recipe-notebook
```

The preview is explicitly a fixture. It offers granted and denied permissions,
uses fake identities, keeps publications in memory, and always cancels payments.
It never connects to a real account. You do not need to install dependencies for
these commands. The optional own-AppView example installs its own dependencies.

## Contents

| Location                                               | What it provides                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [src/](src/)                                           | Browser ES module helpers and standalone TypeScript declarations |
| [docs/quickstart.md](docs/quickstart.md)               | Copy, develop, host and register a webapp                        |
| [docs/api.md](docs/api.md)                             | Every bridge method, inputs, results and errors                  |
| [docs/permissions.md](docs/permissions.md)             | Reusable permissions, consent and revocation                     |
| [docs/manifest.md](docs/manifest.md)                   | Complete manifest and Lexicon package contract                   |
| [docs/backends.md](docs/backends.md)                   | Your own backend/indexer and identity boundaries                 |
| [docs/tabs-appview.md](docs/tabs-appview.md)           | Optional shared AppView, query examples and server load          |
| [docs/testing.md](docs/testing.md)                     | Local fixtures, types, device acceptance and troubleshooting     |
| [docs/publishing.md](docs/publishing.md)               | Hosting, review, updates and current App Store submission        |
| [examples/hello-tabs/](examples/hello-tabs/)           | Minimal public identity app                                      |
| [examples/recipe-notebook/](examples/recipe-notebook/) | Public create/update/delete plus a developer-owned feed          |
| [examples/native-actions/](examples/native-actions/)   | Explicit chat and payment buttons                                |
| [examples/own-appview/](examples/own-appview/)         | Token-free, signature-verifying PDS indexer and recipe API       |
| [examples/tabs-appview/](examples/tabs-appview/)       | Optional SDK query and cached server-side shared-AppView reads   |
| [dev/](dev/)                                           | Clearly marked local browser preview and mock host               |
| [tools/](tools/)                                       | Dependency-free manifest preflight and kit checks                |
| [reference/bridge.js](reference/bridge.js)             | Exact host-injected bridge source, for reference only            |

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
[backend contract](docs/backends.md) and [Spark interoperability assessment](docs/spark-interop.md)
explain how developers own their services and where ATProto delegation is separate.

Download the portable source kit from
[GitHub Releases](https://github.com/tabschat-at/miniapp-sdk/releases).
Maintainers should follow [the release guide](RELEASING.md).

## Submit your app

Run local validation, host your app over HTTPS, and open an
[app submission](https://github.com/tabschat-at/miniapp-sdk/issues/new?template=app-submission.yml).
Include your public manifest, required Lexicons and requested capabilities. The
issue is public; never attach credentials or private ownership-verification
proofs. Operator review and publisher-domain verification are required before a
listing appears in Tabs. There is no automatic approval or public sideload flow.

PDS media publishing on host 0.0.52 uses [the universal blob API](docs/atproto-media.md).
