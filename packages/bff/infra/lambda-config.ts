import type { DevInfoConfig } from "./dev-info.ts";

export type BffAuthMode = "dev" | "jwt";

/** production BFF Lambda が AgentCore Runtime を呼ぶための設定。 */
export type LambdaConfig = {
  /** actor ID として使う JWT claim 名。 */
  actorClaim: string;
  /** RuntimePayload に埋め込む actor ID。 */
  actorId: string;
  /** BFF の認証 mode。production は JWT authorizer 前提。 */
  authMode: BffAuthMode;
  /** dev mode で認証済み user として扱う ID。 */
  devUserId?: string;
  /** Chat UI に返す Dev Info 用の non-secret 設定。 */
  devInfo?: DevInfoConfig;
  /** AgentCore Runtime alias / qualifier。 */
  qualifier: string;
  /** AgentCore Runtime API の region。 */
  region: string;
  /** Runtime invoke の timeout。Lambda timeout より短く保つ。 */
  requestTimeoutMs: number;
  /** invoke 対象の AgentCore Runtime ARN。 */
  runtimeArn: string;
  /** user ID として使う JWT claim 名。 */
  userIdClaim: string;
  /** presigned WebSocket URL の有効秒数。未設定なら caller 側で既定値を使う。 */
  wsUrlExpiresSeconds?: number;
};

/** 環境変数の読み取り元。テストでは任意の object を渡せる（process.env を汚さない）。 */
export type EnvSource = Record<string, string | undefined>;

/**
 * Lambda env から AgentCore Runtime invoke 設定を組み立てる。
 *
 * Terraform が渡す Runtime ARN / region を必須とし、actor ID、qualifier、timeout は
 * local 検証しやすい既定値を持つ。
 */
export function configFromEnv(env: EnvSource = process.env): LambdaConfig {
  const devUserId = cleanOptional(env.BFF_DEV_USER_ID);
  const wsUrlExpiresSeconds = optionalNumberFromEnv(
    env,
    "WS_URL_EXPIRES_SECONDS",
  );
  const authMode = authModeFromEnv(env.BFF_AUTH_MODE);
  const qualifier = cleanOptional(env.AGENT_RUNTIME_QUALIFIER) || "sample";
  const region = requiredEnv(env, "AGENT_RUNTIME_REGION");
  const runtimeArn = requiredEnv(env, "AGENT_RUNTIME_ARN");

  return {
    actorClaim: cleanOptional(env.BFF_ACTOR_CLAIM) || "sub",
    actorId: env.DEFAULT_ACTOR_ID || "web-user",
    authMode,
    ...(devUserId ? { devUserId } : {}),
    devInfo: {
      authClientId: cleanOptional(env.DEV_INFO_AUTH_CLIENT_ID),
      authMode,
      databaseKbId: cleanOptional(env.DEV_INFO_DATABASE_KB_ID),
      documentKbId: cleanOptional(env.DEV_INFO_DOCUMENT_KB_ID),
      lawKbId: cleanOptional(env.DEV_INFO_LAW_KB_ID),
      medicalCareLawKbId: cleanOptional(env.DEV_INFO_MEDICAL_CARE_LAW_KB_ID),
      supportActivityKbId: cleanOptional(env.DEV_INFO_SUPPORT_ACTIVITY_KB_ID),
      jwtIssuer: cleanOptional(env.DEV_INFO_JWT_ISSUER),
      lambdaFunctionName: cleanOptional(env.AWS_LAMBDA_FUNCTION_NAME),
      lambdaLogGroupName: cleanOptional(env.DEV_INFO_LAMBDA_LOG_GROUP_NAME),
      memoryId: cleanOptional(env.DEV_INFO_AGENTCORE_MEMORY_ID),
      region,
      runtimeArn,
      runtimeEndpointName: qualifier,
      runtimeQualifier: qualifier,
    },
    qualifier,
    region,
    requestTimeoutMs: numberFromEnv(env, "REQUEST_TIMEOUT_MS", 28000),
    runtimeArn,
    userIdClaim: cleanOptional(env.BFF_USER_ID_CLAIM) || "sub",
    ...(wsUrlExpiresSeconds !== undefined ? { wsUrlExpiresSeconds } : {}),
  };
}

function authModeFromEnv(value: string | undefined): BffAuthMode {
  const mode = cleanOptional(value) || "jwt";
  if (mode === "dev" || mode === "jwt") {
    return mode;
  }
  throw new Error("BFF_AUTH_MODE must be jwt or dev");
}

/** 必須 env を読み取り、未設定なら Lambda 初期化 / request 処理を失敗させる。 */
function requiredEnv(env: EnvSource, name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

/** env の整数値を読み取り、数値化できない場合は既定値を返す。 */
function numberFromEnv(
  env: EnvSource,
  name: string,
  defaultValue: number,
): number {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) ? value : defaultValue;
}

/** optional env を trim 済み文字列として読み取る。 */
function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

/** optional env の整数値を読み取り、数値化できない場合は undefined。 */
function optionalNumberFromEnv(
  env: EnvSource,
  name: string,
): number | undefined {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) ? value : undefined;
}
