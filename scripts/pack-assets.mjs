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
  installExactSourcePaletteKeys();
  console.log(`Synced ${copied} entries → ${outAssets}`);
}

/**
 * Overlay combat/enemy sprites that may be missing from a stale runtime pack.
 * Safe to call after copyPackDir when a Java source tree is available.
 */
function overlayCombatSpritesFromJava(javaRoot) {
  const srcSprites = join(javaRoot, "sprites");
  const destSprites = join(outAssets, "sprites");
  if (!existsSync(srcSprites)) return;
  mkdirSync(destSprites, { recursive: true });
  const overlay = [
    "hit slash.png",
    "hit flint.png",
    "hit stick.png",
    "hit black heart.png",
    "hit ice.png",
    "hit money.png",
    "hit shield break.png",
    "hit shield.png",
    "hit kuribo.png",
    "hit electric.png",
    "hit fist.png",
    "hit fallback.png",
    "electric shock.png",
    "rolling head cc.png",
    "multilimber body.png",
    "multilimber head.png",
    "multilimber eye.png",
    "golden roach2.png",
    "golden roach2 fly.png",
    "FX enemy heal.png",
  ];
  let n = 0;
  for (const rel of overlay) {
    const src = join(srcSprites, rel);
    if (!existsSync(src)) continue;
    const dest = join(destSprites, rel);
    cpSync(src, dest);
    n++;
  }
  if (n > 0) console.log(`Overlayed ${n} combat sprites from ${srcSprites}`);
}

/** Java rebuildExactSourceColors keys — committed seed, refreshed when dumping from Java. */
function installExactSourcePaletteKeys() {
  const seed = join(webRoot, "data", "palette-exact-source-keys.json");
  if (!existsSync(seed)) {
    console.warn(`Missing ${seed} — palette clamp will only preserve grid swatches`);
    return;
  }
  const destDir = join(outAssets, "data");
  mkdirSync(destDir, { recursive: true });
  cpSync(seed, join(destDir, "palette-exact-source-keys.json"));
}

/**
 * Rebuild exact-source keys from the Java SoT (InGameSpritePaths + game-palette.png).
 * Requires a prior ./run.sh compile so /tmp/vernan-out-* classes exist.
 */
function dumpExactSourcePaletteKeys(javaRoot) {
  const dumpSrc = join(javaRoot, "tmp", "DumpExactSourcePaletteKeys.java");
  if (!existsSync(dumpSrc)) {
    console.warn(`Skip palette key dump: missing ${dumpSrc}`);
    return;
  }
  const hash = execFileSync("shasum", ["-a", "256"], {
    input: javaRoot,
    encoding: "utf8",
  })
    .trim()
    .slice(0, 16);
  const cp = join("/tmp", `vernan-out-${hash}`);
  if (!existsSync(join(cp, "game", "render", "GameColorPalette.class"))) {
    console.warn(
      `Skip palette key dump: compile Java first (./run.sh) — missing ${cp}/game/render/GameColorPalette.class`,
    );
    return;
  }
  const outJson = join(webRoot, "data", "palette-exact-source-keys.json");
  const tmpOut = join(webRoot, ".tmp-palette-dump");
  rmSync(tmpOut, { recursive: true, force: true });
  mkdirSync(tmpOut, { recursive: true });
  execFileSync(
    "javac",
    ["-encoding", "UTF-8", "--release", "17", "-cp", cp, "-d", tmpOut, dumpSrc],
    { stdio: "inherit" },
  );
  execFileSync("java", ["-cp", `${tmpOut}:${cp}`, "DumpExactSourcePaletteKeys", javaRoot, outJson], {
    stdio: "inherit",
  });
  rmSync(tmpOut, { recursive: true, force: true });
  installExactSourcePaletteKeys();
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
  overlayCombatSpritesFromJava(javaRoot);
}

function main() {
  const zip = argValue("--zip");
  const fromDist = argValue("--from-dist");
  const dumpOnly = process.argv.includes("--dump-palette-keys");
  const javaRoot = argValue("--java-root") ?? (!zip && !fromDist ? defaultJavaRoot() : undefined);

  if (dumpOnly) {
    if (!javaRoot) {
      console.error("--dump-palette-keys requires --java-root or sibling ../new vernan!");
      process.exit(1);
    }
    dumpExactSourcePaletteKeys(resolve(javaRoot));
    return;
  }

  if (zip) {
    unpackZip(resolve(zip));
    return;
  }
  if (fromDist) {
    copyPackDir(resolve(fromDist));
    return;
  }
  if (javaRoot) {
    const root = resolve(javaRoot);
    packFromJava(root);
    dumpExactSourcePaletteKeys(root);
    return;
  }

  console.error(`Usage:
  node scripts/pack-assets.mjs --java-root "/path/to/java/vernan"
  node scripts/pack-assets.mjs --zip "/path/to/vernan-runtime-assets.zip"
  node scripts/pack-assets.mjs --from-dist "/path/to/unpacked/pack"
  node scripts/pack-assets.mjs --dump-palette-keys [--java-root ...]

Default java root (if present): ../new vernan!`);
  process.exit(1);
}

main();
