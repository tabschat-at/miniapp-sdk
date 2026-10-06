# From a page to a Tabs app

1. Clone `https://github.com/tabschat-at/miniapp-sdk.git` and run `npm run dev`
   from its root. Open the preview link for
   Hello Tabs, then its permissions-denied variant.
2. Copy `examples/hello-tabs`, `examples/shared` and `src` into your publisher's
   static site, retaining this layout while trying the example. Replace its app ID,
   name and entrypoint in `manifest.json` with your domain and page URL.
3. Add only the permissions you use. Implement an ordinary page with buttons,
   `window.host` calls and your own `fetch` requests. Handle denial gracefully.
4. Host the page at a stable HTTPS URL with valid TLS and no entrypoint redirect.
   For another API or asset origin, declare the exact HTTPS origin in
   `networkAccess`; the API must also permit your publisher origin through CORS.
5. Run `npm run validate -- /path/to/app-package`. Send the manifest and any
   Lexicons using the [app submission form](https://github.com/tabschat-at/miniapp-sdk/issues/new?template=app-submission.yml).
   Local preflight is not registration. Submissions are public; include no credentials.
6. After approval, open the listing inside Tabs. Accept or decline the first-visit
   sheet and check native behavior on a real device.

The preview server is HTTP on loopback for desktop development only. An installed
Tabs host accepts reviewed HTTPS entrypoints; it does not load the localhost mock.
There is currently no user-accessible sideload URL flow or automatic registration
endpoint. Host approval is required even for a webapp asking for no capabilities.

With a bundler, install the SDK package instead of copying `src`:

```sh
npm install @tabschat/miniapp-sdk
```

```ts
import { getHost, type HostBridgeV1 } from "@tabschat/miniapp-sdk";
const host: HostBridgeV1 = getHost(window);
```

TypeScript definitions are bundled; a plain browser can use the ES module
directly. The full developer kit and examples are available from the GitHub
repository and release download. Deploy
the runtime and your page assets, not `dev/`, tests, server code or mock injection.

The recipe example's `/api/recipes` must be supplied by your own backend/reverse
proxy in production. Its browser preview feed is a separate fixture and does not
reflect mock publications. A usable verified backend is included in
[own-appview](../examples/own-appview/README.md).

If you install the package in your app, validate its manifest with
`npx tabs-miniapp-validate /path/to/app-package`. Full preview examples are in the
GitHub kit; they are not bundled into the runtime npm package.
