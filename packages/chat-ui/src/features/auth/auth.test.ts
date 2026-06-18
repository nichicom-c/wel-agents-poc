import { describe, expect, test } from "bun:test";

import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  initialAuthStateFromEnv,
  PKCE_STORAGE_KEY,
  publicAuthConfigFromEnv,
} from "./index.ts";

const AUTH_CONFIG = {
  clientId: "client-123",
  issuer: "https://auth.example.com",
  redirectUri: "https://app.example.com/callback",
  scope: "openid email profile",
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("publicAuthConfigFromEnv", () => {
  test("public VITE_AUTH env を trim して読み取る", () => {
    expect(
      publicAuthConfigFromEnv({
        VITE_AUTH_CLIENT_ID: " client-123 ",
        VITE_AUTH_ISSUER: " https://auth.example.com/ ",
        VITE_AUTH_REDIRECT_URI: " https://app.example.com/callback ",
        VITE_AUTH_SCOPE: " openid email profile ",
      }),
    ).toEqual(AUTH_CONFIG);
  });

  test("public auth config がなければ dev auth state を返す", () => {
    expect(initialAuthStateFromEnv({})).toEqual({
      accessToken: "dev-local",
      mode: "dev",
      status: "authenticated",
    });
  });
});

describe("PKCE authorization code flow", () => {
  test("authorize URL に PKCE parameters を含める", async () => {
    const storage = new MemoryStorage();
    const request = await createAuthorizationRequest(AUTH_CONFIG, { storage });
    const url = new URL(request.url);

    expect(url.toString()).toStartWith(
      "https://auth.example.com/oauth2/authorize?",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/callback",
    );
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(request.state);

    const stored = JSON.parse(String(storage.getItem(PKCE_STORAGE_KEY))) as {
      codeVerifier: string;
      state: string;
    };
    expect(stored.state).toBe(request.state);
    expect(stored.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  test("token exchange は authorization_code と code_verifier を POST する", async () => {
    const storage = new MemoryStorage();
    const request = await createAuthorizationRequest(AUTH_CONFIG, { storage });
    const stored = JSON.parse(String(storage.getItem(PKCE_STORAGE_KEY))) as {
      codeVerifier: string;
    };
    let captured: { body?: BodyInit | null; url?: string } = {};

    const token = await exchangeAuthorizationCode({
      code: "auth-code",
      config: AUTH_CONFIG,
      fetchFn: async (url, init) => {
        captured = { body: init?.body, url: String(url) };
        return Response.json({
          access_token: "jwt-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      },
      state: request.state,
      storage,
    });

    expect(captured.url).toBe("https://auth.example.com/oauth2/token");
    const body = new URLSearchParams(String(captured.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("client_id")).toBe("client-123");
    expect(body.get("redirect_uri")).toBe("https://app.example.com/callback");
    expect(body.get("code_verifier")).toBe(stored.codeVerifier);
    expect(token).toEqual({
      accessToken: "jwt-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    expect(storage.getItem(PKCE_STORAGE_KEY)).toBe(null);
  });
});
