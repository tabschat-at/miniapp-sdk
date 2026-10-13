# Permissions and user consent

| Permission              | What it allows                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `identity.authenticate` | Sign in to a declared backend with an app/audience/challenge-bound identity proof                   |
| `blobs.upload`          | Upload media to the active user’s PDS for a declared write collection (host 0.0.52+)                |
| `files.select`          | Use only files/photos confirmed in the system picker or camera, with permission rechecked on return |
| `identity.basic`        | Read the current user's public identity                                                             |
| `social.public.read`    | Resolve a public handle to its verified DID                                                         |
| `records.read`          | Query Tabs' index for the exact declared read collections                                           |
| `records.write`         | Publish/update/delete this app's public records in the exact declared write collections             |
| `payments.request`      | Resolve payment recipients and request native payment review                                        |
| `wallet.connect`        | Share the current Sui mainnet address with this app after connection approval (host 0.0.74+, advanced mode) |
| `wallet.transactions`   | Request reviewed Sui PTB signatures or execution; requires `wallet.connect` and a fresh passkey |
| `wallet.messages`       | Request readable UTF-8 personal-message signatures; requires `wallet.connect` and a fresh passkey |
| `chat.openConversation` | Request native conversation UI                                                                      |

These are reusable capabilities. Recipes, scores and votes belong in schemas and
the developer's `recordPurpose`, not in permission names. Publishing adds an
app-specific public record to the user's repository; it does not edit their
account name/avatar or grant access to another app's records.

On first visit Tabs shows one bottom sheet for the entire requested set. Allow or
deny is remembered per account/app until the user changes it or the approved
policy changes. A denied app can still render its page and read its own public
backend. Privileged calls reject without repeated prompts. Users control access
through Tabs App permissions; apps cannot manufacture approval or revoke other
apps' grants. There is currently no bridge method to enumerate/request grants.

New capabilities, collections, schema/dependency changes, payment assets, network
origins, purpose or entrypoint require a new review. Cosmetic name/version updates
do not. This permission sheet never replaces explicit per-payment review/passkey.

Declared network origins allow ordinary browser requests subject to CSP and CORS.
They do not give your backend a Tabs token, authenticated session or permission
to act as a user. Declare assets/CDNs as well as APIs when hosted on another origin.
Prefer serving scripts from your own publisher because approved external script
origins can execute in the page and exercise its granted capabilities.

Revocation blocks future privileged operations and live grants. It cannot undo a
public record already published or a transaction already submitted. Public record
deletion removes it from the source/current index after refresh; other readers
may have retained earlier copies. Explain public visibility before publishing.

Login and file selection require host 0.0.51+. Public-profile permission alone
cannot authenticate a backend. Selected files may be uploaded to the app's declared
origins, which means granting selection allows that app to receive chosen file
contents. Host 0.0.64+ can also return one photo explicitly taken and confirmed
in the system camera through an image capture input. Live camera/microphone
streams and broad filesystem access remain blocked. See
[backends](backends.md) for the token, upload and temporary-file contract.

`blobs.upload` is separate from file selection and requires `records.write`.
It grants public protocol media upload; apps can still own private media services.
See [ATProto media](atproto-media.md).

Wallet permissions require `minimumHostVersion: "0.0.74"` or later and advanced features enabled. They are separate from the USDC-only `payments.request` capability. Connection shares a public address and enables the app to query public assets/activity through its declared network origins. Disconnecting or disabling advanced features blocks future signatures. It cannot revoke a signature already released; a sign-only authorization remains pending until confirmed or its on-chain epoch expiry is proven. Transaction review and personal-message review always precede fresh passkey approval.
