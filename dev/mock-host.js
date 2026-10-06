/** Browser-preview fixtures only. Never authenticate, publish, open chat, or move money. */
export function createMockHost(manifest, { denied = false } = {}) {
  const records = new Map();
  const self = {
    did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
    handle: "alice.demo.invalid",
    displayName: "Preview Alice",
    avatar: null,
    appId: manifest.id,
  };
  let sequence = 0;
  function grant(capability, collection, write = false) {
    if (
      denied ||
      !manifest.permissions.includes(capability) ||
      (collection &&
        !(write ? manifest.collections : manifest.readCollections).includes(
          collection,
        ))
    ) {
      throw Object.assign(new Error("Preview permission denied"), {
        code: "PERMISSION_DENIED",
      });
    }
  }
  function save({ collection, value, rkey }, update) {
    grant("records.write", collection, true);
    if (value?.$type !== collection)
      throw Object.assign(new Error("Invalid preview record"), {
        code: "INVALID_INPUT",
      });
    const uri = `at://${self.did}/${collection}/${rkey ?? `preview-${++sequence}`}`;
    if (update && !records.has(uri))
      throw Object.assign(new Error("Record not owned by preview app"), {
        code: "FORBIDDEN",
      });
    const cid = `preview-cid-${sequence++}`;
    records.set(uri, {
      uri,
      cid,
      author: { did: self.did, handle: self.handle },
      record: structuredClone(value),
      publishedAt: new Date().toISOString(),
    });
    return { uri, cid };
  }
  return Object.freeze({
    v: 1,
    blobs: Object.freeze({
      upload: async () => {
        grant("blobs.upload");
        throw Object.assign(new Error("Preview cannot upload to a real PDS."), {
          code: "UNSUPPORTED_OPERATION",
        });
      },
    }),
    auth: Object.freeze({
      getAssertion: async () => {
        grant("identity.authenticate");
        throw Object.assign(
          new Error("Preview cannot issue a verified identity proof."),
          { code: "UNSUPPORTED_OPERATION" },
        );
      },
    }),
    identity: Object.freeze({
      getSelf: async () => {
        grant("identity.basic");
        return { ...self };
      },
      resolveHandle: async (handle) => {
        grant("social.public.read");
        if (handle !== "bob.demo.invalid")
          throw Object.assign(new Error("Use bob.demo.invalid in preview"), {
            code: "NOT_FOUND",
          });
        return { did: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", handle };
      },
    }),
    records: Object.freeze({
      create: async (input) => save(input, false),
      update: async (input) => save(input, true),
      delete: async ({ collection, rkey }) => {
        grant("records.write", collection, true);
        records.delete(`at://${self.did}/${collection}/${rkey}`);
      },
    }),
    publicData: Object.freeze({
      query: async ({ collection, query = {} }) => {
        grant("records.read", collection);
        const all = [...records.values()].filter(
          (r) =>
            r.record.$type === collection &&
            (!query.author || r.author.did === query.author),
        );
        const offset = Number(query.cursor ?? "0"),
          limit = Number(query.limit ?? "30");
        if (
          !Number.isInteger(offset) ||
          offset < 0 ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          throw Object.assign(new Error("Invalid preview page"), {
            code: "INVALID_INPUT",
          });
        return {
          records: structuredClone(all.slice(offset, offset + limit)),
          nextCursor:
            all.length > offset + limit ? String(offset + limit) : null,
        };
      },
    }),
    payments: Object.freeze({
      resolve: async (handle) => {
        grant("payments.request");
        if (handle !== "bob.demo.invalid")
          throw Object.assign(new Error("Preview recipient unavailable"), {
            code: "NOT_FOUND",
          });
        return {
          did: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
          handle,
          displayName: "Preview Bob",
          avatar: null,
          canReceive: ["USDC"],
        };
      },
      request: async () => {
        grant("payments.request");
        return { status: "cancelled" };
      },
    }),
    chat: Object.freeze({
      openConversation: async () => {
        grant("chat.openConversation");
      },
    }),
  });
}
export function installMockHost(manifest, options, scope = globalThis) {
  if (scope.host) throw new Error("Refusing to replace an existing Tabs host");
  Object.defineProperty(scope, "host", {
    value: createMockHost(manifest, options),
    configurable: false,
    writable: false,
  });
}
