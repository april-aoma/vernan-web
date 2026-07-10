import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative base so GitHub Pages / any subpath host works without hardcoding.
  base: "./",
  root: ".",
  publicDir: "public",
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
