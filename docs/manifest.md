# Manifest and schema package

Every manifest must have exactly these V1 fields, including empty lists/strings:

```json
{
  "v": 1,
  "id": "org.example.recipes",
  "version": "1.0.0",
  "name": "Recipe Notebook",
  "entrypoint": "https://recipes.example.org/examples/recipe-notebook/index.html",
  "permissions": ["records.write"],
  "collections": ["org.example.recipes.recipe"],
  "readCollections": [],
  "recordPurpose": "Publish public recipes; browse through our own recipe API.",
  "allowedPaymentAssets": [],
  "minimumHostVersion": "0.0.16",
  "networkAccess": []
}
```

| Field                           | Rules                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `v`                             | Exactly 1                                                                         |
| `id`                            | Lowercase reversed-domain ID, 3–8 components, maximum 80 characters               |
| `version`, `minimumHostVersion` | Numeric major.minor.patch; updates must increase app version                      |
| `name`                          | Nonblank, maximum 60 characters                                                   |
| `entrypoint`                    | HTTPS URL, maximum 2048 characters, no credentials/query/fragment                 |
| `permissions`                   | Exact reusable capability names, no duplicates or wildcards                       |
| `collections`                   | Exact approved write collection IDs; nonempty iff `records.write` is requested    |
| `readCollections`               | Exact approved SDK query collection IDs; nonempty iff `records.read` is requested |
| `recordPurpose`                 | Developer explanation, maximum 200 characters, no control characters              |
| `allowedPaymentAssets`          | Currently only `USDC`; use `[]` without payments                                  |
| `networkAccess`                 | Exact HTTPS origins for other assets/APIs, without paths or trailing slash        |

Each list has at most 16 entries. The publisher origin is implicitly allowed.
Protected API/auth/PDS origins cannot be added to `networkAccess`. Your own backend
can fetch public PDS data independently. Put your backend origin in the manifest
if it differs from the publisher, for example `https://api.recipes.example.org`.
CORS configuration is still required there.

For public record publication or SDK querying, provide ATProto Lexicon JSON files:

```text
manifest.json
lexicons/
  org.example.recipes.recipe.json
```

The [recipe Lexicon](../examples/recipe-notebook/lexicons/org.example.recipes.recipe.json)
shows a nested definition and reference. Include every referenced dependency.
New definitions use your app's reversed-domain namespace. Shared reviewed schemas
can be reused unchanged; changing an existing schema requires migration review or
a new versioned collection. `com.atproto.*`, account/profile/chat/wallet/recovery
collections are protected. App-supplied schemas in a runtime call are never accepted.

`lexicons/` may be omitted when no schemas are needed. Registration does not run
package scripts. The standalone `npm run validate -- /app-package` validates the
manifest, compiles included Lexicons and checks references. Self-contained packages
must include every declared record schema and dependency. Local checks do not
verify domain ownership, check website behavior, consult deployed shared schemas
or approve the app. The operator still reviews registration and the authoritative
registry.

Manifests using `identity.authenticate` or `files.select` must specify
`minimumHostVersion` of at least `0.0.51`. Each is an independent, reviewed user
grant. Add your backend's exact HTTPS origin to `networkAccess` if it differs from
the entrypoint origin. Backend login proof audiences are limited to those origins.
The [own-backend manifest](../examples/own-backend/manifest.json) needs no public
record permissions or schema registration.

## Build and discover an app package

Open the [app-package builder](/tools/package-builder/), or run `npm run simulator`
from the SDK for the local edition. Select
features, preview first-run permissions, and define collection fields with the
simple Lexicon editor. Advanced JSON supports other Lexicon features; import
reviewed shared schemas unchanged. The ZIP includes the manifest, Lexicons,
portable app-package.json and discovery links. The record scratchpad, simulator
and CLI use the host's official Lexicon library plus Tabs record limits.
Local validation does not register or approve schemas. See the
[developer tools guide](../dev-tools/README.md#app-package-builder).

Serve the package beside your app HTML and add these links in its `<head>`:

```html
<link rel="tabs-manifest" href="./manifest.json" />
<link rel="tabs-package" href="./app-package.json" />
<link rel="icon" href="./icon.png" />
```

Without a portable package, the simulator checks `lexicons/<collection>.json`
beside the manifest and follows references. Missing schemas reject record writes;
import them in the inspector to test older projects. Keep the manifest, individual
Lexicons and portable package synchronized when editing files manually.
Icons are HTML/PWA metadata, not a V1 manifest field. A PWA manifest does not
declare Tabs permissions. The online simulator and [submission tool](/submit/)
discover public HTTPS metadata server-side without requiring CORS. Private and
localhost addresses are unavailable online; use the downloaded simulator for
local development. The online preview still needs your app to allow iframe
embedding and include its development-only simulator bridge. See the tools guide.
