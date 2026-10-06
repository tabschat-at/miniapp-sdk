# Optionally use Tabs' shared AppView

Tabs maintains a verified index of registered public records on its own hosted
PDS. Developers may use its supported queries rather than operate their own
indexer. It currently indexes our PDS only, not the whole ATProto network. There
is no self-service schema upload, arbitrary SQL, custom query deployment or
developer database access. New schemas still need operator approval.

## Permission-controlled SDK reads

Declare `records.read` and the exact collection in `readCollections`, obtain the
first-visit consent, then query from your page:

```js
const page = await host.publicData.query({
  collection: "org.example.recipes.recipe",
  query: { limit: "20", ...(cursor ? { cursor } : {}) },
});
```

This example works after the recipe schema/app package is approved. It is not
pre-registered in the deployed catalog. Queries support author DID, limit and
cursor, not arbitrary search/ranking/filter expressions. The SDK can call this
without giving the page a Tabs credential or adding the protected API origin to
`networkAccess`. See [API results](api.md) and
[the optional SDK query example](../examples/tabs-appview/sdk-query.js).

## Public read-only HTTP API

Your backend can query `https://api.tabschat.com` without authentication:

| GET path                    | Parameters                                                             |
| --------------------------- | ---------------------------------------------------------------------- |
| `/appview/records`          | Required registered `collection`; optional `author`, `limit`, `cursor` |
| `/appview/status`           | None; returns last sync, failures and counts                           |
| `/appview/news/stories`     | `sort=top` or `new`, optional `limit`, `cursor`                        |
| `/appview/news/comments`    | Required `story` AT URI, optional `limit`, `cursor`                    |
| `/appview/game/leaderboard` | Required `game`, `season`, optional `limit`, `cursor`                  |

The news/game paths are reference integrations, not a guarantee of custom
aggregation for other apps. Leaderboard scores are self-reported. They use the
same `{records, nextCursor}` envelope; specialized rows also carry vote/comment
counts, tree metadata or rank/score as applicable.

```sh
curl --get 'https://api.tabschat.com/appview/records' \
  --data-urlencode 'collection=com.tabschat.game.score' \
  --data-urlencode 'limit=20'
```

Do not send Tabs/PDS tokens, cookies or private data. These are public records;
SDK read consent controls the capability inside Tabs, not public-data secrecy.
The current public API does not provide cross-origin browser CORS access. Use
`host.publicData.query` in the WebView or your own caching backend for raw HTTP
reads. Declaring a network origin alone does not bypass CORS. Our hosted reference
apps can use same-origin routes; that does not make cross-origin access universal.

[The server helper](../examples/tabs-appview/backend-cache.mjs) demonstrates fixed
public queries, bounded responses, sixty-second caching and coalesced requests.
Expose your own specific read-only endpoint; never create an unrestricted URL
proxy or pass user-provided host tokens upstream.

## Freshness and limits

The worker checks repositories at startup and about sixty seconds after each
completed pass. Large/slow passes can extend the delay. Generic `publishedAt` is
first indexing time; snapshots/signatures prove authorship/integrity, not truth or
app provenance. Retained data may be stale after a verification/network failure.
Deletes update the index after a successful refresh. Pagination is offset-based
and can shift as records change; use returned cursors and deduplicate by URI.

Current limits include 1–100 rows per request, cursor 0–100000, a 16 MiB repository
snapshot, 5,000 records per verified snapshot and at most 10,000 enumerated
repositories per pass. Public AppView reads are limited to **60 requests per
source IP per minute**, alongside the overall API's 300/source/minute limit.
SDK calls have visit/account limits and consent checks instead of the dedicated
public AppView route limit. Shared NATs and backend proxies share source limits.
HTTP 429 means back off with jitter. Current responses do not promise Retry-After.

## Does using this stress our server?

Yes. The shared AppView uses the same API process and PostgreSQL instance as
accounts and messaging. Every public HTTP read currently performs rate-limit
database writes plus query work. More registered collections/records consume
storage and indexing CPU/I/O; changed repositories also trigger shared reference
aggregate refreshes. Existing polls happen regardless of whether anyone reads,
but popular apps add query load. Deep offset pages and custom aggregates can be
expensive. There is no published throughput guarantee, per-app resource isolation,
billing plan or production SLA yet; the deployment is a test environment.

To keep load reasonable:

- Request 20–30 records at a time and paginate only when needed.
- Cache public reads on your backend for at least a minute where appropriate and
  combine simultaneous identical requests. A shared cache avoids every browser
  polling separately; it adds freshness delay.
- Refresh on navigation/user action; avoid background or per-second polling.
- Honor 429, bound concurrency and avoid automatically crawling all records.
- Run your own indexer for high traffic, custom rankings/search, broader PDS
  coverage or independent availability. The supplied example still polls the
  source PDS, so additional indexers also add upstream load; reuse one cache.

Before promising shared hosting for a busy app, Tabs needs measured load testing,
monitoring, query/refresh optimization and resource separation. Rate limits bound
some abuse; they do not establish how many users the current server can support.
