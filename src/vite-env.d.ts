/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCORES_API?: string;
  /** Override GitHub raw scores mirror URL. */
  readonly VITE_SCORES_MIRROR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
