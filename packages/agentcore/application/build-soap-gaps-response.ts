/**
 * SOAP Studio の「不足確認」画面が呼ぶ組み立てロジック。
 *
 * chat（supervisor）や SOAP 下書き生成とは独立した単発の分析パス。Memory も使わない
 * （stateless な一回限りの分析のため）。流れ: ルールベースで不足を検出（常に成功する、字句・
 * 構造ベース）→ 意味的な不足を AI で追加検出（S/O が A を意味的に支えているか、字句一致しない
 * 矛盾、数値化されていない曖昧表現など。失敗してもルールベースの結果だけで続行）→ 両方を統合し
 * 優先度上位だけを別の AI に渡して自然文の質問へ変換（こちらが失敗しても fallback の質問文で
 * 続行）。どちらの AI ステップが失敗しても、不足一覧（`gaps`）自体は必ず返す（issue #6 の
 * 技術方針: AI の質問生成に失敗しても、不足一覧は表示できるようにする）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import type { SoapDraftCandidate } from "../contracts/soap-draft.ts";
import type {
  AiGapDetectionOutput,
  AiGapQuestion,
  AiGapQuestionList,
  Gap,
  GapQuestion,
} from "../contracts/soap-gaps.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import {
  buildFallbackQuestion,
  detectGaps,
  getSoapGapsCandidates,
  mergeGapLists,
  prioritizeGaps,
  toGap,
} from "../domain/soap-gaps.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildSoapGapsAgent } from "./soap-gaps-agent.ts";
import { buildSoapGapsDetectionAgent } from "./soap-gaps-detection-agent.ts";

const EMPTY_AI_QUESTIONS: AiGapQuestionList = { questions: [] };
const EMPTY_AI_DETECTION: AiGapDetectionOutput = { gaps: [] };

/** 意味的な不足検出 agent を実行して不足配列を返す seam（テストで fake を注入）。 */
export type SoapGapsDetectionRunner = (
  message: string,
) => Promise<AiGapDetectionOutput>;

/** 不足確認の質問生成 agent を実行して質問配列を返す seam（テストで fake を注入）。 */
export type SoapGapsRunner = (message: string) => Promise<AiGapQuestionList>;

export type SoapGapsDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 意味的な不足検出 agent 実行（省略時は config から本物の agent を生成）。 */
  soapGapsDetectionRunner?: SoapGapsDetectionRunner;
  /** 不足確認の質問生成 agent 実行（省略時は config から本物の agent を生成）。 */
  soapGapsRunner?: SoapGapsRunner;
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

/** config から本物の不足確認 agent を生成し、構造化出力をそのまま返す runner。 */
function defaultSoapGapsRunner(config: Config): SoapGapsRunner {
  const deps: AgentDeps = { config };
  const agent = buildSoapGapsAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    const structuredOutput = result.structuredOutput as
      | AiGapQuestionList
      | undefined;
    return structuredOutput ?? EMPTY_AI_QUESTIONS;
  };
}

function matchKey(gap: {
  gapType: string;
  soapCategory: string;
  targetItem: string;
}): string {
  return `${gap.gapType} ${gap.soapCategory} ${gap.targetItem}`;
}

/** AI が返した質問を渡した不足へマッチさせ、マッチしなかった不足は fallback で埋める。 */
function mergeQuestions(
  prioritized: Gap[],
  aiQuestions: AiGapQuestion[],
): GapQuestion[] {
  const byKey = new Map(aiQuestions.map((q) => [matchKey(q), q]));
  return prioritized.map((gap) => {
    const matched = byKey.get(matchKey(gap));
    if (!matched) {
      return buildFallbackQuestion(gap);
    }
    return {
      gapType: gap.gapType,
      soapCategory: gap.soapCategory,
      targetItem: gap.targetItem,
      questionText: matched.questionText,
      skippable: gap.skippable,
    };
  });
}

function describeCandidatesForPrompt(candidates: SoapDraftCandidate[]): string {
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

function describeGapsForPrompt(gaps: Gap[]): string {
  return gaps
    .map(
      (gap, index) =>
        `${index + 1}. gapType=${gap.gapType} soapCategory=${gap.soapCategory} ` +
        `targetItem=${JSON.stringify(gap.targetItem)} detail=${gap.detail}`,
    )
    .join("\n");
}

/** 意味的な不足検出 agent を実行する。StructuredOutputError は空扱いにして続行する。 */
async function detectSemanticGaps(
  candidates: SoapDraftCandidate[],
  runDetection: SoapGapsDetectionRunner,
): Promise<Gap[]> {
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
 * AI で追加検出（失敗してもルールベースの結果のみで続行）→ 統合した不足の優先度上位だけを
 * 別の AI へ渡して質問へ変換（StructuredOutputError は fallback 質問文に変換、他の例外は
 * re-throw）→ 応答整形。
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

  const ruleBasedGaps = detectGaps(candidates);
  const runDetection =
    deps.soapGapsDetectionRunner ?? defaultSoapGapsDetectionRunner(config);
  const semanticGaps = await detectSemanticGaps(candidates, runDetection);
  const gaps = mergeGapLists(ruleBasedGaps, semanticGaps);
  const prioritized = prioritizeGaps(gaps);

  let questions: GapQuestion[];
  if (prioritized.length === 0) {
    questions = [];
  } else {
    const runSoapGaps = deps.soapGapsRunner ?? defaultSoapGapsRunner(config);
    const message = `不足一覧:\n${describeGapsForPrompt(prioritized)}`;
    try {
      const aiOutput = await runSoapGaps(message);
      questions = mergeQuestions(prioritized, aiOutput.questions);
    } catch (error) {
      if (error instanceof StructuredOutputError) {
        questions = prioritized.map(buildFallbackQuestion);
      } else {
        throw error;
      }
    }
  }

  return {
    status: "success",
    type: "soap_gaps",
    gaps,
    questions,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
