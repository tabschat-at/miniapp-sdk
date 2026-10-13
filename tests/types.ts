import "../src/bootstrap.js";
import {
  getHost,
  recordKey,
  describeError,
  type ManifestV1,
  type HostBridgeV1,
} from "../src/index.js";
const host: HostBridgeV1 = getHost(window);
const manifest: ManifestV1 = {
  v: 1,
  id: "org.example.hello",
  version: "1.0.0",
  name: "Hello",
  entrypoint: "https://hello.example.org/index.html",
  permissions: ["identity.basic"],
  collections: [],
  readCollections: [],
  recordPurpose: "",
  allowedPaymentAssets: [],
  minimumHostVersion: "0.0.16",
  networkAccess: [],
};
async function examples() {
  const self = await host.identity.getSelf();
  const proof = await host.auth.getAssertion({
    audience: "https://api.example.org",
    nonce: "n".repeat(43),
  });
  proof.token.toUpperCase();
  await host.chat.openConversation({ recipientDid: self.did });
  const saved = await host.records.create({
    collection: "org.example.recipes.recipe",
    value: {
      $type: "org.example.recipes.recipe",
      title: "Soup",
      ingredients: [],
    },
  });
  recordKey(saved.uri, "org.example.recipes.recipe");
  const page = await host.publicData.query<{ title: string }>({
    collection: "org.example.recipes.recipe",
    query: { limit: "20", author: self.did },
  });
  page.records[0]?.record.title.toUpperCase();
  const payment = await host.payments.request({
    recipientDid: self.did,
    asset: "USDC",
    amount: "0.01",
  });
  if (payment.status === "sent") payment.digest.toUpperCase();
  // @ts-expect-error Wallet keys/signers are never a bridge API.
  host.wallet.sign({});
  // @ts-expect-error Monetary amounts are decimal strings.
  host.payments.request({ recipientDid: self.did, asset: "USDC", amount: 1 });
  host.publicData.query({
    collection: "org.example.recipes.recipe",
    // @ts-expect-error SDK public query limits are strings, not numbers.
    query: { limit: 20 },
  });
}
void manifest;
void examples;
describeError(new Error("fixture"));
