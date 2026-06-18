const SESSIONS_ENDPOINT = "/api/sessions";
const MEMORY_NOT_CONFIGURED_ERROR = "AgentCore Memory ID is not configured";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RemoteSessionSummary = {
  conversationId: string;
  createdAt: string;
};

export type SessionsResponse = {
  memoryId: string;
  sessions: RemoteSessionSummary[];
  truncated: boolean;
};

export type RequestAwsSessionsOptions = {
  accessToken: string;
  fetchFn?: FetchFn;
};

export class AgentCoreMemoryNotConfiguredError extends Error {
  override name = "AgentCoreMemoryNotConfiguredError";
}

export async function requestAwsSessions({
  accessToken,
  fetchFn = fetch,
}: RequestAwsSessionsOptions): Promise<SessionsResponse> {
  const cleanedToken = accessToken.trim();
  if (!cleanedToken) {
    throw new Error("access token is required");
  }

  const response = await fetchFn(SESSIONS_ENDPOINT, {
    headers: {
      authorization: `Bearer ${cleanedToken}`,
    },
    method: "GET",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    const message =
      text(payload.error) || text(payload.message) || `HTTP ${response.status}`;

    if (response.status === 503 && message === MEMORY_NOT_CONFIGURED_ERROR) {
      throw new AgentCoreMemoryNotConfiguredError(message);
    }

    throw new Error(message);
  }

  return {
    memoryId: text(payload.memoryId),
    sessions: Array.isArray(payload.sessions)
      ? payload.sessions.flatMap((item) => {
          const record = asRecord(item);
          const conversationId = text(record.conversationId);
          const createdAt = validIsoDate(text(record.createdAt));

          if (!conversationId || !createdAt) {
            return [];
          }

          return [{ conversationId, createdAt }];
        })
      : [],
    truncated: payload.truncated === true,
  };
}

export function isAgentCoreMemoryNotConfiguredError(error: unknown): boolean {
  return error instanceof AgentCoreMemoryNotConfiguredError;
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

function validIsoDate(value: string): string {
  return Number.isNaN(Date.parse(value)) ? "" : value;
}
