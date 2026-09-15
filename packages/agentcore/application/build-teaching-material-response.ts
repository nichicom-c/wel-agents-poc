/**
 * Knowledge Review 画面の「コメントを投稿」が呼ぶ組み立てロジック。
 *
 * chat（supervisor）とは独立した単発の生成パスなので、KB id 等を要求する共有の
 * `missingConfig()` は使わず、この機能が実際に必要とする `modelId` だけを確認する。
 * Memory も使わない（stateless な一回限りの生成のため）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import type { TeachingMaterialOutput } from "../contracts/teaching-material.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { getTeachingMaterialSourceText } from "../domain/teaching-material.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildTeachingMaterialAgent } from "./teaching-material-agent.ts";

/** 教材候補生成 agent を実行して title/学習目標/指導ポイントを返す seam（テストで fake を注入）。 */
export type TeachingMaterialRunner = (
  message: string,
) => Promise<TeachingMaterialOutput>;

export type TeachingMaterialDeps = {
  /** 実行設定（省略時は環境変数から解決)。 */
  config?: Config;
  /** 教材候補生成 agent 実行（省略時は config から本物の agent を生成）。 */
  teachingMaterialRunner?: TeachingMaterialRunner;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の教材候補生成 agent を生成し、構造化出力をそのまま返す runner。 */
function defaultTeachingMaterialRunner(config: Config): TeachingMaterialRunner {
  const deps: AgentDeps = { config };
  const agent = buildTeachingMaterialAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    // AgentResult.structuredOutput は SDK 側で z.output<z.ZodType> としか型付けされておらず
    // （soap-draft-agent.ts と同じ理由）、SDK が呼び出し時に同じ schema で validate 済みなので
    // ここで cast する。
    const structuredOutput = result.structuredOutput as
      | TeachingMaterialOutput
      | undefined;
    if (!structuredOutput) {
      throw new StructuredOutputError(
        "teaching material agent returned no output",
      );
    }
    return structuredOutput;
  };
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → text（専門職コメント本文）必須チェック → 教材候補生成 agent 実行
 * （StructuredOutputError は error 応答に変換）→ 応答整形。
 */
export async function buildTeachingMaterialResponse(
  payload: RuntimeRequest,
  deps: TeachingMaterialDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const sourceText = getTeachingMaterialSourceText(payload);
  if (sourceText === undefined) {
    return { status: "error", error: "Missing required field: text" };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const message = `専門職コメント:\n${sourceText}`;

  const runTeachingMaterial =
    deps.teachingMaterialRunner ?? defaultTeachingMaterialRunner(config);

  let output: TeachingMaterialOutput;
  try {
    output = await runTeachingMaterial(message);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return {
        status: "error",
        error: `Teaching material generation did not converge to a valid structure: ${stringifyError(error)}`,
      };
    }
    throw error;
  }

  return {
    status: "success",
    type: "teaching_material",
    title: output.title,
    learningObjective: output.learningObjective,
    teachingPoints: output.teachingPoints,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
