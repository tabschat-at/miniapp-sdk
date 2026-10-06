# Bridge V1 API

`getHost()` returns the injected `window.host` or throws `HOST_UNAVAILABLE` outside
Tabs. Every method returns a promise. Serialize calls: the native broker handles
one privileged operation at a time. The browser bridge allows up to eight pending
requests, 256 calls per visit and 64 KiB per transport envelope, with a five-minute
response timeout. On host 0.0.62+, the native host renews a thirty-minute server lease every five
minutes while foregrounded, and revalidates it on resume. Active visits have no
fixed time limit. Closing disables the local bridge and revokes the lease;
abandoned leases expire. Renewal preserves consent, replay history and budgets. Backgrounding and navigation may invalidate late results.

| Method                           | Input                                  | Result                                           | Permission              |
| -------------------------------- | -------------------------------------- | ------------------------------------------------ | ----------------------- |
| `auth.getAssertion(input)`       | `{audience, nonce}`                    | `{token, issuer, expiresAt}`                     | `identity.authenticate` |
| `identity.getSelf()`             | None                                   | `{did, handle, displayName, avatar, appId}`      | `identity.basic`        |
| `identity.resolveHandle(handle)` | Handle string                          | `{did, handle}`                                  | `social.public.read`    |
| `records.create(input)`          | `{collection, value}`                  | `{uri, cid}`                                     | `records.write`         |
| `records.update(input)`          | `{collection, rkey, value}`            | `{uri, cid}`                                     | `records.write`         |
| `records.delete(input)`          | `{collection, rkey}`                   | Empty completion (current host returns `null`)   | `records.write`         |
| `publicData.query(input)`        | `{collection, query?}`                 | `{records, nextCursor}`                          | `records.read`          |
| `payments.resolve(handle)`       | Handle string                          | `{did, handle, displayName, avatar, canReceive}` | `payments.request`      |
| `payments.request(input)`        | `{recipientDid, asset, amount, memo?}` | Payment result below                             | `payments.request`      |
| `chat.openConversation(input)`   | `{recipientDid}`                       | Empty completion (current host returns `null`)   | `chat.openConversation` |

Identity supplies the public profile display name and avatar URL, falling back to
the handle when no display name is set. Avatars are public PDS blobs. DIDs use
`did:plc:` followed by 24 base32 characters. Public identity is not a signed login
proof for your backend; see [backends](backends.md).

## Public records

The collection must be declared in `collections` for writes or `readCollections`
for SDK reads. A record's `$type` must equal the collection ID; the body must match
the approved Lexicon. Records are bounded to 16 KiB JSON, 2,048 nodes and depth 16;
unknown fields, NUL strings and unsafe numbers are rejected. Blob/media upload is
not available through this API.

Create assigns an app-owned key. Use `recordKey(result.uri, collection)` to extract
it. Update sends the complete replacement record, not a patch. Update/delete may
target only records created by this app for this account. Your own AppView cannot
infer this private ownership from a public record alone. Keep returned references
for convenient editing, and plan for cache loss or a new device. There is no bridge
ownership-history enumeration API yet.

```js
const saved = await host.records.create({
  collection: "org.example.recipes.recipe",
  value: {
    $type: "org.example.recipes.recipe",
    title: "Soup",
    ingredients: [{ name: "Carrot", quantity: 2 }],
  },
});
await host.records.update({
  collection: "org.example.recipes.recipe",
  rkey: recordKey(saved.uri, "org.example.recipes.recipe"),
  value: {
    $type: "org.example.recipes.recipe",
    title: "New soup",
    ingredients: [],
  },
});
```

`publicData.query` uses Tabs' shared AppView. Optional `query` keys are `author`
(DID), `limit` and `cursor` (decimal **strings**, default `"30"` and `"0"`). Limit
is 1–100, cursor is 0–100000. Each result is `{uri, cid, author: {did, handle},
record, publishedAt}`. `publishedAt` is the index's first-seen time for generic
records. `nextCursor` is a string or null. Public index refresh is asynchronous;
offset pagination can shift during writes. Your own API can use a different query
contract. See [shared AppView](tabs-appview.md).

## Native actions

Only USDC is currently supported. Amount is a positive decimal string with at
most six fractional digits and a maximum of 18446744073709.551615 USDC (the native
u64 unit bound). Never calculate currency with floating-point arithmetic. Memo,
if supplied, is nonempty and at most 280 UTF-8 bytes. Resolve the recipient first
and retain the DID rather than substituting an unverified handle/address.

```js
const person = await host.payments.resolve("bob.tabschat.com");
const result = await host.payments.request({
  recipientDid: person.did,
  asset: "USDC",
  amount: "0.01",
});
```

Results are `{status: 'sent', digest}`, `{status: 'cancelled'}`, or
`{status: 'pending' | 'failed' | 'expired'}`. Every new transaction gets native
amount/recipient confirmation and a fresh passkey, regardless of saved mini-app
consent or chat login. A timeout or pending/failed/expired result is not proof of
payment. Direct the user to Tabs to check the transaction; do not automatically
issue another request. A fulfilment backend must verify settlement independently;
JavaScript responses are not a backend payment proof. The page receives no wallet
address, signing key, transaction bytes or Tabs account token.

`chat.openConversation({recipientDid})` opens native UI. It provides no message
history, message-send API, voice/camera access or conversation keys.

## Errors and uncertain writes

Rejected promises have a fixed `error.code`. Use `describeError(error)` for safe
copy; unknown codes need a generic fallback.

| Code                             | Suggested handling                                                    |
| -------------------------------- | --------------------------------------------------------------------- |
| `HOST_UNAVAILABLE`               | Open in Tabs, or use the explicitly marked browser preview            |
| `PERMISSION_DENIED`, `FORBIDDEN` | Show a disabled feature; point to App permissions; never loop prompts |
| `UNAUTHORIZED`                   | Reopen the app; the visit/account may no longer be active             |
| `INVALID_INPUT`                  | Correct the data or manifest scope                                    |
| `NOT_FOUND`                      | Handle missing/deleted records or unavailable recipients              |
| `BUSY`                           | Wait for the current native action                                    |
| `RATE_LIMITED`                   | Back off; reopening may be needed for visit limits                    |
| `CONFLICT`, `REPLAY`             | Refresh/reconcile; do not change and replay an uncertain write        |
| `TIMEOUT`, `PAYMENT_PENDING`     | Check Tabs and reconcile before another payment/write                 |
| `UNAVAILABLE` or unknown         | Offer a later retry; do not expose raw error bodies                   |

Each new SDK invocation receives a new operation ID. The host can retry the same
transport operation idempotently, but a developer calling `records.create` again
creates a new operation and can create a duplicate. Persist a pending UI state,
refresh public data and reconcile ambiguous outcomes instead of blindly retrying.

## Developer login and files

`auth.getAssertion` requires host 0.0.51+, an exact allowed HTTPS backend origin,
and a server-generated base64url nonce of 22–128 characters. Your backend must
verify the proof and consume its own challenge once. Do not treat the public
identity API as authentication. The SDK's `signInWithTabs` helper implements the
example `/auth/challenge` and `/auth/session` protocol; the session it returns is
your app's own credential. Server verification helpers live under
`@tabschat/miniapp-sdk/server/auth` and must run in the developer backend.

`files.select` enables ordinary `<input type="file">`; it has no bridge method
for arbitrary paths. SDK `selectFiles({accept, multiple})` opens a normal input
and returns `File[]` (or `[]` on cancellation). Invoke it directly in a click
handler, then upload through fetch/FormData. The native picker has its own
foreground-return validation; ordinary late bridge results still follow the
background/navigation cancellation rules above. See [the complete flow and
limits](backends.md) and [the runnable example](../examples/own-backend/README.md).

## PDS blobs (host 0.0.52+)

`host.blobs.upload(fileOrBlob, {collection})` returns a standard ATProto blob reference.
Declare `blobs.upload` and `records.write`, and use a declared write collection.
Binary data uses a single-use HTTPS permit, outside the JSON bridge.
See [media limits and protocol](atproto-media.md).

## Payment fulfilment identity (host 0.0.62+)

An app with both `identity.authenticate` and `payments.request` can request
`auth.getAssertion({audience, nonce, paymentAccount: true})`, or use
`signInWithTabs({backendOrigin, paymentAccount: true})`. The signed assertion
includes `payment_account: {network: "mainnet", senderCommitment}`. The commitment
is SHA-256 of `tabs-miniapp-payment-v1\n<appId>\n<audience>\nmainnet\n<lowercase 0x sender address>`.
The host obtains the address from the active account binding; the app receives
only the scoped commitment. A developer backend independently verifies settlement,
amount, coin type, recipient and the chain sender against this signed commitment.
The commitment is not settlement proof. Retain unique digests and idempotent orders
and reconcile pending transactions before charging again. Missing wallet bindings
return `NOT_FOUND`. Older hosts reject the optional input.
