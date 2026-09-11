import type { SoapDraftCandidate, SoapRecordType } from "./soap-draft.ts";
import type { Gap, GapQuestion } from "./soap-gaps.ts";

/**
 * AgentCore Runtime への入力 JSON。
 *
 * `type` 省略時（または `"soap_draft"` / `"soap_gaps"` / `"exercise_feedback"` 以外）は
 * chat（supervisor）として扱う。`text` は `type: "soap_draft"` のときだけ使う。記録種別は
 * 入力ではなく、分類後に入力全体に対する反映候補（`recommendedRecordTypes`）として model が
 * 出力する（個々の候補ではない）。`candidates` は `type: "soap_gaps"` のときだけ使い、
 * 既存の SOAP 下書き候補（`soap_draft` の出力）を不足確認の対象として渡す。`exercise_case` /
 * `exercise_answers` は `type: "exercise_feedback"`（issue #9 の演習フィードバック生成）の
 * ときだけ使う。`knowledge_context` は `type: "soap_draft"` / `"soap_gaps"` のときに BFF が
 * 保健師SOAP_KB_詳細設計書_v2 の `knowledge_item`（SOAP_RULE/SAFETY/FEEDBACK_POLICY）から
 * 組み立てて渡す補足コンテキスト（省略可、`domain/knowledge-context.ts` が抽出する）。
 */
export type RuntimeRequest = {
  prompt?: unknown;
  session_id?: unknown;
  actor_id?: unknown;
  user_id?: unknown;
  type?: unknown;
  text?: unknown;
  candidates?: unknown;
  exercise_case?: unknown;
  exercise_answers?: unknown;
  knowledge_context?: unknown;
};

/** AgentCore Runtime からの出力 JSON。 */
export type RuntimeResponse =
  | {
      status: "success";
      response: string;
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | {
      status: "success";
      type: "soap_draft";
      candidates: SoapDraftCandidate[];
      /** 個々の候補ではなく、入力全体に対する反映候補（記録種別）。 */
      recommendedRecordTypes: SoapRecordType[];
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | {
      status: "success";
      type: "soap_gaps";
      /** ルールベースで検出した不足の全件（AI 質問生成の成否に関わらず常に含む）。 */
      gaps: Gap[];
      /** 優先度上位を AI が自然文化した（または fallback の）質問。 */
      questions: GapQuestion[];
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | {
      status: "success";
      type: "exercise_feedback";
      dataCollectionNote: string;
      rationaleNote: string;
      assessmentNote: string;
      supportPlanNote: string;
      documentationNote: string;
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | { status: "error"; error: string };

/** 入力 payload を処理して応答を返す seam（テストで fake を注入）。 */
export type Responder = (payload: RuntimeRequest) => Promise<RuntimeResponse>;
