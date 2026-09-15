/**
 * Training 画面の「教材チャット」が呼ぶ組み立てロジック。
 *
 * chat（supervisor）とは独立した単発の生成パスなので、KB id 等を要求する共有の
 * `missingConfig()` は使わず、この機能が実際に必要とする `modelId` だけを確認する。
 * client（workbench）が会話履歴をそのまま保持して毎回送り直す stateless 設計のため、
 * AgentCore Memory も使わない。
 */

import type {
  MaterialChatContext,
  MaterialChatTurn,
} from "../contracts/material-chat.ts";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import {
  getMaterialChatContext,
  getMaterialChatHistory,
  getMaterialChatMessage,
} from "../domain/material-chat.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildMaterialChatAgent } from "./material-chat-agent.ts";
import { extractText } from "./message-text.ts";

/** 教材チャット agent を実行してアシスタントの発言を返す seam（テストで fake を注入）。 */
export type MaterialChatRunner = (message: string) => Promise<string>;

export type MaterialChatDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 教材チャット agent 実行（省略時は config から本物の agent を生成）。 */
  materialChatRunner?: MaterialChatRunner;
};

/** config から本物の教材チャット agent を生成し、回答テキストを返す runner。 */
function defaultMaterialChatRunner(config: Config): MaterialChatRunner {
  const deps: AgentDeps = { config };
  const agent = buildMaterialChatAgent(deps);
  return async (message) =>
    extractText((await agent.invoke(message)).lastMessage);
}

function buildMessage(
  context: MaterialChatContext,
  history: MaterialChatTurn[],
  userMessage: string | undefined,
): string {
  const lines: string[] = [`教材タイトル: ${context.title}`];
  if (context.learningObjective) {
    lines.push(`学習目標: ${context.learningObjective}`);
  }
  if (context.teachingPoints.length > 0) {
    lines.push("指導のポイント:");
    for (const point of context.teachingPoints) {
      lines.push(`- ${point}`);
    }
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
 * 流れ: modelId の確認 → material（教材文脈）必須チェック → 履歴 + 今回発言を含めた
 * メッセージ組み立て → 教材チャット agent 実行 → 応答整形。
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

  const history = getMaterialChatHistory(payload);
  const userMessage = getMaterialChatMessage(payload);
  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);

  const runMaterialChat =
    deps.materialChatRunner ?? defaultMaterialChatRunner(config);

  const message = await runMaterialChat(
    buildMessage(context, history, userMessage),
  );

  return {
    status: "success",
    type: "material_chat",
    message,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
