import { createServer } from "node:http";
import { RecipeIndexer } from "./indexer.mjs";
const index = new RecipeIndexer(
  process.env.PDS_URL ?? "https://pds.tabschat.com",
  process.env.PLC_URL ?? "https://plc.directory",
);
const publisher = process.env.PUBLISHER_ORIGIN ?? "https://recipes.example.org";
const origin = new URL(publisher);
if (origin.protocol !== "https:" || origin.origin !== publisher)
  throw new Error("PUBLISHER_ORIGIN must be an exact HTTPS origin");
const port = Number(process.env.PORT ?? "4180");
let stopped = false;
let timer;
async function poll() {
  try {
    await index.sync();
  } catch {
    index.failures++;
    console.warn("Public PDS sync unavailable; retaining verified cache.");
  }
  if (!stopped) timer = setTimeout(poll, 60000);
}
void poll();
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  response.setHeader("content-type", "application/json");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("access-control-allow-origin", publisher);
  response.setHeader("vary", "Origin");
  response.setHeader("cache-control", "no-store");
  if (request.method !== "GET" || url.pathname !== "/api/recipes") {
    response.writeHead(404).end('{"error":"NOT_FOUND"}');
    return;
  }
  const limit = url.searchParams.get("limit") ?? "30",
    cursor = url.searchParams.get("cursor") ?? "0";
  if (
    [...url.searchParams.keys()].some(
      (key) =>
        !["limit", "cursor"].includes(key) ||
        url.searchParams.getAll(key).length !== 1,
    ) ||
    !/^\d{1,6}$/.test(limit) ||
    !/^\d{1,6}$/.test(cursor) ||
    Number(limit) < 1 ||
    Number(limit) > 100 ||
    Number(cursor) > 100000
  ) {
    response.writeHead(400).end('{"error":"INVALID_INPUT"}');
    return;
  }
  if (!index.completedAt) {
    response.writeHead(503).end('{"error":"INDEX_NOT_READY"}');
    return;
  }
  response.end(JSON.stringify(index.page(Number(limit), Number(cursor))));
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Developer recipe API: http://127.0.0.1:${port}/api/recipes`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopped = true;
    clearTimeout(timer);
    server.close();
  });
