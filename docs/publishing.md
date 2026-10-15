# Hosting, review and App Store listing

Host ordinary HTML/JS/CSS over HTTPS. Serve the exact entrypoint with a 200 response
and valid TLS; main-frame redirects fail closed. Main-frame navigation stays under
the approved origin and entrypoint directory. Build a single-page app or keep
GET-only navigation inside that directory. The host limits main-frame HTML to
2 MiB, injects the bridge only into the top frame and enforces a network CSP.

Cookies/DOM storage are isolated per account/app. HTTPS requests to the publisher
and declared origins remain subject to browser CORS. Frames, service/web workers,
automatic popups, JavaScript alert/confirm/prompt, file/content URLs, downloads, live camera streams,
microphone and location requests are blocked. Use DOM dialogs and inline messages.
Payment/chat integration uses the named bridge methods, not device/browser APIs.
Host 0.0.53 supports ordinary user-clicked HTTP(S) links: links outside the app's
entrypoint directory open in the user's browser; `target="_blank"` links always
open there. Use `rel="noopener noreferrer"`. This is universal browser behavior,
with no bridge method, new permission, or per-app integration. Call programmatic
link opening synchronously from a click handler, before awaiting network work.
Automatic/redirect-driven browser launches, non-web schemes, embedded windows,
and credential-bearing URLs remain blocked. Browser pages receive no Tabs bridge
or host credentials, and returning to Tabs preserves the miniapp's page.
External link destinations do not need `networkAccess`; fetched resources do.
Keep profiles, threads and image viewers inside your app when appropriate.
Test real provider flows instead of assuming full-browser behavior.

For example, this works in Tabs and in a standalone browser:

```html
<a href="https://example.org/article" target="_blank" rel="noopener noreferrer"
  >Read article</a
>
```

Declare `minimumHostVersion: "0.0.53"` if your app depends on this behavior.
A browser's ordinary Back/return action takes the user back to the miniapp.

On Android host 0.0.56+, phone Back and toolbar Back first consume the miniapp's
web history. Use `history.pushState()` for an internal page or dismissible panel
and `popstate` to restore its prior UI. A modal's Close button should consume its
own history entry with `history.back()`. Always provide an explicit Close action
for older hosts. This needs no bridge permission and keeps the existing document
navigation restrictions.

## Submit the app

Open the [app submission tool](/submit/) and enter your exact public HTTPS
entrypoint. Add these links in your app's HTML **head**, then deploy the generated
files alongside your app:

```html
<link rel="tabs-manifest" href="./manifest.json" />
<link rel="tabs-package" href="./app-package.json" />
<link rel="icon" href="./icon.png" />
```

The [package builder](/tools/package-builder/) generates the manifest, complete
Lexicon dependency set, portable package and discovery snippet. Keep manifest.json
and the package synchronized. Discovery also supports conventional manifest.json
and lexicons/<collection>.json paths, but explicit links are recommended.

The submission tool fetches public metadata, validates the manifest and schemas,
and shows requested permissions, collections, payment assets and network origins.
Resolve validation issues, review the package, then provide your developer name,
contact email and store description. Optionally add up to eight screenshots using
uploads, public HTTPS image links, or both. PNG, JPEG and WebP files up to 10 MB
each are optimized for upload automatically. Preview and remove images before
submitting. Uploaded artwork is hosted by Tabs; linked images stay on your host
and must remain publicly accessible. Screenshots are public store artwork and
must not contain private user data. Reviewers can keep or adjust the screenshots
before publishing the listing. An identical pending package keeps its original
details and screenshots; another submission does not replace that snapshot.
To create images, use the camera button in the [host simulator](/tools/simulator/),
choose the simulator tab in your browser's capture prompt, then select **Download
PNG**. Change the selected phone, rotate it or fold/unfold it to capture another
screen size. The screenshot includes Tabs host UI and exports at the selected
device's panel resolution; Custom viewport exports CSS screen dimensions.
Contact information is only visible to Tabs
reviewers. Save the submission reference; email notifications are not available yet.
The package is fetched again before submission so changes cannot bypass validation.
Localhost apps use the downloaded simulator; submission requires a public URL.

A valid package enters the management dashboard's **App review** queue. The operator
reviews the saved manifest and Lexicons, verifies publisher ownership separately,
checks app behavior and public-data privacy, and selects **Approve & publish**.
Approval registers the reviewed schemas and App Store listing in one database
transaction. Rejection requires a review reason. Submission alone never publishes
an app or grants a user's permissions. GitHub issues are no longer required.

API, PDS and AppView refresh the shared schema registry live; publishing an app
needs no backend deployment or Flutter rebuild. The App Store editor remains
available for operator-managed listings. Developer contact fields are unverified
until the operator confirms ownership; they are not proof of publisher identity.

New definitions must use the app ID's namespace (for example,
`org.example.recipes.recipe` for app `org.example.recipes`). Include all schema
references or reuse existing registered definitions unchanged. Existing Lexicon
IDs are immutable, and protected account, chat and wallet namespaces cannot be
registered for app writes. A WebView cannot register schemas or grant itself
permissions; operator review and user consent remain separate requirements.

Inside the Tabs implementation repository, `npm run miniapp:register --
/path/to/reviewed/app-package` remains useful for JSON-only preflight. Its
`--approve` option updates source registries for bundled apps; live dashboard
publication is the normal deployment workflow. Developer pages and APIs can be
hosted independently of Tabs.

## Updates

Increase the manifest version for reviewed updates. HTML/JS/CSS changes within
the approved authority need no Android rebuild. Added permissions/collections,
changed schema policy or network/publisher authority require review and renewed
consent. Existing schema definitions cannot silently change through registration.
Use a new versioned collection or arrange a migration review.

The SDK is distributed as `@tabschat/miniapp-sdk` on npm; the full kit and examples
are available in the public GitHub repository. Review intake is through the developer site; approval and registration remain manual. This developer preview does not
promise unrestricted web features, custom shared-AppView queries or production SLA.

Source manifests seed missing catalog entries once; they never overwrite dashboard edits. Publish a reviewed newer manifest through the dashboard when updating an existing app. Store presentation metadata is separate from the bridge manifest.
