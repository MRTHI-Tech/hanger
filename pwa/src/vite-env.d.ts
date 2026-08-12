/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Clerk's publishable key. Public by design — it ends up in the bundle.
   * Absent means no sign-in: the app pairs with a laptop instead, which is how
   * it works when the whole thing is running locally with no keys at all.
   */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
