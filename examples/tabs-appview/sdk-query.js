import { getHost } from "../../src/index.js";
/** Requires declared records.read, this collection's read scope and user consent. */
export function queryTabsRecords(collection, { cursor, author } = {}) {
  return getHost().publicData.query({
    collection,
    query: {
      limit: "20",
      ...(cursor ? { cursor } : {}),
      ...(author ? { author } : {}),
    },
  });
}
