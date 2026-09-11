/**
 * SOAP Studio の「不足確認チャット」画面が呼ぶ組み立てロジック。
 *
 * 「次にどの不足を扱うか」は呼び出し側（BFF/Workbench）が決定的に管理するため、ここでは
 * 渡された1件の不足（`gap`）を会話的に提示・深掘りするだけに専念する。一般Chat
 * （`build-response.ts`）と同じ AgentCore Memory を `memory-turn.ts` 経由で使い、session_id
 * 単位で会話文脈を保持する。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import type { Gap } from "../contracts/soap-gaps.ts";
import type { SoapGapsChatOutput } from "../contracts/soap-gaps-chat.ts";
import { getKnowledgeContext } from "../domain/knowledge-context.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import {
  getSoapGapsChatCandidates,
  getSoapGapsChatGap,
  getSoapGapsChatMessage,
} from "../domain/soap-gaps-chat.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { MemoryStore } from "../infra/memory.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { describeCandidatesForPrompt } from "./build-soap-gaps-response.ts";
import {
  recentHistoryBestEffort,
  resolveMemory,
  saveTurnBestEffort,
} from "./memory-turn.ts";
import { buildSoapGapsChatAgent } from "./soap-gaps-chat-agent.ts";

const FALLBACK_OUTPUT: SoapGapsChatOutput = {
  message: "うまく応答できませんでした。もう一度お試しください。",
  suggestions: [],
  resolved: false,
};

/** 不足確認チャット agent を実行して構造化出力を返す seam（テストで fake を注入）。 */
export type SoapGapsChatRunner = (
  message: string,
) => Promise<SoapGapsChatOutput>;

export type SoapGapsChatDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 不足確認チャット agent 実行（省略時は config から本物の agent を生成）。 */
  soapGapsChatRunner?: SoapGapsChatRunner;
  /** 会話 Memory。undefined なら config.memoryId から自動生成、null なら履歴なしを強制。 */
  memory?: MemoryStore | null;
  /** best-effort 失敗時の警告出力（省略時は console.warn）。 */
  warn?: (message: string) => void;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の不足確認チャット agent を生成し、構造化出力をそのまま返す runner。 */
function defaultSoapGapsChatRunner(
  config: Config,
  knowledgeContext: ReturnType<typeof getKnowledgeContext>,
): SoapGapsChatRunner {
  const deps: AgentDeps = { config };
  const agent = buildSoapGapsChatAgent(deps, knowledgeContext);
  return async (message) => {
    const result = await agent.invoke(message);
    const structuredOutput = result.structuredOutput as
      | SoapGapsChatOutput
      | undefined;
    return structuredOutput ?? FALLBACK_OUTPUT;
  };
}

function describeGapForPrompt(gap: Gap): string {
  return (
    `gapType=${gap.gapType} soapCategory=${gap.soapCategory} ` +
    `targetItem=${JSON.stringify(gap.targetItem)} detail=${gap.detail} ` +
    `skippable=${gap.skippable} evidence=${JSON.stringify(gap.relatedEvidenceQuotes)}`
  );
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → gap/candidates 必須チェック → Memory から直近履歴取得（best-effort）
 * → メッセージ組み立て（gap + candidates + 履歴 + 今回の発言）→ agent 実行
 * （StructuredOutputError は error 応答に変換）→ 今回ターンを Memory へ保存（best-effort）→
 * 応答整形。
 */
export async function buildSoapGapsChatResponse(
  payload: RuntimeRequest,
  deps: SoapGapsChatDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const gap = getSoapGapsChatGap(payload);
  if (!gap) {
    return { status: "error", error: "Missing required field: gap" };
  }

  const candidates = getSoapGapsChatCandidates(payload);
  if (candidates === undefined) {
    return { status: "error", error: "Missing required field: candidates" };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const userMessage = getSoapGapsChatMessage(payload);

  const memory = resolveMemory(config, deps.memory);
  const history = await recentHistoryBestEffort(
    memory,
    actorId,
    sessionId,
    warn,
  );

  const turnPrompt =
    `不足:\n${describeGapForPrompt(gap)}\n\n` +
    `現在のSOAP候補:\n${describeCandidatesForPrompt(candidates)}` +
    (userMessage
      ? `\n\n利用者の発言:\n${userMessage}`
      : "\n\n(まだ利用者の発言はありません。この不足を提示してください。)");
  const message = history
    ? `Previous conversation:\n${history}\n\n${turnPrompt}`
    : turnPrompt;

  const runSoapGapsChat =
    deps.soapGapsChatRunner ??
    defaultSoapGapsChatRunner(config, getKnowledgeContext(payload));

  let output: SoapGapsChatOutput;
  try {
    output = await runSoapGapsChat(message);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return {
        status: "error",
        error: `SOAP gaps chat did not converge to a valid structure: ${stringifyError(error)}`,
      };
    }
    throw error;
  }

  await saveTurnBestEffort(
    memory,
    actorId,
    sessionId,
    userMessage ?? "(不足の提示を要求)",
    output.message,
    warn,
  );

  return {
    status: "success",
    type: "soap_gaps_chat",
    message: output.message,
    suggestions: output.suggestions,
    resolved: output.resolved,
    candidateText: output.candidateText,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
