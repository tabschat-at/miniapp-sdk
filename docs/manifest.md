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
package scripts. The standalone `npm run validate -- /app-package` is a structural
preflight; it does not fully compile/validate Lexicons, verify domain ownership,
check website behavior, consult deployed shared schemas or approve the app. Its
self-contained packages must include declared record schemas. The operator uses
the authoritative registry and official Lexicon validation during review.

Manifests using `identity.authenticate` or `files.select` must specify
`minimumHostVersion` of at least `0.0.51`. Each is an independent, reviewed user
grant. Add your backend's exact HTTPS origin to `networkAccess` if it differs from
the entrypoint origin. Backend login proof audiences are limited to those origins.
The [own-backend manifest](../examples/own-backend/manifest.json) needs no public
record permissions or schema registration.
