/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where to send somebody for a pairing code. Displayed, never called. */
  readonly VITE_PWA_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
