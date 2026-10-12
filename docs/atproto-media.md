# Reusable ATProto media uploads

Host 0.0.52 adds `blobs.upload`. The same method works for every approved app and
registered Lexicon; there is no app-specific media endpoint to implement.
Declare `blobs.upload`, `records.write`, the exact write collections, and
`minimumHostVersion: "0.0.52"`. Add `files.select` if your app uses the system picker.
New access and an entrypoint change require fresh user consent.

```js
const input = document.querySelector("input[type=file]");
const image = await host.blobs.upload(input.files[0], {
  collection: "app.bsky.feed.post",
});
await host.records.create({
  collection: "app.bsky.feed.post",
  value: {
    $type: "app.bsky.feed.post",
    text: "A photo",
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.images",
      images: [{ image, alt: "A description" }],
    },
  },
});
```

The result is the standard JSON ATProto blob reference:
`{$type: 'blob', ref: {$link: '<CID>'}, mimeType, size}`. Use it in the schema's
blob field. JSON refs are decoded with the standard ATProto codec for validation;
signed repository snapshots are converted back to JSON for indexing. The PDS
verifies blob availability/ownership and the record's MIME/size restrictions.
Choose the schema before preparing media: Bluesky images allow four images up
to 1,000,000 bytes each. Chirp resizes/re-encodes photos and strips metadata in its
own web UI; the host does not implement that app-specific processing.

The SDK sends only collection, MIME and size through the native bridge. The broker
checks the live account, runtime, declared collection and both upload/write grants,
then returns a random single-use upload permit expiring after two minutes. The
SDK posts the binary Blob directly over HTTPS with that permit. It uses no cookies,
account bearer, PDS JWT, wallet key or base64 bridge envelope. Only the upload path
is added to the host's networking policy. CORS is bound to the exact app origin.
The API rechecks authorization after receiving the body, before the PDS side effect.

Each upload is at most 64 MiB. Transfers are bounded to sixty seconds, with at most
two concurrent API uploads. Reserved budgets are 256 MiB/128 permits per app/user
per UTC day and 1 GiB/512 permits across that user's apps. Failed or unused permits
still count, preventing retry abuse. Reopening a runtime does not reset the budget.
The operator PDS upload limit must also permit the chosen size; bootstrap adds
64 MiB if no explicit limit exists and retains existing operator configuration.
Individual record schemas can impose tighter limits.

Uploads and record publication are separate operations. An uploaded blob becomes
part of the published repository when a valid record references it. Do not use
this capability as private app storage. Revocation blocks future uploads/writes;
it does not delete earlier published media. A lost upload response requires a new
permit; the PDS content CID deduplicates identical bytes. Keep a successful blob
ref in memory when retrying publication. Unreferenced temporary blobs use the
upstream PDS's normal cleanup policy.

An app can generate/edit a Blob before upload without using the system picker.
For app-owned private media, continue using ordinary `fetch`/`FormData` to its own
declared backend; PDS uploads are an additional account action. App databases,
feed APIs, notifications, video transcoding and CDNs remain developer/service owned.

This closes the generic PDS-upload gap. Third-party services that require ATProto
service authorization still need a separate scoped delegation/OAuth capability;
the Tabs backend login proof cannot substitute for it. New protocol support should
be a reusable permission with explicit audience/method scopes, rather than a
named integration for each app. Reusing third-party record schemas is an operator
registry/policy review, not a new host publishing implementation.
