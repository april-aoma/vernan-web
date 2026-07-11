import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const SCORES_PATH = resolve(rootDir, "data/scores.json");
const DEV_SCORES_ROUTE = "/__repo/scores.json";

function gitCommitCount(): number {
  try {
    const out = execSync("git rev-list --count HEAD", {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();
    const n = Number(out);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

const vernanVersion =
  (typeof process.env.VITE_VERNAN_VERSION === "string" &&
    process.env.VITE_VERNAN_VERSION.trim()) ||
  `0.1.${gitCommitCount()}`;

/** Live scores Worker — used whenever env is unset (local + Pages). */
const scoresApi =
  (typeof process.env.VITE_SCORES_API === "string" &&
    process.env.VITE_SCORES_API.trim()) ||
  "https://vernan-scores.henrysbasu.workers.dev";

/** Dev-only: serve repo `data/scores.json` without putting it in the Pages artifact. */
function repoScoresDevPlugin(): Plugin {
  return {
    name: "vernan-repo-scores-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== DEV_SCORES_ROUTE) {
          next();
          return;
        }
        try {
          const body = readFileSync(SCORES_PATH);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (err) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so GitHub Pages / any subpath host works without hardcoding.
  base: "./",
  root: ".",
  publicDir: "public",
  plugins: [repoScoresDevPlugin()],
  define: {
    "import.meta.env.VITE_VERNAN_VERSION": JSON.stringify(vernanVersion),
    "import.meta.env.VITE_SCORES_API": JSON.stringify(scoresApi),
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "js",
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        leaderboard: resolve(rootDir, "leaderboard.html"),
        crashes: resolve(rootDir, "crashes.html"),
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    // Allow Cloudflare / localhost.run tunnels when sharing a build.
    allowedHosts: true,
  },
});
