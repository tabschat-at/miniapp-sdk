// Rebuild the checked-in, offline validator after changing the pinned dev dependency.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const output = new URL("../dev-tools/vendor/", import.meta.url);
await mkdir(output, { recursive: true });
const result = await build({
  stdin: {
    contents:
      'export { Lexicons, jsonToLex, lexiconDoc } from "@atproto/lexicon";',
    resolveDir: dirname(require.resolve("@atproto/lexicon")),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "inline",
  metafile: true,
  outfile: new URL("lexicon.js", output).pathname,
});
const roots = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) roots.add(match[1]);
}
let notices =
  "Bundled offline dependencies. Rebuild with npm run dev-tools:build.\n";
for (const root of [...roots].sort()) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  let license;
  for (const name of [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "license",
    "license.md",
  ]) {
    try {
      license = await readFile(join(root, name), "utf8");
      break;
    } catch {}
  }
  if (!license) throw Error(`Missing license for ${pkg.name}`);
  notices += `\n----- ${pkg.name}@${pkg.version} (${pkg.license}) -----\n${license}\n`;
}
await writeFile(new URL("LICENSES.txt", output), notices);
