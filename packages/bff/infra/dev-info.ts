import type {
  DevInfoRequestContext,
  DevInfoResponse,
  HealthStatus,
} from "../contracts/dev-info.ts";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type DevInfoConfig = {
  authClientId?: string;
  authMode: "dev" | "jwt";
  databaseKbId?: string;
  documentKbId?: string;
  lawKbId?: string;
  medicalCareLawKbId?: string;
  supportActivityKbId?: string;
  jwtIssuer?: string;
  lambdaFunctionName?: string;
  lambdaLogGroupName?: string;
  localRuntimeUrl?: string;
  memoryId?: string;
  region?: string;
  runtimeArn: string;
  runtimeEndpointName?: string;
  runtimeQualifier: string;
};

export type CallerIdentity = {
  accountId?: string;
};

export type BuildDevInfoDeps = DevInfoRequestContext & {
  fetchFn?: FetchFn;
  getCallerIdentity?: () => Promise<CallerIdentity>;
  now?: () => Date;
};

export async function buildDevInfo(
  config: DevInfoConfig,
  deps: BuildDevInfoDeps = {},
): Promise<DevInfoResponse> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now().toISOString();
  const runtimeArn = clean(config.runtimeArn);
  const runtimeQualifier = clean(config.runtimeQualifier);
  const accountId = await resolveAccountId(runtimeArn, deps.getCallerIdentity);

  return {
    auth: {
      clientId: clean(config.authClientId) ?? "not_configured",
      jwtIssuer: clean(config.jwtIssuer) ?? "not_configured",
    },
    aws: {
      accountId: accountId ?? "unknown",
      region:
        clean(config.region) ?? parseRegionFromArn(runtimeArn) ?? "unknown",
    },
    bff: {
      apiEndpoint: deriveApiEndpoint(deps),
      authMode: config.authMode,
      health: { checkedAt, status: "ok" },
      lambdaFunctionName: clean(config.lambdaFunctionName) ?? "not_configured",
      lambdaLogGroupName: clean(config.lambdaLogGroupName) ?? "not_configured",
    },
    generatedAt: checkedAt,
    knowledgeBases: {
      database: clean(config.databaseKbId) ?? "not_configured",
      document: clean(config.documentKbId) ?? "not_configured",
      law: clean(config.lawKbId) ?? "not_configured",
      medical_care_law: clean(config.medicalCareLawKbId) ?? "not_configured",
      support_activity: clean(config.supportActivityKbId) ?? "not_configured",
    },
    memory: {
      id: clean(config.memoryId) ?? "not_configured",
    },
    runtime: {
      arn: runtimeArn ?? "not_configured",
      endpointName:
        clean(config.runtimeEndpointName) ??
        runtimeQualifier ??
        "not_configured",
      health: await runtimeHealth(config.localRuntimeUrl, checkedAt, deps),
      qualifier: runtimeQualifier ?? "not_configured",
    },
  };
}

export function parseAccountIdFromArn(
  arn: string | undefined,
): string | undefined {
  const accountId = clean(arn)?.split(":")[4];
  return accountId && /^[0-9]{12}$/.test(accountId) ? accountId : undefined;
}

export function deriveApiEndpoint(context: DevInfoRequestContext): string {
  if (context.requestUrl) {
    return new URL(context.requestUrl).origin;
  }

  const host =
    headerValue(context.headers, "x-forwarded-host") ??
    headerValue(context.headers, "host");
  if (!host) {
    return "unknown";
  }

  const protocol = headerValue(context.headers, "x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

async function resolveAccountId(
  runtimeArn: string | undefined,
  getCallerIdentity: (() => Promise<CallerIdentity>) | undefined,
): Promise<string | undefined> {
  if (getCallerIdentity) {
    try {
      return (
        clean((await getCallerIdentity()).accountId) ??
        parseAccountIdFromArn(runtimeArn)
      );
    } catch {
      return parseAccountIdFromArn(runtimeArn);
    }
  }

  return parseAccountIdFromArn(runtimeArn);
}

function parseRegionFromArn(arn: string | undefined): string | undefined {
  return clean(arn)?.split(":")[3] || undefined;
}

async function runtimeHealth(
  localRuntimeUrl: string | undefined,
  checkedAt: string,
  deps: BuildDevInfoDeps,
): Promise<HealthStatus> {
  const runtimeUrl = clean(localRuntimeUrl);
  if (!runtimeUrl || !deps.fetchFn) {
    return {
      reason: "production runtime health is not checked by this endpoint",
      status: "not_checked",
    };
  }

  try {
    const response = await deps.fetchFn(joinUrl(runtimeUrl, "/ping"));
    if (response.ok) {
      return { checkedAt, status: "ok" };
    }
    return {
      checkedAt,
      message: `HTTP ${response.status}`,
      status: "error",
    };
  } catch (error) {
    return {
      checkedAt,
      message: error instanceof Error ? error.message : String(error),
      status: "error",
    };
  }
}

function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name,
  );
  return clean(entry?.[1]);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function clean(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
