import { Sha256 } from "@aws-crypto/sha256-js";
import { formatUrl } from "@aws-sdk/core/util";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";
import type {
  AwsCredentialIdentity,
  HttpRequest,
  Provider,
} from "@smithy/types";

/** AgentCore WebSocket presigned URL の最大有効秒数。 */
const MAX_EXPIRES_IN_SECONDS = 300;
/** AgentCore Runtime が WebSocket session ID として読む query parameter 名。 */
const AGENTCORE_SESSION_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id";
const AGENTCORE_CUSTOM_ACTOR_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId";
const AGENTCORE_CUSTOM_USER_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId";

/** AgentCore `/ws` endpoint の presigned URL 生成に必要な入力。 */
export type AgentCoreWebSocketPresignConfig = {
  /** AgentCore Memory actor として扱う BFF-derived actor ID。 */
  actorId?: string;
  /** URL の有効秒数。AgentCore 側の上限に合わせて 300秒以内へ丸める。 */
  expiresIn: number;
  /** AgentCore Runtime endpoint qualifier。未指定なら AgentCore 側の DEFAULT endpoint を使う。 */
  qualifier?: string;
  /** AgentCore Runtime API の region。 */
  region: string;
  /** WebSocket 接続先の AgentCore Runtime ARN。 */
  runtimeArn: string;
  /** AgentCore Runtime session ID。BFF が user-scoped に導出した値を渡す。 */
  sessionId: string;
  /** AgentCore Memory user として扱う BFF-derived user ID。 */
  userId?: string;
};

/** presigner の外部依存。unit test では固定 credential / 時刻を注入する。 */
export type AgentCoreWebSocketPresignerDeps = {
  /** SigV4 署名に使う AWS credential。省略時は AWS SDK の default provider chain。 */
  credentials?: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
  /** SigV4 署名時刻。test では固定して URL を検証可能にする。 */
  signingDate?: Date;
};

/**
 * AgentCore Runtime `/ws` へ接続するための SigV4 presigned WebSocket URL を生成する。
 *
 * 署名は HTTPS request として作成し、返却時だけ protocol を `wss:` に変換する。
 * BFF はこの URL を browser に返し、browser が AgentCore Runtime へ直接 WebSocket 接続する。
 */
export async function createAgentCoreWebSocketUrl(
  config: AgentCoreWebSocketPresignConfig,
  deps: AgentCoreWebSocketPresignerDeps = {},
): Promise<string> {
  const hostname = `bedrock-agentcore.${config.region}.amazonaws.com`;
  const query = {
    [AGENTCORE_SESSION_ID_QUERY]: config.sessionId,
    ...customQuery("qualifier", config.qualifier),
    ...customQuery(AGENTCORE_CUSTOM_ACTOR_ID_QUERY, config.actorId),
    ...customQuery(AGENTCORE_CUSTOM_USER_ID_QUERY, config.userId),
  };
  const signer = new SignatureV4({
    credentials: deps.credentials ?? defaultProvider(),
    region: config.region,
    service: "bedrock-agentcore",
    sha256: Sha256,
  });
  const request = await signer.presign(
    {
      method: "GET",
      protocol: "https:",
      hostname,
      path: `/runtimes/${encodeURIComponent(config.runtimeArn)}/ws`,
      query,
      headers: {
        host: hostname,
      },
    },
    {
      expiresIn: Math.min(config.expiresIn, MAX_EXPIRES_IN_SECONDS),
      signingDate: deps.signingDate,
    },
  );

  return formatUrl({
    ...(request as Omit<HttpRequest, "headers" | "method">),
    protocol: "wss:",
  });
}

function customQuery(name: string, value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? { [name]: cleaned } : {};
}
