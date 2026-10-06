# Hosting, review and App Store listing

Host ordinary HTML/JS/CSS over HTTPS. Serve the exact entrypoint with a 200 response
and valid TLS; main-frame redirects fail closed. Main-frame navigation stays under
the approved origin and entrypoint directory. Build a single-page app or keep
GET-only navigation inside that directory. The host limits main-frame HTML to
2 MiB, injects the bridge only into the top frame and enforces a network CSP.

Cookies/DOM storage are isolated per account/app. HTTPS requests to the publisher
and declared origins remain subject to browser CORS. Frames, service/web workers,
automatic popups, JavaScript alert/confirm/prompt, file/content URLs, downloads, camera,
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

Give the Tabs operator your manifest, required Lexicon JSON files, publisher
domain verification, deployed HTTPS URL and a description of the requested
capabilities/network services. The operator reviews domain ownership, page
behavior, public-data privacy and schema bounds. The current App Store has no
public developer submission dashboard, automated approval or developer accounts.
SDK local validation does not add a listing.

Use the public [app submission form](https://github.com/tabschat-at/miniapp-sdk/issues/new?template=app-submission.yml)
to request review. Include the public HTTPS entrypoint, a link to your manifest
and Lexicon package, requested permissions/origins and validation results. GitHub
issues are public: never attach secrets, user data or private ownership proofs.
The operator will arrange publisher verification during review. Submission does
not guarantee acceptance or a response timeline.

The operator uses the management dashboard's App Store listing editor. Enter the
reviewed manifest and, for new collections, a JSON array of the required Lexicon
documents in **Reviewed Lexicons**. Saving validates and registers the schemas and
listing in one database transaction. API, PDS and AppView refresh the shared
registry live; publishing a new app needs no backend deployment or Flutter rebuild.
Apps needing no new schemas can leave the field empty.

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

The SDK and examples are available in the public GitHub repository. The first
npm publication is pending publisher authentication. Review intake is through
GitHub issues; approval and registration remain manual. This developer preview does not
promise unrestricted web features, custom shared-AppView queries or production SLA.

Source manifests seed missing catalog entries once; they never overwrite dashboard edits. Publish a reviewed newer manifest through the dashboard when updating an existing app. Store presentation metadata is separate from the bridge manifest.
