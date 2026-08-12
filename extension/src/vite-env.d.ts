/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Clerk key injected from server/.env by the extension Vite build. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
