# A Spark-compatible web mini-app

The mini-app model can host a separately implemented Spark-compatible web client.
Developers own the web UI and supporting services; the host does not need to own
Spark's database, video processing, CDN or feed implementation. Login, selected
files and standard PDS blob upload provide generic building blocks. HTML audio/video playback is allowed from
the app's declared origins and blob URLs, with user-initiated playback.

Spark's [client](https://github.com/sprksocial/client) is currently a native Flutter
app, not a ready-to-embed website. Its [AppView server](https://github.com/sprksocial/server)
and lexicons define the actual interoperability contract. Checking the source on
2026-10-03 shows these distinct requirements:

| Requirement                     | What the mini-app host supplies                                                  | Remaining integration                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Own web UI and services         | HTTPS app, declared origins, app-owned styling, fetch, File APIs, media playback | Implement/port the web UI and satisfy API CORS                                   |
| Sign in to an app-owned backend | DID-bound, app/audience/nonce-bound 60-second Tabs proof                         | Developer verifies it and owns its app session                                   |
| Read Spark users/posts          | Public HTTPS requests where the Spark endpoint permits them                      | Use Spark's AppView APIs and its indexing/discovery policies                     |
| Publish compatible data         | Existing scoped record API and TID keys                                          | Register reviewed Spark lexicons; follow its media/reference semantics           |
| Images/video                    | User-controlled file selection and developer-owned uploads                       | Generic `blobs.upload` is available; implement Spark's media-processing protocol |
| Authenticated Spark actions     | Shared ATProto DID identity                                                      | Scoped ATProto service-auth or controlled OAuth delegation, accepted by Spark    |
| Existing Spark-account login    | Current host uses Tabs-hosted identities                                         | Explicit support for connecting external PDS/OAuth accounts                      |

A Spark post is [`so.sprk.feed.post`](https://github.com/sprksocial/server/blob/main/lexicons/so/sprk/feed/post.json),
with a TID key and required media. Its media union references `so.sprk.media.images`
or `so.sprk.media.video`. Matching its record types and blobs is what lets an
independent client work with the same data and users.

Spark's [authentication verifier](https://github.com/sprksocial/server/blob/main/auth-verifier.ts)
checks ATProto service JWTs against DID signing keys and its service audiences,
with method scopes where required. Our Tabs assertion is signed by the Tabs issuer
and has an HTTPS backend audience. It is not that protocol and cannot be sent to
Spark as a substitute. A developer-owned backend can accept it, but cannot thereby
write to a user's PDS or impersonate the user to Spark.

[`so.sprk.video.uploadVideo`](https://github.com/sprksocial/server/blob/main/lexicons/so/sprk/video/uploadVideo.json)
accepts MP4 and returns a processing job status for media to be stored on the PDS.
File selection is the first step, not a replacement for that service or its auth.
Generic scoped PDS blob upload is now available on host 0.0.52; service-auth remains a reusable host extension;
Spark-specific processing and feed routes belong to the app or Spark service.

The current publisher registration workflow requires new custom schemas to belong
to the publisher's namespace. Reusing third-party Spark schemas needs a deliberate
operator-reviewed registration, like the existing Bluesky schema integration. Do
not silently rename those schemas: doing so creates different records. PDS relay
connectivity alone also does not certify that Spark indexes this PDS; verify that
with Spark's feed/indexer and an explicit compatibility test.

Thus the architecture is suitable, but these fixes alone do not produce full Spark
compatibility. They make developer-owned authenticated media apps possible while
keeping the remaining protocol delegation work explicit and reusable.

See [ATProto media](atproto-media.md) for the universal upload contract. This
capability enables account media storage; it does not replace Spark’s processing
API, authorization or indexing requirements.
