# Optional shared AppView integration

`sdk-query.js` is a WebView helper for generic record reads through the Tabs bridge.
Declare `records.read`, the exact `readCollections` and include approved schemas
in the package. It works only after consent and registration.

`backend-cache.mjs` is a server-side example for public HTTP reads, independent of
user consent. It permits one configured collection and caches/coalesces the first
twenty records for at least a minute. For example, in your own backend:

```js
import { createTabsPublicReader } from "./backend-cache.mjs";
const load = createTabsPublicReader({ collection: "com.tabschat.game.score" });
// In your own GET /api/scores handler:
// response.json(await load());
```

Provide bounded error handling, your own rate limits and backoff on 429. This helper
does not automatically retry or serve stale data after an upstream error. Add a
deliberate bounded stale-cache policy if that suits your app. Extending pagination
needs a bounded per-query cache; avoid a cache key for every arbitrary query.
These examples confer no custom query/schema approval or service guarantee.
See [shared-AppView documentation](../../docs/tabs-appview.md) for current endpoints,
CORS, limits, freshness and resource impact.
