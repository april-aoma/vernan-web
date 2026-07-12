/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCORES_API?: string;
  /** Auth worker (login/register); separate from scores. */
  readonly VITE_AUTH_API?: string;
  /** Override GitHub raw scores mirror URL. */
  readonly VITE_SCORES_MIRROR_URL?: string;
  /** Semver patch from commit count, e.g. `0.1.19`. */
  readonly VITE_VERNAN_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
