/**
 * SOAP Studio の「不足確認」画面が呼ぶ組み立てロジック。
 *
 * chat（supervisor）や SOAP 下書き生成とは独立した単発の分析パス。Memory も使わない
 * （stateless な一回限りの分析のため）。流れ: ルールベースで不足を検出（常に成功する、字句・
 * 構造ベース）→ 意味的な不足を AI で追加検出（S/O が A を意味的に支えているか、字句一致しない
 * 矛盾、数値化されていない曖昧表現など。失敗してもルールベースの結果だけで続行）→ 両方を統合し
 * 優先度付けする。会話的な提示・深掘りは `type: "soap_gaps_chat"`（`build-soap-gaps-chat-response.ts`）
 * 側の役割で、ここでは行わない（issue #6 の技術方針: AI が失敗しても不足一覧は必ず返す）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import type { SoapDraftCandidate } from "../contracts/soap-draft.ts";
import type { AiGapDetectionOutput } from "../contracts/soap-gaps.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { getGapRuleConfig } from "../domain/soap-gap-rules.ts";
import {
  detectGaps,
  getSoapGapsCandidates,
  mergeGapLists,
  prioritizeGaps,
  toGap,
} from "../domain/soap-gaps.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildSoapGapsDetectionAgent } from "./soap-gaps-detection-agent.ts";

const EMPTY_AI_DETECTION: AiGapDetectionOutput = { gaps: [] };

/** 意味的な不足検出 agent を実行して不足配列を返す seam（テストで fake を注入）。 */
export type SoapGapsDetectionRunner = (
  message: string,
) => Promise<AiGapDetectionOutput>;

export type SoapGapsDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 意味的な不足検出 agent 実行（省略時は config から本物の agent を生成）。 */
  soapGapsDetectionRunner?: SoapGapsDetectionRunner;
};

/** config から本物の意味的な不足検出 agent を生成し、構造化出力をそのまま返す runner。 */
function defaultSoapGapsDetectionRunner(
  config: Config,
): SoapGapsDetectionRunner {
  const deps: AgentDeps = { config };
  const agent = buildSoapGapsDetectionAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    const structuredOutput = result.structuredOutput as
      | AiGapDetectionOutput
      | undefined;
    return structuredOutput ?? EMPTY_AI_DETECTION;
  };
}

/** SOAP候補を1行1件のプロンプト向けテキストに整形する（不足確認チャットとも共有）。 */
export function describeCandidatesForPrompt(
  candidates: SoapDraftCandidate[],
): string {
  return candidates
    .map(
      (candidate, index) =>
        `${index + 1}. category=${candidate.category} ` +
        `draftText=${JSON.stringify(candidate.draftText)} ` +
        `evidenceQuote=${JSON.stringify(candidate.evidenceQuote)} ` +
        `reasoning=${JSON.stringify(candidate.reasoning)} ` +
        `confidence=${candidate.confidence}`,
    )
    .join("\n");
}

/** 意味的な不足検出 agent を実行する。StructuredOutputError は空扱いにして続行する。 */
async function detectSemanticGaps(
  candidates: SoapDraftCandidate[],
  runDetection: SoapGapsDetectionRunner,
) {
  const message = `SOAP下書き候補:\n${describeCandidatesForPrompt(candidates)}`;
  try {
    const output = await runDetection(message);
    return output.gaps.map(toGap);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return [];
    }
    throw error;
  }
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → candidates 必須チェック → ルールベースで不足検出 → 意味的な不足を
 * AI で追加検出（失敗してもルールベースの結果のみで続行）→ 統合した不足を優先度付けして返す。
 */
export async function buildSoapGapsResponse(
  payload: RuntimeRequest,
  deps: SoapGapsDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const candidates = getSoapGapsCandidates(payload);
  if (candidates === undefined) {
    return { status: "error", error: "Missing required field: candidates" };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);

  const ruleConfig = getGapRuleConfig(payload);
  const ruleBasedGaps = detectGaps(candidates, ruleConfig);
  const runDetection =
    deps.soapGapsDetectionRunner ?? defaultSoapGapsDetectionRunner(config);
  const semanticGaps = await detectSemanticGaps(candidates, runDetection);
  const gaps = prioritizeGaps(mergeGapLists(ruleBasedGaps, semanticGaps));

  return {
    status: "success",
    type: "soap_gaps",
    gaps,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
