/**
 * Build/runtime client label for leaderboard submits.
 * Format: `web_0.1.x` where x is the repo commit count at build time.
 */
export function vernanVersion(): string {
  const fromEnv = import.meta.env.VITE_VERNAN_VERSION;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/^v/i, "");
  }
  return "0.1.0";
}

/** e.g. `web_0.1.19` */
export function webClientId(): string {
  return `web_${vernanVersion()}`;
}
