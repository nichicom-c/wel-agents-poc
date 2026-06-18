import type { AuthToken, PublicAuthConfig } from "../model/auth-state.ts";

export const PKCE_STORAGE_KEY = "wel-agents-chat-pkce";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AuthorizationRequest = {
  state: string;
  url: string;
};

export type AuthDeps = {
  crypto?: Pick<Crypto, "getRandomValues" | "subtle">;
  storage?: Storage;
};

export type ExchangeAuthorizationCodeOptions = {
  code: string;
  config: PublicAuthConfig;
  fetchFn?: FetchFn;
  state: string;
  storage?: Storage;
};

type PkceTransaction = {
  codeVerifier: string;
  state: string;
};

export async function createAuthorizationRequest(
  config: PublicAuthConfig,
  deps: AuthDeps = {},
): Promise<AuthorizationRequest> {
  const cryptoApi = deps.crypto ?? crypto;
  const storage = deps.storage ?? sessionStorage;
  const codeVerifier = randomBase64Url(32, cryptoApi);
  const state = randomBase64Url(16, cryptoApi);
  const codeChallenge = await pkceChallenge(codeVerifier, cryptoApi);

  storage.setItem(
    PKCE_STORAGE_KEY,
    JSON.stringify({ codeVerifier, state } satisfies PkceTransaction),
  );

  const url = new URL(`${config.issuer}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { state, url: url.toString() };
}

export async function exchangeAuthorizationCode({
  code,
  config,
  fetchFn = fetch,
  state,
  storage = sessionStorage,
}: ExchangeAuthorizationCodeOptions): Promise<AuthToken> {
  const transaction = readPkceTransaction(storage);
  if (!transaction || transaction.state !== state) {
    throw new Error("authorization state is invalid");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_verifier: transaction.codeVerifier,
  });

  const response = await fetchFn(`${config.issuer}/oauth2/token`, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = asRecord(await response.json().catch(() => ({})));

  if (!response.ok) {
    throw new Error(
      text(payload.error_description) ||
        text(payload.error) ||
        `HTTP ${response.status}`,
    );
  }

  const accessToken = text(payload.access_token);
  if (!accessToken) {
    throw new Error("access token is missing");
  }

  storage.removeItem(PKCE_STORAGE_KEY);

  return {
    accessToken,
    expiresIn:
      typeof payload.expires_in === "number" &&
      Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : 0,
    tokenType: text(payload.token_type) || "Bearer",
  };
}

function readPkceTransaction(storage: Storage): PkceTransaction | undefined {
  const parsed = asRecord(
    JSON.parse(storage.getItem(PKCE_STORAGE_KEY) || "{}"),
  );
  const codeVerifier = text(parsed.codeVerifier);
  const state = text(parsed.state);
  return codeVerifier && state ? { codeVerifier, state } : undefined;
}

async function pkceChallenge(
  codeVerifier: string,
  cryptoApi: Pick<Crypto, "subtle">,
): Promise<string> {
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return base64Url(new Uint8Array(digest));
}

function randomBase64Url(
  byteLength: number,
  cryptoApi: Pick<Crypto, "getRandomValues">,
): string {
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
