import { validateManifest } from "./manifest.js";
import { createRecordSchemas } from "./records.js";

export function validateAppPackage(value) {
  if (value?.v !== 1 || !Array.isArray(value.lexicons))
    throw Error("Expected a V1 app package with manifest and lexicons.");
  validateManifest(value.manifest, value.lexicons);
  createRecordSchemas(value.lexicons);
  return structuredClone({
    v: 1,
    manifest: value.manifest,
    lexicons: value.lexicons,
  });
}

export function packageFiles(manifest, lexicons, snippet = "") {
  const pkg = validateAppPackage({ v: 1, manifest, lexicons });
  const json = (value) => JSON.stringify(value, null, 2) + "\n";
  return {
    "manifest.json": json(pkg.manifest),
    "app-package.json": json(pkg),
    ...Object.fromEntries(
      pkg.lexicons.map((doc) => [`lexicons/${doc.id}.json`, json(doc)]),
    ),
    "discovery.html": snippet + "\n",
    "README.txt":
      "Tabs app package\n\nCopy manifest.json, app-package.json and lexicons/ beside your app HTML.\nAdd the links from discovery.html to the HTML head. Keep app-package.json in sync when editing individual files.\n\nCheck: tabs-miniapp-validate ./your-app\nTest: tabs-miniapp-simulate --app ./your-app\nOr import app-package.json in the local simulator inspector.\n\nRecords are public. Local validation does not register or approve schemas with Tabs.\nKeep reviewed shared schemas unchanged; the simple editor is for new schemas.\n",
  };
}

// Store-only ZIP: no compression dependency or network needed by the local tool.
export function packageZip(files) {
  const encoder = new TextEncoder(),
    chunks = [],
    directory = [];
  let offset = 0;
  const crc = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let i = 0; i < 8; i++)
        value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const header = (length) => {
    const data = new Uint8Array(length);
    return { data, view: new DataView(data.buffer) };
  };
  for (const [path, contents] of Object.entries(files)) {
    if (!/^(?:lexicons\/)?[a-zA-Z0-9._-]+$/.test(path))
      throw Error("Invalid package file name.");
    const name = encoder.encode(path),
      body = encoder.encode(contents),
      checksum = crc(body);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x800, true);
    local.view.setUint16(12, 33, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, body.length, true);
    local.view.setUint32(22, body.length, true);
    local.view.setUint16(26, name.length, true);
    chunks.push(local.data, name, body);
    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x800, true);
    central.view.setUint16(14, 33, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, body.length, true);
    central.view.setUint32(24, body.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    directory.push(central.data, name);
    offset += 30 + name.length + body.length;
  }
  const directorySize = directory.reduce((sum, data) => sum + data.length, 0),
    end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, Object.keys(files).length, true);
  end.view.setUint16(10, Object.keys(files).length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directorySize + 22);
  let position = 0;
  for (const chunk of [...chunks, ...directory, end.data]) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}
