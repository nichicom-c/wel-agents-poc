import type { SoapDraftCandidate, SoapRecordType } from "./soap-draft.ts";
import type { Gap } from "./soap-gaps.ts";

/**
 * AgentCore Runtime への入力 JSON。
 *
 * `type` 省略時（または `"soap_draft"` / `"soap_gaps"` / `"soap_gaps_chat"` /
 * `"exercise_feedback"` / `"teaching_material"` / `"material_chat"` 以外）は
 * chat（supervisor）として扱う。`text` は `type: "soap_draft"` / `"teaching_material"` のとき
 * だけ使う（`teaching_material` では教材候補化したい専門職コメント本文）。記録種別は入力では
 * なく、分類後に入力全体に対する反映候補（`recommendedRecordTypes`）として model が出力する
 * （個々の候補ではない）。`candidates` は `type: "soap_gaps"` / `"soap_gaps_chat"` のときに
 * 使い、既存の SOAP 下書き候補（`soap_draft` の出力）を渡す。`gap` は `type: "soap_gaps_chat"`
 * のときだけ使う（呼び出し側（BFF/Workbench）が優先度順に選んだ「今回扱う1件の不足」、
 * `soap_gaps` の出力の1要素）。`message` は `type: "soap_gaps_chat"` / `"material_chat"` の
 * ときに使う利用者の今回の発言（初回の提示ターンでは省略）。`exercise_case` /
 * `exercise_answers` は `type: "exercise_feedback"`（issue #9 の演習フィードバック生成）の
 * ときだけ使う。`material` / `teaching_point` / `history` は `type: "material_chat"`
 * （Training 画面の教材チャット）のときだけ使う: `material` は対話対象の教材（title/
 * learningObjective/teachingPoints、全体の文脈）、`teaching_point` は呼び出し側
 * （BFF/Workbench）がキューとして決定的に管理する「今回扱う1件の指導のポイント」
 * （`material.teachingPoints` の1要素。省略時はポイントを絞らない教材全体の自由対話）、
 * `history` は client（workbench）が保持するこれまでの会話（AgentCore Memory を使わない
 * stateless 設計のため、毎回全履歴を渡す）。`knowledge_context` は `type: "soap_draft"` /
 * `"soap_gaps"` / `"soap_gaps_chat"` のときに BFF が保健師SOAP_KB_詳細設計書_v2 の
 * `knowledge_item`（SOAP_RULE/SAFETY/FEEDBACK_POLICY）から組み立てて渡す補足コンテキスト
 * （省略可、`domain/knowledge-context.ts` が抽出する）。
 */
export type RuntimeRequest = {
  prompt?: unknown;
  session_id?: unknown;
  actor_id?: unknown;
  user_id?: unknown;
  type?: unknown;
  text?: unknown;
  candidates?: unknown;
  gap?: unknown;
  message?: unknown;
  exercise_case?: unknown;
  exercise_answers?: unknown;
  material?: unknown;
  teaching_point?: unknown;
  history?: unknown;
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
      /** ルールベース検出＋AI意味検出を統合し優先度付けした不足（不足確認チャットのキュー）。 */
      gaps: Gap[];
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | {
      status: "success";
      type: "soap_gaps_chat";
      /** 利用者にそのまま表示するチャット発言。 */
      message: string;
      /** 断定しないブレインストーミング的な言い回し候補（0〜3件）。 */
      suggestions: string[];
      /** 今回のやりとりでこの不足への対応が完了したか。 */
      resolved: boolean;
      /** resolved かつ具体的なSOAP文が組み立てられた場合のみ設定される。 */
      candidateText?: string;
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
  | {
      status: "success";
      type: "teaching_material";
      title: string;
      learningObjective: string;
      teachingPoints: string[];
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | {
      status: "success";
      type: "material_chat";
      /** 利用者にそのまま表示するチャット発言。 */
      message: string;
      /** 断定しないブレインストーミング的な回答例・視点（0〜3件）。 */
      suggestions: string[];
      /** 今回のやりとりでこの指導のポイントへの対応が完了したか。 */
      resolved: boolean;
      session_id: string;
      actor_id: string;
      model_id: string;
    }
  | { status: "error"; error: string };

/** 入力 payload を処理して応答を返す seam（テストで fake を注入）。 */
export type Responder = (payload: RuntimeRequest) => Promise<RuntimeResponse>;
