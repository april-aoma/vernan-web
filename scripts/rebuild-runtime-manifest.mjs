#!/usr/bin/env node
/**
 * Rebuild public/assets/runtime-manifest.json by walking the synced asset tree.
 * Use when the Java packer manifest is missing but sprites/data/tiles are present.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const assetsRoot = join(webRoot, "public", "assets");
const outPath = join(assetsRoot, "runtime-manifest.json");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const files = walk(assetsRoot)
  .filter((abs) => relative(assetsRoot, abs) !== "runtime-manifest.json")
  .sort((a, b) =>
    relative(assetsRoot, a).localeCompare(relative(assetsRoot, b), "en"),
  );

const entries = [];
let totalBytes = 0;
const packHash = createHash("sha256");
for (const abs of files) {
  const buf = readFileSync(abs);
  const path = relative(assetsRoot, abs).split("\\").join("/");
  const sha256 = createHash("sha256").update(buf).digest("hex");
  entries.push({ path, bytes: buf.length, sha256 });
  totalBytes += buf.length;
  packHash.update(path);
  packHash.update("\0");
  packHash.update(buf);
}

const manifest = {
  generator: "scripts/rebuild-runtime-manifest.mjs",
  fileCount: entries.length,
  totalBytes,
  sha256: packHash.digest("hex"),
  files: entries,
};

writeFileSync(outPath, `${JSON.stringify(manifest)}\n`);
const costume = entries.filter((e) => e.path.startsWith("sprites/costume/")).length;
const vernan = entries.filter((e) => e.path.startsWith("sprites/vernan/")).length;
console.log(
  `Wrote ${outPath} (${entries.length} files, costume=${costume}, vernan=${vernan})`,
);
