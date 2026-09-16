/**
 * Training 画面の「教材チャット」が呼ぶ組み立てロジック。
 *
 * chat（supervisor）とは独立した単発の生成パスなので、KB id 等を要求する共有の
 * `missingConfig()` は使わず、この機能が実際に必要とする `modelId` だけを確認する。
 * client（workbench）が会話履歴をそのまま保持して毎回送り直す stateless 設計のため、
 * AgentCore Memory も使わない。「次にどの指導のポイントを扱うか」も client 側がキューとして
 * 決定的に管理し、この agent は渡された1件（`teachingPoint`、無ければ教材全体の自由対話）を
 * 会話的に深掘りするだけに専念する（`soap_gaps_chat` と同じ役割分担）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type {
  MaterialChatContext,
  MaterialChatOutput,
  MaterialChatTurn,
} from "../contracts/material-chat.ts";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import {
  getMaterialChatContext,
  getMaterialChatHistory,
  getMaterialChatMessage,
  getMaterialChatTeachingPoint,
} from "../domain/material-chat.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildMaterialChatAgent } from "./material-chat-agent.ts";

/** 教材チャット agent を実行して構造化出力を返す seam（テストで fake を注入）。 */
export type MaterialChatRunner = (
  message: string,
) => Promise<MaterialChatOutput>;

export type MaterialChatDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 教材チャット agent 実行（省略時は config から本物の agent を生成）。 */
  materialChatRunner?: MaterialChatRunner;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の教材チャット agent を生成し、構造化出力をそのまま返す runner。 */
function defaultMaterialChatRunner(config: Config): MaterialChatRunner {
  const deps: AgentDeps = { config };
  const agent = buildMaterialChatAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    // AgentResult.structuredOutput は SDK 側で z.output<z.ZodType> としか型付けされておらず
    // （soap-draft-agent.ts と同じ理由）、SDK が呼び出し時に同じ schema で validate 済みなので
    // ここで cast する。
    const structuredOutput = result.structuredOutput as
      | MaterialChatOutput
      | undefined;
    if (!structuredOutput) {
      throw new StructuredOutputError("material chat agent returned no output");
    }
    return structuredOutput;
  };
}

function buildMessage(
  context: MaterialChatContext,
  teachingPoint: string | undefined,
  history: MaterialChatTurn[],
  userMessage: string | undefined,
): string {
  const lines: string[] = [`教材タイトル: ${context.title}`];
  if (context.learningObjective) {
    lines.push(`学習目標: ${context.learningObjective}`);
  }

  lines.push("");
  if (teachingPoint) {
    // 他の指導のポイントは意図的に渡さない（一覧を渡すと、今回の1件だけに絞らず全体を
    // 要約してしまう傾向があったため）。
    lines.push(
      `今回扱う指導のポイント（これだけを深掘りする）: ${teachingPoint}`,
    );
    lines.push(
      "他の指導のポイントはまだ渡していない。それらについて触れたり、教材全体の要約をしたりしないこと。",
    );
  } else {
    if (context.teachingPoints.length > 0) {
      lines.push("指導のポイント一覧:");
      for (const point of context.teachingPoints) {
        lines.push(`- ${point}`);
      }
      lines.push("");
    }
    lines.push(
      "今回扱う指導のポイントの指定はありません。教材全体について自由に対話してください。",
    );
  }

  if (history.length > 0) {
    lines.push("");
    lines.push("これまでの会話:");
    for (const turn of history) {
      lines.push(
        `${turn.role === "user" ? "トレーニー" : "アシスタント"}: ${turn.text}`,
      );
    }
  }

  lines.push("");
  if (userMessage) {
    lines.push(`トレーニーの今回の発言: ${userMessage}`);
  } else if (teachingPoint) {
    lines.push(
      "これはこの指導のポイントの最初のターンです。この問題点を体現する架空のSOAP記録を" +
        "作成して提示し、断定せず問いかけとして提示してください。",
    );
  } else {
    lines.push(
      "これは会話の最初のターンです。教材の要点を簡潔に紹介し、質問を促してください。",
    );
  }
  return lines.join("\n");
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → material（教材文脈）必須チェック → 今回扱う指導のポイント/履歴/
 * 今回発言を含めたメッセージ組み立て → 教材チャット agent 実行（StructuredOutputError は
 * error 応答に変換）→ 応答整形。
 */
export async function buildMaterialChatResponse(
  payload: RuntimeRequest,
  deps: MaterialChatDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const context = getMaterialChatContext(payload);
  if (context === undefined) {
    return { status: "error", error: "Missing required field: material" };
  }

  const teachingPoint = getMaterialChatTeachingPoint(payload);
  const history = getMaterialChatHistory(payload);
  const userMessage = getMaterialChatMessage(payload);
  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);

  const runMaterialChat =
    deps.materialChatRunner ?? defaultMaterialChatRunner(config);

  let output: MaterialChatOutput;
  try {
    output = await runMaterialChat(
      buildMessage(context, teachingPoint, history, userMessage),
    );
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return {
        status: "error",
        error: `Material chat generation did not converge to a valid structure: ${stringifyError(error)}`,
      };
    }
    throw error;
  }

  return {
    status: "success",
    type: "material_chat",
    message: output.message,
    resolved: output.resolved,
    suggestions: output.suggestions,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
