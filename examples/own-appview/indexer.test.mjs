import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Repo,
  MemoryBlockstore,
  blocksToCarFile,
  WriteOpAction,
} from "@atproto/repo";
import { Secp256k1Keypair } from "@atproto/crypto";
import { RecipeIndexer, validRecipe, collection } from "./indexer.mjs";
const did = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  pds = "https://pds.example.org";
const recipe = {
  $type: collection,
  title: "Soup",
  ingredients: [{ name: "Carrot", quantity: 2 }],
};
async function fixture() {
  const key = await Secp256k1Keypair.create(),
    store = new MemoryBlockstore();
  let repo = await Repo.create(store, did, key);
  store.applyCommit = async (commit) => {
    store.root = commit.cid;
    store.blocks.addMap(commit.newBlocks);
  };
  const index = new RecipeIndexer(pds);
  index.resolver = {
    did: {
      resolve: async () => ({
        id: did,
        alsoKnownAs: ["at://alice.example.org"],
        verificationMethod: [
          {
            id: did + "#atproto",
            type: "Multikey",
            controller: did,
            publicKeyMultibase: key.did().slice(8),
          },
        ],
        service: [
          {
            id: did + "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: pds,
          },
        ],
      }),
    },
    handle: { resolve: async () => did },
  };
  index.get = async (method) =>
    method === "getLatestCommit"
      ? Buffer.from(JSON.stringify({ cid: repo.cid.toString() }))
      : blocksToCarFile(repo.cid, store.blocks);
  return {
    index,
    key,
    async write(action, record = recipe) {
      repo = await repo.applyWrites(
        {
          action,
          collection,
          rkey: "recipe",
          ...(action === WriteOpAction.Delete ? {} : { record }),
        },
        key,
      );
    },
  };
}
test("recipe schema rejects extra/private fields and wrong types", () => {
  assert.equal(validRecipe(recipe), true);
  assert.equal(validRecipe({ ...recipe, privateKey: "never" }), false);
  assert.equal(
    validRecipe({
      ...recipe,
      ingredients: [{ name: "Carrot", secret: "never" }],
    }),
    false,
  );
  assert.equal(validRecipe({ ...recipe, title: 42 }), false);
});
test("own indexer verifies actual signed complete CAR, updates and deletions", async () => {
  const f = await fixture();
  await f.write(WriteOpAction.Create);
  const first = await f.index.snapshot(did);
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].record.title, "Soup");
  await f.write(WriteOpAction.Update, { ...recipe, title: "Stew" });
  const next = await f.index.snapshot(did, first);
  assert.equal(next.records[0].record.title, "Stew");
  await f.write(WriteOpAction.Delete);
  assert.equal((await f.index.snapshot(did, next)).records.length, 0);
});
test("wrong signing key, hosting mismatch and repository rollback fail closed", async () => {
  const f = await fixture();
  await f.write(WriteOpAction.Create);
  const first = await f.index.snapshot(did);
  await assert.rejects(
    f.index.snapshot(did, { ...first, cid: "different", rev: "zzzzzzzzzzzzz" }),
    /rollback/,
  );
  const original = f.index.resolver.did.resolve;
  const wrong = (await Secp256k1Keypair.create()).did().slice(8);
  f.index.resolver.did.resolve = async () => {
    const doc = await original();
    doc.verificationMethod[0].publicKeyMultibase = wrong;
    return doc;
  };
  await assert.rejects(f.index.snapshot(did));
  f.index.resolver.did.resolve = async () => {
    const doc = await original();
    doc.service[0].serviceEndpoint = "https://other.example.org";
    return doc;
  };
  await assert.rejects(f.index.snapshot(did), /hosting/);
});
test("failed/partial listings never purge verified state; failed snapshots retain it", async () => {
  const f = await fixture();
  await f.write(WriteOpAction.Create);
  const snapshot = await f.index.snapshot(did);
  f.index.repos.set(did, snapshot);
  f.index.list = async () => {
    throw new Error("partial listing");
  };
  await assert.rejects(f.index.sync());
  assert.equal(f.index.page().records.length, 1);
  f.index.list = async () => new Map([[did, true]]);
  f.index.snapshot = async () => {
    throw new Error("unavailable");
  };
  await f.index.sync();
  assert.equal(f.index.page().records.length, 1);
  assert.equal(f.index.failures, 1);
  f.index.list = async () => new Map([[did, false]]);
  await f.index.sync();
  assert.equal(f.index.page().records.length, 0);
});
