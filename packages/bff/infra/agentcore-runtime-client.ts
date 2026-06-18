import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
  type InvokeAgentRuntimeCommandOutput,
} from "@aws-sdk/client-bedrock-agentcore";

import {
  parseRuntimeBody,
  trimForClient,
} from "../application/runtime-response.ts";
import type {
  RuntimeInvokeResult,
  RuntimePayload,
} from "../contracts/runtime.ts";
import type { LambdaConfig } from "./lambda-config.ts";

type SendOptions = {
  /** AWS SDK `send()` に渡す abort signal。timeout test ではここを観測する。 */
  abortSignal?: AbortSignal;
};

/**
 * AgentCore Runtime SDK command を送信する seam。
 *
 * production では `BedrockAgentCoreClient#send` を使い、unit test では fake sender を注入して
 * live AWS call なしで command input と response normalization を検証する。
 */
export type AgentCoreRuntimeSender = (
  command: InvokeAgentRuntimeCommand,
  options?: SendOptions,
) => Promise<InvokeAgentRuntimeCommandOutput>;

/** AgentCore Runtime client の外部依存。timeout と SDK 送信を unit test で差し替える。 */
export type AgentCoreRuntimeClientDeps = {
  /** request ごとの abort controller factory。timeout 経路の test で差し替える。 */
  abortControllerFactory?: () => AbortController;
  /** timeout timer の clear 関数。test では timer cleanup を観測できる。 */
  clearTimeout?: (timeoutId: unknown) => void;
  /** SDK command sender。省略時は region 付き `BedrockAgentCoreClient` を生成して送信する。 */
  sender?: AgentCoreRuntimeSender;
  /** timeout timer の設定関数。test では即時 abort などを注入できる。 */
  setTimeout?: (callback: () => void, ms: number) => unknown;
};

/**
 * AgentCore Runtime invoke endpoint に AWS SDK client で request を送る。
 *
 * BFF core から渡された `RuntimePayload` を `InvokeAgentRuntimeCommand` に変換し、SDK response
 * stream を既存 BFF contract の `RuntimeInvokeResult` へ正規化する。SDK service error は
 * `ok: false` に畳み込み、abort は BFF core が 504 にできるよう `AbortError` のまま伝播する。
 */
export async function invokeAgentCoreRuntime(
  config: LambdaConfig,
  runtimeSessionId: string,
  payload: RuntimePayload,
  deps: AgentCoreRuntimeClientDeps = {},
): Promise<RuntimeInvokeResult> {
  const body = JSON.stringify(payload);
  const command = new InvokeAgentRuntimeCommand({
    accept: "application/json",
    agentRuntimeArn: config.runtimeArn,
    contentType: "application/json",
    payload: new TextEncoder().encode(body),
    qualifier: config.qualifier,
    runtimeSessionId,
  });
  const controller = (deps.abortControllerFactory ?? createAbortController)();
  const sender = deps.sender ?? defaultSender(config);
  const setTimer = deps.setTimeout ?? defaultSetTimeout;
  const clearTimer = deps.clearTimeout ?? defaultClearTimeout;
  const timeoutId = setTimer(() => controller.abort(), config.requestTimeoutMs);

  try {
    const output = await sender(command, { abortSignal: controller.signal });
    const text = await streamToString(output.response);
    const statusCode =
      output.statusCode ?? output.$metadata?.httpStatusCode ?? 200;

    if (statusCode < 200 || statusCode >= 300) {
      return {
        body: trimForClient(text),
        ok: false,
        statusCode,
      };
    }

    return {
      ok: true,
      payload: parseRuntimeBody(text, output.contentType || ""),
      statusCode,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return {
      body: trimForClient(errorMessage(error)),
      ok: false,
      statusCode: statusCodeFromError(error),
    };
  } finally {
    clearTimer(timeoutId);
  }
}

/** production 用の既定 sender。AWS SDK に credential 解決と SigV4 署名を委ねる。 */
function defaultSender(config: LambdaConfig): AgentCoreRuntimeSender {
  const client = new BedrockAgentCoreClient({ region: config.region });
  return (command, options) => client.send(command, options);
}

/** global `AbortController` を返す薄い wrapper。依存注入の既定値として使う。 */
function createAbortController() {
  return new AbortController();
}

/** global `setTimeout` を返す薄い wrapper。依存注入の既定値として使う。 */
function defaultSetTimeout(callback: () => void, ms: number): unknown {
  return setTimeout(callback, ms);
}

/** global `clearTimeout` を呼ぶ薄い wrapper。依存注入の既定値として使う。 */
function defaultClearTimeout(timeoutId: unknown) {
  clearTimeout(timeoutId as ReturnType<typeof setTimeout>);
}

/** SDK streaming response を BFF の既存 parser に渡せる UTF-8 text へ変換する。 */
async function streamToString(
  stream: InvokeAgentRuntimeCommandOutput["response"],
): Promise<string> {
  if (!stream) {
    return "";
  }

  const transformable = stream as {
    transformToByteArray?: () => Promise<Uint8Array> | Uint8Array;
    transformToString?: () => Promise<string> | string;
  };

  if (typeof transformable.transformToString === "function") {
    return await transformable.transformToString();
  }

  if (typeof transformable.transformToByteArray === "function") {
    const bytes = await transformable.transformToByteArray();
    return new TextDecoder().decode(bytes);
  }

  if (stream instanceof Uint8Array) {
    return new TextDecoder().decode(stream);
  }

  return String(stream);
}

/** BFF core が timeout を 504 に変換できるよう、abort だけは service error と区別する。 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** SDK service exception metadata から client-facing status code を取り出す。 */
function statusCodeFromError(error: unknown): number {
  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata;
  return metadata?.httpStatusCode ?? 500;
}

/** SDK exception から client response に載せる短い message 候補を取り出す。 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as { message?: unknown; name?: unknown };

    if (typeof record.message === "string" && record.message) {
      return record.message;
    }

    if (typeof record.name === "string" && record.name) {
      return record.name;
    }
  }

  return String(error || "AgentCore invoke failed");
}
