export type PublicAuthConfig = {
  clientId: string;
  issuer: string;
  redirectUri: string;
  scope: string;
};

export type AuthToken = {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
};

export type ChatAuthState =
  | {
      accessToken: "dev-local";
      mode: "dev";
      status: "authenticated";
    }
  | {
      config: PublicAuthConfig;
      mode: "jwt";
      status: "unauthenticated";
    }
  | {
      accessToken: string;
      config: PublicAuthConfig;
      expiresAt?: number;
      mode: "jwt";
      status: "authenticated";
    };

export function publicAuthConfigFromEnv(
  env: Record<string, string | undefined>,
): PublicAuthConfig | undefined {
  const issuer = trimTrailingSlash(clean(env.VITE_AUTH_ISSUER));
  const clientId = clean(env.VITE_AUTH_CLIENT_ID);
  const redirectUri = clean(env.VITE_AUTH_REDIRECT_URI);
  const scope = clean(env.VITE_AUTH_SCOPE);

  if (!issuer || !clientId || !redirectUri || !scope) {
    return undefined;
  }

  return {
    clientId,
    issuer,
    redirectUri,
    scope,
  };
}

export function initialAuthStateFromEnv(
  env: Record<string, string | undefined>,
): ChatAuthState {
  const config = publicAuthConfigFromEnv(env);
  return config
    ? { config, mode: "jwt", status: "unauthenticated" }
    : { accessToken: "dev-local", mode: "dev", status: "authenticated" };
}

export function authenticatedAuthState(
  config: PublicAuthConfig,
  token: AuthToken,
): ChatAuthState {
  return {
    accessToken: token.accessToken,
    config,
    expiresAt:
      token.expiresIn > 0 ? Date.now() + token.expiresIn * 1000 : undefined,
    mode: "jwt",
    status: "authenticated",
  };
}

function clean(value: string | undefined): string {
  return value?.trim() || "";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
