# Build with an AI coding agent

Use this prompt with an AI coding agent working in your application's repository.
It covers adapting an existing app as well as building a new one. Replace the
bracketed details, then use **Copy prompt** to copy the entire brief.

Describe the experience you want inside Tabs, the domain you control, and which
data should be public. If you do not know a value yet, leave it for the agent to
identify. The agent should inspect your app before choosing permissions or
introducing a backend.

## Copy this prompt

```prompt
Make my application compatible with Tabs as a miniapp. Work in this repository
and preserve its existing framework, useful features, and standalone behavior.

My app: [name and what it does]
Target experience: [features users should have inside Tabs]
Publisher domain and entrypoint: [HTTPS URL I control, or undecided]
Backend and other service origins: [URLs, or none/undecided]
Public data: [what users may publish to their public ATProto repositories]
Private data: [what must remain in my own backend]

Read these sources before implementation, following their relevant examples:
- Start: https://developers.tabschat.com/docs/quickstart/
- Supported versions: https://developers.tabschat.com/docs/compatibility/
- Manifest and Lexicons: https://developers.tabschat.com/docs/manifest/
- Permissions: https://developers.tabschat.com/docs/permissions/
- Bridge API: https://developers.tabschat.com/docs/api/
- Backend authentication: https://developers.tabschat.com/docs/backends/
- Public media: https://developers.tabschat.com/docs/atproto-media/
- Hosting and sandbox: https://developers.tabschat.com/docs/publishing/
- Testing: https://developers.tabschat.com/docs/testing/
- SDK source and examples: https://github.com/tabschat-at/miniapp-sdk

If a docs URL is blocked, read the corresponding Markdown under docs/ in the
public SDK repository. If neither source is accessible, say so and request the
missing contract instead of inventing it. Inspect the installed SDK's types and actual exports. Use the
published API, not a simulator-only feature or a proposed integration. The SDK
and Tabs host have separate versions; choose a compatible minimum host version.

1. Inspect and plan
Identify the framework, build output, navigation, authentication, APIs, storage,
media, and dependencies on browser features. Explain the smallest compatibility
changes and any unsupported requirements. Ask only for missing decisions that
affect identity, domains, public/private data, or the user experience. Do not
replace my stack or introduce a backend unless the feature needs it.

2. Integrate the host
Use @tabschat/miniapp-sdk, or its documented browser ES module when there is no
bundler. Tabs injects window.host; getHost() reads it.
For hosted simulator compatibility, load SDK 0.2.0 bootstrap before app startup:
import "@tabschat/miniapp-sdk/bootstrap";
Or load https://developers.tabschat.com/sdk/0.2.0/bootstrap.js before app scripts.
This preserves native Tabs and standalone behavior. Allow framing by
https://developers.tabschat.com and declare the bootstrap origin in networkAccess
when using the hosted script. Simulated users remain the default. Approved apps
may opt into real passkey login, genuine assertions and real record operations.
Warn that live actions affect production data. Native-only capabilities reject.
The optional host.environment.mode is a UI hint, never server authentication. Never ship mock-host
injection or a replacement native bridge in the production app. Catch
HOST_UNAVAILABLE outside Tabs and keep a useful standalone or open-in-Tabs state.
Use describeError for safe user-facing failures. Serialize privileged actions,
disable repeated submissions, and handle denial, cancellation, backgrounding,
account changes, and uncertain results without automatic duplicate writes.

3. Create the complete V1 manifest
Provide manifest.json with exactly these fields, retaining empty lists/strings:
{
  "v": 1,
  "id": "org.example.myapp",
  "version": "1.0.0",
  "name": "My App",
  "entrypoint": "https://myapp.example.org/index.html",
  "permissions": [],
  "collections": [],
  "readCollections": [],
  "recordPurpose": "",
  "allowedPaymentAssets": [],
  "minimumHostVersion": "0.0.16",
  "networkAccess": []
}
Replace the example identity and URL with my actual choices; do not guess domain
ownership. The app ID is a lowercase reversed-domain name. The entrypoint must
serve HTTPS with status 200, valid TLS, no redirect, credentials, query or fragment.
Set minimumHostVersion to the highest minimum required by the selected features.
Keep writes in collections and SDK queries in readCollections; each list must
match its requested permission. Set a short, accurate public recordPurpose.
Use exact HTTPS origins in networkAccess for every external API, script, image,
font and CDN fetched by the page. Origins have no path or trailing slash. The
publisher origin is already allowed. Configure CORS separately on my services;
do not add protected Tabs API/auth/PDS origins or expose server credentials.
An icon or PWA manifest does not add fields to the Tabs V1 manifest.
Put discovery links in the app's HTML head (adjust relative paths as needed):
<link rel="tabs-manifest" href="./manifest.json">
<link rel="tabs-package" href="./app-package.json">
<link rel="icon" href="./icon.png">
Use https://developers.tabschat.com/tools/package-builder/ to generate a portable
app-package.json containing {v:1, manifest, lexicons}, including all Lexicon
references. Deploy the package and individual files together; keep them synchronized.
The hosted simulator and URL submission tool discover these head links automatically.
Use the downloaded simulator for localhost apps.

4. Request only necessary permissions
Map each requested capability to a real feature and document why it is needed:
- identity.basic: current user's public DID, handle, display name and avatar.
- social.public.read: resolve a public handle to its verified DID.
- identity.authenticate: challenge-bound proof for my own backend's login.
- records.write: create/update/delete this app's public records in approved
  collections; it does not grant access to another app's records.
- records.read: query declared collections through Tabs' optional shared AppView.
- files.select: files explicitly chosen through the system picker.
- blobs.upload: public PDS media for a declared write collection; also requires
  records.write. Add files.select when using the picker.
- payments.request: USDC recipient resolution and native payment review.
- chat.openConversation: open native conversation UI for a recipient DID.
Check the current permissions/API pages for additions and their host minimums.
Do not invent permission names. Tabs owns the first-visit consent sheet; handle
remembered denial gracefully. Never loop permission prompts or bypass native
payment confirmation. The public identity returned after consent is not a
backend login proof, and an app that needs only public identity does not need
an additional sign-in form.

5. Define custom Lexicons only for public protocol data
If the app publishes or queries ATProto records, include lexicons/<id>.json for
each declared collection and every referenced dependency. Use my reversed-domain
namespace, lexicon: 1, the exact collection id, and a main record definition with
an object schema. Define required fields, types, length/array bounds and refs.
Keep record $type equal to the approved collection ID; send no undeclared fields.
Use the recipe-notebook example as a schema/package reference. Reuse reviewed
shared schemas unchanged; do not silently change their meanings. Plan a reviewed
migration or new collection when a schema changes. Respect host record limits.
Do not write protected account, profile, chat, wallet or recovery collections.
Lexicons are reviewed/registered by the operator; sending a schema at runtime
does not register it. Omit Lexicons if my app needs no protocol records.
Never put secrets, private messages, session tokens or private game state in
public records. Use my own backend for private data. Retain returned record
references, use complete replacements for updates, and reconcile ambiguous
publication results before retrying. Account for asynchronous index refresh.
My own backend/AppView is allowed; Tabs' shared AppView is optional and has a
fixed query contract, not arbitrary application queries.

6. Make the experience work on mobile
Build a responsive, touch-first UI for Android's embedded WebView. Test narrow
320-480 CSS-pixel widths, larger/foldable screens, portrait/landscape, larger text
and the on-screen keyboard. Use the viewport meta tag, flexible layouts and
safe-area insets where relevant. Avoid horizontal page overflow, hover-only
controls and tiny tap targets; aim for at least 44 by 44 CSS pixels. Keep forms,
primary actions, loading/error/empty states and dialogs usable when the keyboard
is open. Preserve readable contrast, semantic labels and keyboard focus.
Use DOM dialogs instead of alert/confirm/prompt. Keep internal navigation under
the approved origin and entrypoint directory; configure build asset base paths
and server routes accordingly. Integrate history/popstate for internal views
and dismissible panels, with explicit Close actions. Respect Tabs' Back behavior.

7. Respect the sandbox and own the backend boundaries
Do not depend on iframes, service/web workers, automatic popups, arbitrary
downloads, non-web URL schemes, live camera/microphone/location or broad file
access. Third-party cookies are disabled. Use declared HTTPS services and the
documented user-triggered external HTTP(S) link behavior. A clicked browser link
is different from fetching its resources inside the miniapp.
For backend login, use identity.authenticate and the documented one-use challenge
flow. Verify issuer, audience, app ID, nonce, signature and expiry on my server;
then issue my own app session. Keep server/auth helpers on the server. Key users
by verified DID, not a mutable handle. Never forward Tabs account tokens or treat
an identity assertion as PDS/OAuth/service delegation.
For file uploads, call the picker directly from a click and treat File contents
as untrusted. Private uploads go to my declared backend. Public PDS uploads use
blobs.upload and approved Lexicon blob references. Uploading and publishing a
record are separate actions; a private backend URL is not a protocol blob ref.

8. Handle native actions only when supported
For payments, resolve and retain the recipient DID, use decimal strings for
USDC, let Tabs perform review, and handle cancellation/pending/failed/expired
results. My backend must independently verify settlement for paid fulfilment;
never automatically charge again after a timeout. Keep funded tests manual.
chat.openConversation provides no chat history or message-send capability.
Do not promise chat sharing, miniapp deep links or game-invite APIs unless the
published SDK and host explicitly support them. Private multiplayer state,
lobby capacity, invite expiry and joining authorization belong to my backend.

9. Validate and hand off
Run my app's existing build/checks. Run the installed tabs-miniapp-validate
against the directory containing manifest.json and lexicons/ (if used). In a
cloned SDK, use npm run validate -- /path/to/my-app-package. This is local
preflight, not operator approval; follow the manifest guide for schema review.
Use the SDK's documented local preview for fixtures; keep fixture identity,
records, payments and mock transport out of production. Test the actual app on
Android for consent, CORS, file selection, navigation, account/background changes
and cancellation. Clearly distinguish checks you ran from device checks still
needed. Android is supported; do not claim iOS support from browser testing.

Deliver the compatible app, manifest.json, required Lexicons, an explanation of
permissions and external origins, and concise build/deploy/test instructions.
Include remaining blockers, operator review items and the URL submission tool at
https://developers.tabschat.com/submit/ to submit the deployed
HTTPS app at https://developers.tabschat.com/submit/.
Public submissions must contain no credentials or private verification material.
Do not submit, deploy, publish records or make payments without my authorization.
```

## References to give your agent

| Topic                                                                                          | What the agent should check                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Manifest and custom Lexicons](manifest.md)                                                    | Exact fields, collection scope, schema dependencies and registration  |
| [Permissions](permissions.md) and [bridge API](api.md)                                         | Supported methods, user consent, errors and native-action limits      |
| [Host compatibility](compatibility.md)                                                         | Feature minimums and the difference between SDK and host versions     |
| [Hosting and sandbox](publishing.md)                                                           | HTTPS, asset origins, navigation, browser restrictions and submission |
| [Backend sign-in](backends.md)                                                                 | Verified identity, app-owned sessions, CORS and selected files        |
| [ATProto media](atproto-media.md)                                                              | Public PDS blob references and limits                                 |
| [Shared AppView](tabs-appview.md) and [own AppView example](../examples/own-appview/README.md) | Optional public indexing and app-owned query APIs                     |
| [Recipe Notebook](../examples/recipe-notebook/)                                                | A complete manifest, custom Lexicon and public record flow            |
| [Testing](testing.md)                                                                          | Fixture boundaries, denial handling and real Android acceptance       |

## Review the result

Check that the manifest requests only features your app uses, every external
origin is intentional, and the public/private data boundary matches your product.
Ask the agent to show build and validation results and label any remaining device
checks. Local validation and an AI agent's assessment do not replace operator
review or testing the deployed app inside Tabs.
