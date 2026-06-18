const WS_URL_ENDPOINT = "/api/ws-url";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type WebSocketUrlResponse = {
  conversationId: string;
  expiresIn: number;
  webSocketUrl: string;
};

export type RequestWebSocketUrlOptions = {
  accessToken: string;
  conversationId: string;
  fetchFn?: FetchFn;
};

export async function requestWebSocketUrl({
  accessToken,
  conversationId,
  fetchFn = fetch,
}: RequestWebSocketUrlOptions): Promise<WebSocketUrlResponse> {
  const cleanedToken = accessToken.trim();
  if (!cleanedToken) {
    throw new Error("access token is required");
  }

  const response = await fetchFn(WS_URL_ENDPOINT, {
    body: JSON.stringify({ conversationId }),
    headers: {
      authorization: `Bearer ${cleanedToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      text(payload.error) || text(payload.message) || `HTTP ${response.status}`,
    );
  }

  const webSocketUrl = text(payload.webSocketUrl);
  if (!webSocketUrl) {
    throw new Error("webSocketUrl is missing");
  }

  return {
    conversationId: text(payload.conversationId) || conversationId,
    expiresIn:
      typeof payload.expiresIn === "number" &&
      Number.isFinite(payload.expiresIn)
        ? payload.expiresIn
        : 0,
    webSocketUrl,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
