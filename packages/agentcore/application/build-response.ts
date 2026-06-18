/**
 * AgentCore Runtime の HTTP adapter が呼ぶ組み立てロジック。
 *
 * `index.ts` の `/invocations` ハンドラはこの `buildResponse()` に委譲するだけにし、設定解決・
 * 履歴の前置き・supervisor 実行・Memory 保存をここに集約する。supervisor 実行と Memory は注入可能に
 * して、本物の Bedrock / Memory を呼ばずに `buildResponse` を単体テストできるようにする。
 *
 * Memory の読み書き失敗は会話を止めない（best-effort）。ただし握りつぶすと「履歴が常に空」と
 * 区別がつかず原因切り分けが難しくなるため、warning を 1 行残す。設定不備は throw せず JSON
 * （status: "error"）で返し、service を落とさない。
 */

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import {
  composeMessage,
  getActorId,
  getPrompt,
  getSessionId,
} from "../domain/session.ts";
import { type Config, configFromEnv, missingConfig } from "../infra/config.ts";
import { ConversationMemory, type MemoryStore } from "../infra/memory.ts";
import { extractText } from "./message-text.ts";
import { type AgentDeps, buildSupervisor } from "./supervisor-agent.ts";

/** supervisor を実行して回答文字列を返す seam（テストで fake を注入）。 */
export type SupervisorRunner = (message: string) => Promise<string>;

export type RuntimeDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** supervisor 実行（省略時は config から本物の supervisor を生成）。 */
  supervisorRunner?: SupervisorRunner;
  /** 会話 Memory。undefined なら config.memoryId から自動生成、null なら履歴なしを強制。 */
  memory?: MemoryStore | null;
  /** best-effort 失敗時の警告出力（省略時は console.warn）。 */
  warn?: (message: string) => void;
};

/** 必須設定が欠けているときに返すエラー応答。 */
export function configError(missing: string[]): RuntimeResponse {
  return {
    status: "error",
    error: `Missing required configuration: ${missing.join(", ")}`,
  };
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の supervisor を生成し、回答テキストを返す runner。 */
function defaultSupervisorRunner(config: Config): SupervisorRunner {
  const deps: AgentDeps = { config };
  const supervisor = buildSupervisor(deps);
  return async (message) =>
    extractText((await supervisor.invoke(message)).lastMessage);
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: 設定解決 → 必須チェック → 直近履歴取得（best-effort）→ supervisor 実行 →
 * 今回ターンの保存（best-effort）→ 応答整形。
 */
export async function buildResponse(
  payload: RuntimeRequest,
  deps: RuntimeDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  const missing = missingConfig(config);
  if (missing.length > 0) {
    return configError(missing);
  }

  // prompt 欠落時は supervisor を呼ばず（無駄な課金回避）、案内文を Memory にも保存しない
  // （履歴汚染回避）。設定不備と同様に status:"error" で返し service は落とさない。
  const prompt = getPrompt(payload);
  if (prompt === undefined) {
    return { status: "error", error: "Missing required field: prompt" };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  let memory = deps.memory;
  if (memory === undefined) {
    memory = config.memoryId
      ? new ConversationMemory(config.memoryId, { region: config.region })
      : null;
  }

  let history = "";
  if (memory) {
    try {
      history = await memory.recentHistory(actorId, sessionId);
    } catch (error) {
      warn(`[WARNING] memory recentHistory failed: ${stringifyError(error)}`);
    }
  }

  const runSupervisor =
    deps.supervisorRunner ?? defaultSupervisorRunner(config);
  const answer = await runSupervisor(composeMessage(prompt, history));

  // 空回答は success のままだが、警告を残して観測可能にする。
  if (!answer.trim()) {
    warn("[WARNING] supervisor returned an empty response");
  }

  if (memory) {
    try {
      await memory.saveTurn(actorId, sessionId, prompt, answer);
    } catch (error) {
      warn(`[WARNING] memory saveTurn failed: ${stringifyError(error)}`);
    }
  }

  return {
    status: "success",
    response: answer,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
