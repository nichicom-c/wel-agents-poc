const DEV_INFO_ENDPOINT = "/api/dev-info";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HealthStatus =
  | { status: "ok"; checkedAt: string }
  | { status: "not_checked"; reason: string }
  | { status: "error"; message: string; checkedAt: string };

export type DevInfo = {
  auth: {
    clientId: string;
    jwtIssuer: string;
  };
  aws: {
    accountId: string;
    region: string;
  };
  bff: {
    apiEndpoint: string;
    authMode: "dev" | "jwt";
    health: HealthStatus;
    lambdaFunctionName: string;
    lambdaLogGroupName: string;
  };
  chatUi: {
    apiRouteBase: string;
    origin: string;
  };
  generatedAt: string;
  knowledgeBases: {
    database: string;
    document: string;
    law: string;
    medical_care_law: string;
    support_activity: string;
  };
  memory: {
    id: string;
  };
  runtime: {
    arn: string;
    endpointName: string;
    health: HealthStatus;
    qualifier: string;
  };
};

export type RequestDevInfoOptions = {
  accessToken: string;
  fetchFn?: FetchFn;
  locationOrigin?: string;
};

export async function requestDevInfo({
  accessToken,
  fetchFn = fetch,
  locationOrigin = globalThis.location?.origin,
}: RequestDevInfoOptions): Promise<DevInfo> {
  const cleanedToken = accessToken.trim();
  if (!cleanedToken) {
    throw new Error("access token is required");
  }

  const response = await fetchFn(DEV_INFO_ENDPOINT, {
    headers: {
      authorization: `Bearer ${cleanedToken}`,
    },
    method: "GET",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      text(payload.error) || text(payload.message) || `HTTP ${response.status}`,
    );
  }

  return normalizeDevInfo(payload, locationOrigin);
}

function normalizeDevInfo(
  payload: Record<string, unknown>,
  locationOrigin: string | undefined,
): DevInfo {
  const auth = asRecord(payload.auth);
  const aws = asRecord(payload.aws);
  const bff = asRecord(payload.bff);
  const knowledgeBases = asRecord(payload.knowledgeBases);
  const memory = asRecord(payload.memory);
  const runtime = asRecord(payload.runtime);
  const origin = text(locationOrigin) || "unknown";

  return {
    auth: {
      clientId: text(auth.clientId) || "not_configured",
      jwtIssuer: text(auth.jwtIssuer) || "not_configured",
    },
    aws: {
      accountId: text(aws.accountId) || "unknown",
      region: text(aws.region) || "unknown",
    },
    bff: {
      apiEndpoint: text(bff.apiEndpoint) || "unknown",
      authMode: bff.authMode === "jwt" ? "jwt" : "dev",
      health: normalizeHealthStatus(bff.health),
      lambdaFunctionName: text(bff.lambdaFunctionName) || "not_configured",
      lambdaLogGroupName: text(bff.lambdaLogGroupName) || "not_configured",
    },
    chatUi: {
      apiRouteBase:
        origin === "unknown" ? "unknown" : new URL("/api", origin).toString(),
      origin,
    },
    generatedAt: text(payload.generatedAt) || "unknown",
    knowledgeBases: {
      database: text(knowledgeBases.database) || "not_configured",
      document: text(knowledgeBases.document) || "not_configured",
      law: text(knowledgeBases.law) || "not_configured",
      medical_care_law:
        text(knowledgeBases.medical_care_law) || "not_configured",
      support_activity:
        text(knowledgeBases.support_activity) || "not_configured",
    },
    memory: {
      id: text(memory.id) || "not_configured",
    },
    runtime: {
      arn: text(runtime.arn) || "not_configured",
      endpointName: text(runtime.endpointName) || "not_configured",
      health: normalizeHealthStatus(runtime.health),
      qualifier: text(runtime.qualifier) || "not_configured",
    },
  };
}

function normalizeHealthStatus(value: unknown): HealthStatus {
  const health = asRecord(value);
  if (health.status === "ok") {
    return {
      checkedAt: text(health.checkedAt) || "unknown",
      status: "ok",
    };
  }

  if (health.status === "error") {
    return {
      checkedAt: text(health.checkedAt) || "unknown",
      message: text(health.message) || "error",
      status: "error",
    };
  }

  return {
    reason: text(health.reason) || "not checked",
    status: "not_checked",
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
