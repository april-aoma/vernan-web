import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const SCORES_PATH = resolve(rootDir, "data/scores.json");
const DEV_SCORES_ROUTE = "/__repo/scores.json";

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
