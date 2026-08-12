/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Clerk key injected from server/.env by the extension Vite build. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** The phone app's origin, which is where the panel's session comes from. */
  readonly VITE_PWA_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
