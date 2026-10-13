#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

import {
  validateManifest,
  requireCheck,
} from "../dev-tools/common/manifest.js";
export {
  capabilities,
  validateManifest,
} from "../dev-tools/common/manifest.js";

import { createRecordSchemas } from "../dev-tools/common/records.js";

export async function loadLexicons(folder) {
  if (folder instanceof URL) folder = fileURLToPath(folder);
  const directory = join(folder, "lexicons");
  const files = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  requireCheck(files.length <= 128, "Too many schemas");
  const documents = [];
  let totalBytes = 0;
  for (const file of files) {
    requireCheck(
      file.isFile() && file.name.endsWith(".json"),
      "Lexicons folder accepts JSON files only",
    );
    const body = await readFile(join(directory, file.name), "utf8");
    totalBytes += Buffer.byteLength(body);
    requireCheck(totalBytes <= 1024 * 1024, "Schemas exceed 1 MB");
    documents.push(JSON.parse(body));
  }
  createRecordSchemas(documents);
  return documents;
}
export async function validatePackage(folder) {
  if (folder instanceof URL) folder = fileURLToPath(folder);
  const documents = await loadLexicons(folder);
  const manifest = validateManifest(
    JSON.parse(await readFile(join(folder, "manifest.json"), "utf8")),
    documents,
  );
  return { manifest, documents };
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3) {
    console.error("Usage: tabs-miniapp-validate /path/to/app-package");
    process.exitCode = 1;
  } else {
    try {
      const { manifest } = await validatePackage(resolve(process.argv[2]));
      console.log(
        `${manifest.id}: local preflight passed. Operator schema registration and approval remain required.`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
