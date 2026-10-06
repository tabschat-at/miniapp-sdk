import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validatePackage } from "./validate.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
async function check(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.(m?js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${path}`);
    }
  }
}
await check(root);
for (const name of [
  "hello-tabs",
  "recipe-notebook",
  "native-actions",
  "own-backend",
])
  await validatePackage(join(root, "examples", name));
const result = spawnSync(process.execPath, ["--test", "tests/*.test.mjs"], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
