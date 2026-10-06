# Developer-owned recipe AppView

This backend independently polls a public PDS and builds a recipe feed. It never
queries Tabs' AppView and needs no Tabs or PDS credential. Keep the whole SDK tree
when running it: it loads the recipe Lexicon from the sibling recipe example.

```sh
cd examples/own-appview
npm ci --ignore-scripts
npm test
PDS_URL=https://pds.tabschat.com \
PUBLISHER_ORIGIN=https://recipes.example.org npm start
# GET http://127.0.0.1:4180/api/recipes?limit=20
```

Publish the recipe app/schema through operator review before expecting live
records. An empty verified feed is normal beforehand. `PDS_URL` is one trusted
public HTTPS origin, default `https://pds.tabschat.com`; `PLC_URL` defaults to
`https://plc.directory`; `PORT` defaults to 4180. To support another PDS, configure
it deliberately. This example does not discover/fetch arbitrary DID service URLs.

TLS-terminate the loopback API at your own domain. You can proxy `/api/recipes` on
the recipe page's publisher origin, keeping its existing relative `feedUrl`, or
change that URL to your API origin, add the origin to `networkAccess`, and configure
`PUBLISHER_ORIGIN` for CORS. No credentials are sent by the recipe page.

The worker verifies complete signed CAR repositories with the DID's current key,
checks bidirectional handle/hosting association, rejects rollback/forks within
its process and validates exact recipe fields. It handles deletion, retains last
verified data on per-repo failure, and never purges from an incomplete/failed
repository listing. The public API supports bounded limit/cursor pagination.

This is an educational single-process, in-memory example, not a production service.
Restart rebuilds its cache and loses stored revision checkpoints; add durable
checkpoints/index storage before relying on rollback detection across restarts.
It polls every minute after each pass, supports at most 10,000 did:plc repos per
listing/5,000 records per snapshot and limits CARs to 16 MiB. High traffic needs
rate limiting, bounded HTTP concurrency, monitoring, durable pagination/storage,
moderation and an operational rollout. Multiple PDSs need deduplication and
independent trusted-source policy. Public signatures prove authorship, not app
ownership, truth or anti-cheat. Sharing an indexer/cache reduces source PDS load.
