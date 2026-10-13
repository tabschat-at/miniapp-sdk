import { Lexicons, jsonToLex, lexiconDoc } from "../vendor/lexicon.js";

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const check = (condition, message) => {
  if (!condition) throw Error(message);
};

// Mirrors the host's public-record policy; schemas are fixtures, never supplied in bridge calls.
export function createRecordSchemas(documents = []) {
  check(
    Array.isArray(documents) &&
      documents.length <= 128 &&
      bytes(documents) <= 1048576,
    "Lexicons exceed the 128-document / 1 MB limit.",
  );
  const copies = structuredClone(documents);
  function normalize(value, depth = 0) {
    check(depth <= 64, "Schema exceeds nesting limits.");
    if (!value || typeof value !== "object") return;
    if (value.type === "ref" && typeof value.ref === "string")
      value.ref = value.ref.replace(/^lex:/, "");
    if (value.type === "union" && Array.isArray(value.refs))
      value.refs = value.refs.map((r) =>
        typeof r === "string" ? r.replace(/^lex:/, "") : r,
      );
    for (const child of Object.values(value)) normalize(child, depth + 1);
  }
  normalize(copies);
  for (const doc of copies) {
    const result = lexiconDoc.safeParse(doc);
    check(
      result.success,
      `${doc?.id ?? "Lexicon"}: invalid schema (${result.success ? "" : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}).`,
    );
  }
  function constraints(value) {
    if (!value || typeof value !== "object") return;
    for (const [min, max] of [
      ["minimum", "maximum"],
      ["minLength", "maxLength"],
      ["minGraphemes", "maxGraphemes"],
    ]) {
      for (const key of [min, max])
        if (value[key] !== undefined)
          check(
            Number.isSafeInteger(value[key]) &&
              (key === "minimum" || key === "maximum" || value[key] >= 0),
            `Schema ${key} must be a safe ${key === "minimum" || key === "maximum" ? "" : "nonnegative "}integer.`,
          );
      check(
        value[min] === undefined ||
          value[max] === undefined ||
          value[min] <= value[max],
        `Schema ${min} must not exceed ${max}.`,
      );
    }
    Object.values(value).forEach(constraints);
  }
  constraints(copies);
  const docs = new Map(copies.map((d) => [d.id, d]));
  check(docs.size === copies.length, "Duplicate Lexicon ID.");
  const compiler = new Lexicons(structuredClone(copies));
  const collections = copies
    .filter((d) => d.defs.main?.type === "record")
    .map((d) => d.id);
  for (const id of collections)
    check(
      !id.startsWith("com.atproto.") &&
        id !== "app.bsky.actor.profile" &&
        !/^com\.tabschat\.(account|auth|identity|recovery|wallet|chat)(\.|$)/.test(
          id,
        ),
      `Protected collection: ${id}`,
    );
  function resolve(ref, owner) {
    const [id, name = "main"] = (ref.startsWith("#") ? owner + ref : ref).split(
      "#",
    );
    const def = docs.get(id)?.defs[name];
    check(def, `Missing Lexicon reference: ${id}#${name}`);
    return { def, owner: id };
  }
  function refs(value, owner) {
    if (!value || typeof value !== "object") return;
    if (value.type === "ref") resolve(value.ref, owner);
    if (value.type === "union") value.refs.forEach((r) => resolve(r, owner));
    Object.values(value).forEach((child) => refs(child, owner));
  }
  copies.forEach((d) => refs(d.defs, d.id));
  function exact(def, value, owner, path = "$", depth = 0) {
    check(depth <= 32, `${path}: schema exceeds nesting limits.`);
    if (value == null) return;
    if (def.type === "record")
      return exact(def.record, value, owner, path, depth + 1);
    if (def.type === "ref") {
      const r = resolve(def.ref, owner);
      return exact(r.def, value, r.owner, path, depth + 1);
    }
    if (def.type === "union") {
      const ref = def.refs.find(
        (r) => (r.startsWith("#") ? owner + r : r) === value.$type,
      );
      check(ref, `${path}: unregistered union variant.`);
      const r = resolve(ref, owner);
      return exact(r.def, value, r.owner, path, depth + 1);
    }
    if (def.type === "blob")
      check(
        value.$type === "blob" &&
          Object.keys(value).sort().join() === "$type,mimeType,ref,size" &&
          value.ref &&
          Object.keys(value.ref).join() === "$link",
        `${path}: invalid blob reference.`,
      );
    if (def.type === "array")
      value.forEach((v, i) =>
        exact(def.items, v, owner, `${path}[${i}]`, depth + 1),
      );
    if (def.type === "object")
      for (const [key, child] of Object.entries(value)) {
        if (key === "$type") continue;
        check(
          Object.hasOwn(def.properties, key),
          `${path}.${key}: undeclared field; add it to the Lexicon.`,
        );
        exact(def.properties[key], child, owner, `${path}.${key}`, depth + 1);
      }
  }
  return {
    collections,
    has: (id) => collections.includes(id),
    validate(collection, value) {
      check(
        collections.includes(collection),
        `No record Lexicon loaded for ${collection}. Import its schema or add lexicons/${collection}.json to your package.`,
      );
      check(
        value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          value.$type === collection,
        "Record $type must match its collection.",
      );
      let nodes = 0;
      function bound(v, depth = 0) {
        check(
          ++nodes <= 2048 && depth <= 16,
          "Record exceeds nesting or node limits.",
        );
        check(
          v !== undefined &&
            !(typeof v === "string" && v.includes("\0")) &&
            !(typeof v === "number" && !Number.isSafeInteger(v)),
          "Record must contain valid JSON values and safe integers.",
        );
        if (v && typeof v === "object")
          Object.values(v).forEach((x) => bound(x, depth + 1));
      }
      bound(value);
      check(bytes(value) <= 16384, "Record exceeds the 16 KB host limit.");
      compiler.assertValidRecord(collection, jsonToLex(value));
      exact(docs.get(collection).defs.main, value, collection);
      return value;
    },
  };
}
