#!/usr/bin/env node
/**
 * Sync runtime assets into public/assets/ from either:
 *   --java-root <path>   run the Java packer, then copy dist/runtime-pack/
 *   --zip <path>         unpack vernan-runtime-assets.zip
 *   --from-dist <path>   copy an already-unpacked pack directory
 *
 * Default --java-root: sibling "../new vernan!" when present.
 */
import { spawnSync, execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const outAssets = join(webRoot, "public", "assets");
const PACK_NAMES = ["sprites", "data", "tiles", "tileset", "runtime-manifest.json"];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function defaultJavaRoot() {
  const sibling = resolve(webRoot, "..", "new vernan!");
  return existsSync(sibling) ? sibling : undefined;
}

function clearAssets() {
  for (const name of PACK_NAMES) {
    const p = join(outAssets, name);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  mkdirSync(outAssets, { recursive: true });
}

function copyPackDir(fromDir) {
  clearAssets();
  let copied = 0;
  for (const name of PACK_NAMES) {
    const src = join(fromDir, name);
    if (!existsSync(src)) continue;
    cpSync(src, join(outAssets, name), { recursive: true });
    copied++;
  }
  if (copied === 0) {
    throw new Error(`No pack contents found under ${fromDir}`);
  }
  console.log(`Synced ${copied} entries → ${outAssets}`);
}

function unpackZip(zipPath) {
  if (!existsSync(zipPath)) {
    throw new Error(`Zip not found: ${zipPath}`);
  }
  const tmp = join(webRoot, ".tmp-asset-unpack");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", tmp], { stdio: "inherit" });

  let packRoot = tmp;
  const hasFlat = PACK_NAMES.some((c) => existsSync(join(tmp, c)));
  if (!hasFlat) {
    const kids = readdirSync(tmp).filter((n) => !n.startsWith("."));
    if (kids.length === 1 && statSync(join(tmp, kids[0])).isDirectory()) {
      packRoot = join(tmp, kids[0]);
    }
  }
  copyPackDir(packRoot);
  rmSync(tmp, { recursive: true, force: true });
}

function packFromJava(javaRoot) {
  const script = join(javaRoot, "scripts", "pack-runtime-assets.sh");
  if (!existsSync(script)) {
    throw new Error(
      `Missing ${script}\nCreate the packer in the Java repo first (see plan Phase 0 §2).`,
    );
  }
  console.log(`Running packer in ${javaRoot} …`);
  const r = spawnSync("bash", [script], {
    cwd: javaRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`pack-runtime-assets.sh exited ${r.status}`);
  }
  const packDir = join(javaRoot, "dist", "runtime-pack");
  const zipPath = join(javaRoot, "dist", "vernan-runtime-assets.zip");
  if (existsSync(packDir)) {
    copyPackDir(packDir);
  } else if (existsSync(zipPath)) {
    unpackZip(zipPath);
  } else {
    throw new Error("Packer finished but neither dist/runtime-pack nor zip was found");
  }
}

function main() {
  const zip = argValue("--zip");
  const fromDist = argValue("--from-dist");
  const javaRoot = argValue("--java-root") ?? (!zip && !fromDist ? defaultJavaRoot() : undefined);

  if (zip) {
    unpackZip(resolve(zip));
    return;
  }
  if (fromDist) {
    copyPackDir(resolve(fromDist));
    return;
  }
  if (javaRoot) {
    packFromJava(resolve(javaRoot));
    return;
  }

  console.error(`Usage:
  node scripts/pack-assets.mjs --java-root "/path/to/java/vernan"
  node scripts/pack-assets.mjs --zip "/path/to/vernan-runtime-assets.zip"
  node scripts/pack-assets.mjs --from-dist "/path/to/unpacked/pack"

Default java root (if present): ../new vernan!`);
  process.exit(1);
}

main();
