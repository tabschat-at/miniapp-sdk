import { IdResolver, ensureAtpDocument } from "@atproto/identity";
import { verifyRepoCar, MemoryBlockstore } from "@atproto/repo";
import { Lexicons } from "@atproto/lexicon";
import { readFile } from "node:fs/promises";

export const collection = "org.example.recipes.recipe";
const schema = JSON.parse(
  await readFile(
    new URL(
      "../recipe-notebook/lexicons/org.example.recipes.recipe.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const lexicons = new Lexicons([schema]);
export function validRecipe(value) {
  try {
    if (
      value?.$type !== collection ||
      Buffer.byteLength(JSON.stringify(value)) > 16384
    )
      return false;
    lexicons.assertValidRecord(collection, value);
    if (
      Object.keys(value).some(
        (key) => !["$type", "title", "ingredients", "notes"].includes(key),
      )
    )
      return false;
    if (
      value.ingredients.some((item) =>
        Object.keys(item).some((key) => !["name", "quantity"].includes(key)),
      )
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
async function bounded(response, maximum) {
  if (!response.ok || !response.body) throw new Error("PDS unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > maximum) throw new Error("PDS response too large");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks, length);
}
/** Single configured PDS. Fetches only public sync data; never needs a Tabs or PDS token. */
export class RecipeIndexer {
  constructor(pdsUrl, plcUrl = "https://plc.directory") {
    const url = new URL(pdsUrl);
    if (url.protocol !== "https:" || url.origin !== pdsUrl)
      throw new Error("PDS_URL must be an exact HTTPS origin");
    const plc = new URL(plcUrl);
    if (plc.protocol !== "https:" || plc.origin !== plcUrl)
      throw new Error("PLC_URL must be an exact HTTPS origin");
    this.pdsUrl = pdsUrl;
    this.resolver = new IdResolver({ plcUrl, timeout: 10000 });
    this.repos = new Map();
    this.completedAt = null;
    this.failures = 0;
  }
  async get(method, params, maximum) {
    const url = new URL(`/xrpc/com.atproto.sync.${method}`, this.pdsUrl);
    url.search = new URLSearchParams(params).toString();
    return bounded(
      await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      }),
      maximum,
    );
  }
  async list() {
    const result = new Map();
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 20; page++) {
      const data = JSON.parse(
        (
          await this.get(
            "listRepos",
            { limit: "500", ...(cursor ? { cursor } : {}) },
            1024 * 1024,
          )
        ).toString(),
      );
      if (!Array.isArray(data.repos) || data.repos.length > 500)
        throw new Error("Invalid repository list");
      for (const repo of data.repos) {
        if (
          !/^did:plc:[a-z2-7]{24}$/.test(repo.did) ||
          result.has(repo.did) ||
          (repo.active !== undefined && typeof repo.active !== "boolean")
        )
          throw new Error("Invalid repository listing");
        result.set(repo.did, repo.active !== false);
      }
      if (!data.cursor) return result;
      if (
        typeof data.cursor !== "string" ||
        data.cursor.length > 512 ||
        cursors.has(data.cursor)
      )
        throw new Error("Invalid cursor");
      cursors.add(data.cursor);
      cursor = data.cursor;
    }
    throw new Error("Repository listing incomplete");
  }
  async snapshot(did, previous) {
    const document = await this.resolver.did.resolve(did, true);
    if (!document) throw new Error("Identity unavailable");
    const identity = ensureAtpDocument(document);
    if (
      identity.did !== did ||
      new URL(identity.pds).origin !== this.pdsUrl ||
      (await this.resolver.handle.resolve(identity.handle)) !== did
    )
      throw new Error("Identity hosting mismatch");
    const head = JSON.parse(
      (await this.get("getLatestCommit", { did }, 8192)).toString(),
    );
    if (previous?.cid === head.cid)
      return { ...previous, handle: identity.handle };
    const repo = await verifyRepoCar(
      await this.get("getRepo", { did }, 16 * 1024 * 1024),
      did,
      identity.signingKey,
    );
    const cid = repo.commit.cid.toString(),
      rev = repo.commit.rev;
    if (
      !/^[234567abcdefghijklmnopqrstuvwxyz]{13}$/.test(rev) ||
      repo.creates.length > 5000 ||
      (previous &&
        (rev < previous.rev || (rev === previous.rev && cid !== previous.cid)))
    )
      throw new Error("Repository rollback/fork or bounds failure");
    const store = new MemoryBlockstore(repo.commit.newBlocks);
    const records = [];
    for (const entry of repo.creates) {
      if (entry.collection !== collection) continue;
      const record = await store.readRecord(entry.cid);
      if (!validRecipe(record)) continue;
      const uri = `at://${did}/${collection}/${entry.rkey}`;
      records.push({
        uri,
        cid: entry.cid.toString(),
        record,
        publishedAt:
          previous?.records.find((item) => item.uri === uri)?.publishedAt ??
          new Date().toISOString(),
      });
    }
    return { cid, rev, handle: identity.handle, records };
  }
  async sync() {
    const listing = await this.list(); // Failure must never look like an empty repository list.
    this.failures = 0;
    for (const did of this.repos.keys())
      if (!listing.get(did)) this.repos.delete(did);
    for (const [did, active] of listing) {
      if (!active) continue;
      try {
        this.repos.set(did, await this.snapshot(did, this.repos.get(did)));
      } catch {
        this.failures++;
      } // Retain last verified snapshot; never log record/error contents.
    }
    this.completedAt = new Date().toISOString();
  }
  page(limit = 30, offset = 0) {
    const records = [...this.repos]
      .flatMap(([did, repo]) =>
        repo.records.map((record) => ({
          ...record,
          author: { did, handle: repo.handle },
        })),
      )
      .sort(
        (a, b) =>
          b.publishedAt.localeCompare(a.publishedAt) ||
          a.uri.localeCompare(b.uri),
      );
    return {
      source: "developer-owned-verified-pds-index",
      records: records.slice(offset, offset + limit),
      nextCursor:
        records.length > offset + limit ? String(offset + limit) : null,
      indexedAt: this.completedAt,
      syncFailures: this.failures,
    };
  }
}
