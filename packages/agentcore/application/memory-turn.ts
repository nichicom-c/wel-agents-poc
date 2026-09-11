/**
 * AgentCore Memory の「直近履歴取得 → 実行 → 今回ターン保存」を best-effort で行う共通処理。
 * chat（`build-response.ts`）と不足確認チャット（`build-soap-gaps-chat-response.ts`）の両方が
 * 使う。読み書き失敗は会話を止めず、warning を1行残すだけにする。
 */

import type { Config } from "../infra/config.ts";
import { ConversationMemory, type MemoryStore } from "../infra/memory.ts";

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `memory` が undefined なら `config.memoryId` から生成する（未設定なら null = 履歴なし）。
 * `memory` に null が渡されたときはそのまま null を返す（履歴なしを強制）。
 */
export function resolveMemory(
  config: Config,
  memory: MemoryStore | null | undefined,
): MemoryStore | null {
  if (memory !== undefined) {
    return memory;
  }
  return config.memoryId
    ? new ConversationMemory(config.memoryId, { region: config.region })
    : null;
}

/** 直近履歴を best-effort で取得する（失敗時は空文字列 + warning、会話は止めない）。 */
export async function recentHistoryBestEffort(
  memory: MemoryStore | null,
  actorId: string,
  sessionId: string,
  warn: (message: string) => void,
): Promise<string> {
  if (!memory) {
    return "";
  }
  try {
    return await memory.recentHistory(actorId, sessionId);
  } catch (error) {
    warn(`[WARNING] memory recentHistory failed: ${stringifyError(error)}`);
    return "";
  }
}

/** 今回ターンを best-effort で保存する（失敗しても呼び出し元には伝播しない）。 */
export async function saveTurnBestEffort(
  memory: MemoryStore | null,
  actorId: string,
  sessionId: string,
  userText: string,
  assistantText: string,
  warn: (message: string) => void,
): Promise<void> {
  if (!memory) {
    return;
  }
  try {
    await memory.saveTurn(actorId, sessionId, userText, assistantText);
  } catch (error) {
    warn(`[WARNING] memory saveTurn failed: ${stringifyError(error)}`);
  }
}
