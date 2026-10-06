# Build your app. Bring it to Tabs.

A Tabs mini-app is an HTTPS web app you host. Tabs provides public identity,
permission-controlled ATProto publishing, verified app sign-in, and native chat
and payment review. You own your UI and backend.

**Developer preview · Android · Bridge V1 · SDK 0.1.0**

[Start building](../docs/quickstart.md) ·
[Browse the SDK](https://github.com/tabschat-at/miniapp-sdk) ·
[Download the kit](https://github.com/tabschat-at/miniapp-sdk/releases)

## Your first app, running locally

```sh
git clone https://github.com/tabschat-at/miniapp-sdk.git
cd miniapp-sdk
npm run dev
```

Open `http://127.0.0.1:4173` and try Hello Tabs. The preview needs no account or
dependency installation. It uses fake identities and in-memory records; payment
requests always cancel. Real login, uploads and native actions need a reviewed
app running in Tabs.

## Start small, add the capabilities you need

| Build with                              | Learn how                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Public identity and permission handling | [Hello Tabs](../examples/hello-tabs/index.html) and [permissions](../docs/permissions.md)             |
| Public app records and your own feed    | [Recipe Notebook](../examples/recipe-notebook/index.html) and [manifest schemas](../docs/manifest.md) |
| Verified login and private file uploads | [Own backend example](../examples/own-backend/README.md)                                              |
| Native chat and payment review          | [Native actions example](../examples/native-actions/index.html) and [API reference](../docs/api.md)   |
| Your own signed-record indexer          | [Own AppView example](../examples/own-appview/README.md)                                              |
| Optional shared public queries          | [Tabs AppView](../docs/tabs-appview.md)                                                               |

The runtime is a dependency-free ES module with bundled TypeScript declarations.
Use any web framework or plain HTML and JavaScript. The npm package is
`@tabschat/miniapp-sdk`; its first npm publication is pending authentication.
Until then, a bundler can install the tagged GitHub release:

```sh
npm install github:tabschat-at/miniapp-sdk#v0.1.0
```

```js
import { getHost, describeError } from "@tabschat/miniapp-sdk";

button.onclick = async () => {
  try {
    const person = await getHost().identity.getSelf();
    result.textContent = `@${person.handle}`;
  } catch (error) {
    result.textContent = describeError(error);
  }
};
```

## From preview to a Tabs listing

Host your app over HTTPS, validate the manifest, and
[submit it for review](https://github.com/tabschat-at/miniapp-sdk/issues/new?template=app-submission.yml).
Include your public entrypoint, manifest, Lexicons and requested capabilities.
Operator review and domain verification are required; there is no automatic
approval or public sideload flow. Users choose which permissions to grant.

Check [host compatibility](../docs/compatibility.md) before depending on a feature.
Android is supported; iOS is deferred. This is a developer preview with no
production SLA or promised review timeline.

## Open SDK, focused scope

The SDK, examples and these docs are published under AGPL-3.0-only. See the
[license](https://github.com/tabschat-at/miniapp-sdk/blob/main/LICENSE) and
[release notes](../CHANGELOG.md). The public repository contains the developer
kit; Tabs application implementation is maintained separately.
