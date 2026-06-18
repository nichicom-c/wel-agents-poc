/// <reference types="vite/client" />

declare module "@fontsource-variable/material-symbols-rounded";

interface ImportMetaEnv {
  readonly VITE_AUTH_CLIENT_ID?: string;
  readonly VITE_AUTH_ISSUER?: string;
  readonly VITE_AUTH_REDIRECT_URI?: string;
  readonly VITE_AUTH_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
