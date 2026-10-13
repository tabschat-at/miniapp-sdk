import { createRecordSchemas } from "../common/records.js";
/** Development fixtures only. This module never contacts Tabs or signs anything. */
export const profiles = [
  {
    did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
    handle: "alice.demo.invalid",
    displayName: "Alice Chen",
    avatar: null,
  },
  {
    did: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb",
    handle: "bob.demo.invalid",
    displayName: "Bob Rivera",
    avatar: null,
  },
  {
    did: "did:plc:cccccccccccccccccccccccc",
    handle: "casey.demo.invalid",
    displayName: "Casey Morgan",
    avatar: null,
  },
];

export const demoManifest = {
  v: 1,
  id: "org.example.simulator",
  version: "1.0.0",
  name: "Host playground",
  entrypoint: "https://example.invalid/",
  minimumHostVersion: "0.0.52",
  permissions: [
    "identity.basic",
    "identity.authenticate",
    "social.public.read",
    "records.read",
    "records.write",
    "chat.openConversation",
    "payments.request",
  ],
  collections: ["org.example.simulator.note"],
  readCollections: ["org.example.simulator.note"],
  recordPurpose: "Simulator notes",
  allowedPaymentAssets: ["USDC"],
  networkAccess: [],
};

export const demoLexicons = [
  {
    lexicon: 1,
    id: "org.example.simulator.note",
    defs: {
      main: {
        type: "record",
        key: "tid",
        record: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", maxLength: 3000 },
            createdAt: { type: "string", format: "datetime" },
          },
        },
      },
    },
  },
];

const capabilities = {
  "identity.getSelf": "identity.basic",
  "identity.resolveHandle": "social.public.read",
  "auth.getAssertion": "identity.authenticate",
  "records.create": "records.write",
  "records.update": "records.write",
  "records.delete": "records.write",
  "publicData.query": "records.read",
  "chat.openConversation": "chat.openConversation",
  "payments.resolve": "payments.request",
  "payments.request": "payments.request",
  "blobs.upload": "blobs.upload",
  "wallet.connect": "wallet.connect",
  "wallet.disconnect": "wallet.connect",
  "wallet.signTransaction": "wallet.transactions",
  "wallet.signAndExecuteTransaction": "wallet.transactions",
  "wallet.signPersonalMessage": "wallet.messages",
};

export function failure(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export function parseManifest(value) {
  if (
    !value ||
    value.v !== 1 ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !["permissions", "collections", "readCollections"].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].every((item) => typeof item === "string"),
    )
  ) {
    throw failure(
      "INVALID_INPUT",
      "Use a V1 manifest with id, name, permissions, collections and readCollections.",
    );
  }
  return structuredClone(value);
}

export function createSimulator({
  manifest = demoManifest,
  lexicons = manifest === demoManifest ? demoLexicons : [],
  consent = {},
  identity: initialIdentity = profiles[0],
  prompt,
  changed = () => {},
  log = () => {},
}) {
  lexicons = structuredClone(lexicons);
  const schemas = createRecordSchemas(lexicons);
  let app = parseManifest(manifest),
    identity =
      (initialIdentity &&
        profiles.find((p) => p.did === initialIdentity.did)) ||
      null,
    generation = 0,
    sequence = 0,
    busy = false,
    active = true,
    reviewed = consent.reviewed === true;
  const permissions = new Map(),
    missingDeclarations = new Map(),
    records = new Map();
  const settings = {
    permissionMode: "ask",
    offline: false,
    latency: 0,
    paymentResult: "cancelled",
  };
  for (const [capability, decision] of Object.entries(
    consent.permissions ?? {},
  )) {
    if (
      app.permissions.includes(capability) &&
      ["allow", "deny"].includes(decision)
    )
      permissions.set(capability, decision);
  }
  function state() {
    return {
      manifest: structuredClone(app),
      lexicons: structuredClone(lexicons),
      reviewed,
      identity: identity && { ...identity },
      permissions: Object.fromEntries(permissions),
      missingDeclarations: structuredClone([...missingDeclarations.values()]),
      records: structuredClone([...records.values()]),
      settings: { ...settings },
    };
  }
  function reset(next = app) {
    app = parseManifest(next);
    generation++;
    active = true;
    reviewed = false;
    permissions.clear();
    missingDeclarations.clear();
    records.clear();
    sequence = 0;
    changed(state());
  }
  async function ask(kind, detail, epoch) {
    if (busy) throw failure("BUSY", "Finish the open host prompt first.");
    busy = true;
    try {
      const answer = await prompt(kind, detail);
      if (epoch !== generation)
        throw failure("UNAUTHORIZED", "Simulator session changed.");
      return answer;
    } finally {
      busy = false;
    }
  }
  async function call(method, input = {}) {
    const epoch = generation;
    try {
      if (!active) throw failure("UNAUTHORIZED", "This app is closed.");
      if (
        typeof method !== "string" ||
        !(
          Object.hasOwn(capabilities, method) ||
          ["simulator.shareToContact", "simulator.messageContact"].includes(
            method,
          )
        )
      )
        throw failure("UNSUPPORTED_OPERATION");
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw failure("INVALID_INPUT");
      if (settings.latency)
        await new Promise((resolve) => setTimeout(resolve, settings.latency));
      if (epoch !== generation) throw failure("UNAUTHORIZED");
      if (settings.offline)
        throw failure("UNAVAILABLE", "Simulated host is offline.");
      const capability = capabilities[method];
      const write = method.startsWith("records.");
      const missing = [];
      if (capability && !app.permissions.includes(capability))
        missing.push({ field: "permissions", name: capability });
      if (write || method === "publicData.query" || method === "blobs.upload") {
        const field =
          write || method === "blobs.upload"
            ? "collections"
            : "readCollections";
        if (!app[field].includes(input.collection))
          missing.push({
            field,
            name:
              typeof input.collection === "string"
                ? input.collection
                : "(missing collection)",
          });
      }
      if (missing.length) {
        for (const item of missing) {
          const key = `${item.field}:${item.name}`;
          const prior = missingDeclarations.get(key);
          missingDeclarations.set(key, {
            ...item,
            methods: [...new Set([...(prior?.methods ?? []), method])],
            attempts: (prior?.attempts ?? 0) + 1,
          });
          if (missingDeclarations.size > 80)
            missingDeclarations.delete(missingDeclarations.keys().next().value);
        }
        changed(state());
        throw failure(
          "PERMISSION_DENIED",
          `Missing from manifest: ${missing.map(({ field, name }) => `${field}: ${name}`).join("; ")}`,
        );
      }
      if (capability && permissions.get(capability) === "deny")
        throw failure("PERMISSION_DENIED", "Permission denied by the user.");
      if (!identity) {
        throw failure(
          "UNAUTHORIZED",
          "Sign in using the simulator’s host session controls.",
        );
      }
      if (capability) {
        let consent = permissions.get(capability);
        if (!consent) {
          consent =
            settings.permissionMode === "ask"
              ? await ask(
                  "permission",
                  { capability, app: app.name, collection: input.collection },
                  epoch,
                )
              : settings.permissionMode;
          consent = consent === "allow" ? "allow" : "deny";
          permissions.set(capability, consent);
          changed(state());
        }
        if (consent !== "allow") throw failure("PERMISSION_DENIED");
      }
      const result = await execute(method, input, epoch);
      if (epoch !== generation) throw failure("UNAUTHORIZED");
      let detail;
      if (result?.status === "simulated") {
        const contact = profiles.find(
          (person) => person.did === result.recipientDid,
        );
        detail = `${method.endsWith("shareToContact") ? "Share preview" : "Message preview"} → ${contact?.displayName ?? result.recipientDid}: ${input.url ?? input.text}`;
      } else if (method === "chat.openConversation") {
        const contact = profiles.find(
          (person) => person.did === input.recipientDid,
        );
        detail = `Conversation opened → ${contact?.displayName ?? input.recipientDid}`;
      }
      log({ method, status: "ok", ...(detail ? { detail } : {}) });
      changed(state());
      return structuredClone(result);
    } catch (error) {
      log({
        method,
        status: error.code || "INVALID_INPUT",
        detail: error.message,
      });
      throw error;
    }
  }
  async function execute(method, input, epoch) {
    const person = () => {
      const found = profiles.find(
        (p) => p.handle === input.handle || p.did === input.recipientDid,
      );
      if (!found) throw failure("NOT_FOUND", "Choose a fixture contact.");
      return found;
    };
    if (method === "identity.getSelf") return { ...identity, appId: app.id };
    if (method === "identity.resolveHandle") {
      const p = person();
      return { did: p.did, handle: p.handle };
    }
    if (method === "auth.getAssertion") {
      let audience;
      try {
        audience = new URL(input.audience);
      } catch {
        throw failure("INVALID_INPUT");
      }
      if (
        audience.protocol !== "https:" ||
        audience.origin !== input.audience ||
        !/^[A-Za-z0-9_-]{22,128}$/.test(input.nonce)
      )
        throw failure("INVALID_INPUT");
      return {
        token: "SIMULATOR_ONLY_UNSIGNED_ASSERTION",
        issuer: "https://simulator.invalid",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    }
    if (method.startsWith("records.")) {
      if (
        (method !== "records.create" &&
          !/^[A-Za-z0-9._~:-]{1,512}$/.test(input.rkey)) ||
        (method !== "records.delete" &&
          (!input.value || input.value.$type !== input.collection))
      )
        throw failure("INVALID_INPUT");
      if (method !== "records.delete") {
        try {
          schemas.validate(input.collection, input.value);
        } catch (error) {
          throw failure("INVALID_INPUT", error.message);
        }
      }
      const rkey =
        method === "records.create" ? `simulator-${++sequence}` : input.rkey;
      const uri = `at://${identity.did}/${input.collection}/${rkey}`;
      if (method !== "records.create" && !records.has(uri))
        throw failure(
          "FORBIDDEN",
          "Record is not owned by this simulator session.",
        );
      if (method === "records.delete") {
        records.delete(uri);
        return;
      }
      const cid = `simulator-cid-${++sequence}`;
      records.set(uri, {
        uri,
        cid,
        author: { did: identity.did, handle: identity.handle },
        record: structuredClone(input.value),
        publishedAt: new Date().toISOString(),
      });
      return { uri, cid };
    }
    if (method === "publicData.query") {
      const query = input.query ?? {},
        offset = Number(query.cursor ?? 0),
        limit = Number(query.limit ?? 30);
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        throw failure("INVALID_INPUT");
      const all = [...records.values()].filter(
        (r) =>
          r.record.$type === input.collection &&
          (!query.author || query.author === r.author.did),
      );
      return {
        records: all.slice(offset, offset + limit),
        nextCursor: all.length > offset + limit ? String(offset + limit) : null,
      };
    }
    if (method === "payments.resolve")
      return { ...person(), canReceive: ["USDC"] };
    if (method === "payments.request") {
      if (
        input.asset !== "USDC" ||
        !(app.allowedPaymentAssets ?? []).includes(input.asset) ||
        !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input.amount) ||
        Number(input.amount) <= 0
      )
        throw failure("INVALID_INPUT");
      const outcome = settings.paymentResult;
      const answer = await ask(
        "payment",
        { ...input, person: person(), outcome },
        epoch,
      );
      return answer === "confirm"
        ? outcome === "sent"
          ? { status: "sent", digest: "SIMULATOR_ONLY_NO_TRANSACTION" }
          : { status: outcome }
        : { status: "cancelled" };
    }
    if (method === "chat.openConversation") {
      const answer = await ask("conversation", { person: person() }, epoch);
      if (answer !== "confirm") throw failure("USER_REJECTED");
      return;
    }
    if (method.startsWith("simulator.")) {
      if (method === "simulator.shareToContact") {
        let url;
        try {
          url = new URL(input.url);
        } catch {
          throw failure("INVALID_INPUT");
        }
        if (!["https:", "http:"].includes(url.protocol))
          throw failure("INVALID_INPUT");
      } else if (
        typeof input.text !== "string" ||
        !input.text.trim() ||
        input.text.length > 4096
      )
        throw failure("INVALID_INPUT");
      const recipient = await ask(
        method.endsWith("shareToContact") ? "share" : "message",
        { ...input, profiles },
        epoch,
      );
      const contact = profiles.find((p) => p.did === recipient);
      return contact
        ? { status: "simulated", recipientDid: contact.did }
        : { status: "cancelled" };
    }
    throw failure(
      "UNSUPPORTED_OPERATION",
      "File uploads and wallet signing require a real Tabs host.",
    );
  }
  return {
    call,
    state,
    reset,
    async open() {
      if (!identity)
        throw failure(
          "UNAUTHORIZED",
          "Sign in to the simulator before opening an app.",
        );
      active = true;
      const epoch = ++generation;
      if (
        !reviewed ||
        app.permissions.some((capability) => !permissions.has(capability))
      ) {
        const answer =
          settings.permissionMode === "ask"
            ? await ask(
                "permissions",
                { manifest: structuredClone(app) },
                epoch,
              )
            : settings.permissionMode;
        if (epoch !== generation || !active) throw failure("UNAUTHORIZED");
        reviewed = true;
        for (const capability of app.permissions)
          permissions.set(capability, answer === "allow" ? "allow" : "deny");
        changed(state());
      }
    },
    suspend() {
      active = false;
      generation++;
    },
    setPermissionDecision(approved) {
      generation++;
      reviewed = true;
      for (const capability of app.permissions)
        permissions.set(capability, approved ? "allow" : "deny");
      changed(state());
    },
    signOut() {
      identity = null;
      reset();
    },
    setIdentity(next) {
      identity = (next && profiles.find((p) => p.did === next.did)) || null;
      reset();
    },
    revoke(capability) {
      generation++;
      permissions.set(capability, "deny");
      changed(state());
    },
    clearPermissions() {
      generation++;
      reviewed = false;
      permissions.clear();
      missingDeclarations.clear();
      changed(state());
    },
    configure(options) {
      if (
        options.permissionMode !== undefined &&
        !["ask", "allow", "deny"].includes(options.permissionMode)
      )
        throw failure("INVALID_INPUT");
      if (
        options.latency !== undefined &&
        (!Number.isInteger(options.latency) ||
          options.latency < 0 ||
          options.latency > 5000)
      )
        throw failure("INVALID_INPUT");
      if (
        options.paymentResult !== undefined &&
        !["cancelled", "pending", "failed", "expired", "sent"].includes(
          options.paymentResult,
        )
      )
        throw failure("INVALID_INPUT");
      for (const key of Object.keys(settings))
        if (options[key] !== undefined) settings[key] = options[key];
      changed(state());
    },
  };
}
