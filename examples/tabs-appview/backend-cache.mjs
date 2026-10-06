/** Backend-only helper: public, fixed upstream. No user tokens or arbitrary URL proxy. */
export function createTabsPublicReader({
  collection,
  ttlMs = 60000,
  fetcher = fetch,
} = {}) {
  if (
    typeof collection !== "string" ||
    !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/.test(collection)
  )
    throw new Error("Configure one registered public collection");
  if (!Number.isFinite(ttlMs) || ttlMs < 60000)
    throw new Error("Use at least sixty seconds of cache time");
  let cached,
    expires = 0,
    inFlight;
  return async function firstPage() {
    if (cached && Date.now() < expires) return structuredClone(cached);
    if (!inFlight)
      inFlight = (async () => {
        const url = new URL("https://api.tabschat.com/appview/records");
        url.search = new URLSearchParams({
          collection,
          limit: "20",
        }).toString();
        const response = await fetcher(url, {
          redirect: "error",
          credentials: "omit",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok || !response.body)
          throw Object.assign(new Error("Public AppView unavailable"), {
            code: response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE",
          });
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            size += item.value.length;
            if (size > 1024 * 1024)
              throw new Error("Oversized public AppView response");
            chunks.push(item.value);
          }
        } finally {
          await reader.cancel();
        }
        const value = JSON.parse(Buffer.concat(chunks, size).toString());
        if (
          !Array.isArray(value.records) ||
          value.records.length > 20 ||
          !(value.nextCursor === null || typeof value.nextCursor === "string")
        )
          throw new Error("Invalid public AppView response");
        cached = value;
        expires = Date.now() + ttlMs;
        return value;
      })();
    try {
      return structuredClone(await inFlight);
    } finally {
      inFlight = undefined;
    }
  };
}
