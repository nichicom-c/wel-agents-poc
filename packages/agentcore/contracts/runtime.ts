import type { SoapDraftCandidate, SoapRecordType } from "./soap-draft.ts";
import type { Gap } from "./soap-gaps.ts";

/**
 * AgentCore Runtime への入力 JSON。
 *
 * `type` 省略時（または `"soap_draft"` / `"soap_gaps"` / `"soap_gaps_chat"` /
 * `"exercise_feedback"` 以外）は chat（supervisor）として扱う。`text` は `type: "soap_draft"`
 * のときだけ使う。記録種別は入力ではなく、分類後に入力全体に対する反映候補
 * （`recommendedRecordTypes`）として model が出力する（個々の候補ではない）。`candidates` は
 * `type: "soap_gaps"` / `"soap_gaps_chat"` のときに使い、既存の SOAP 下書き候補（`soap_draft`
 * の出力）を渡す。`gap` / `message` は `type: "soap_gaps_chat"` のときだけ使う: `gap` は
 * 呼び出し側（BFF/Workbench）が優先度順に選んだ「今回扱う1件の不足」（`soap_gaps` の出力の
 * 1要素）、`message` は利用者の今回の発言（初回の提示ターンでは省略）。`exercise_case` /
 * `exercise_answers` は `type: "exercise_feedback"`（issue #9 の演習フィードバック生成）の
 * ときだけ使う。`knowledge_context` は `type: "soap_draft"` / `"soap_gaps"` / `"soap_gaps_chat"`
 * のときに BFF が保健師SOAP_KB_詳細設計書_v2 の `knowledge_item`
 * （SOAP_RULE/SAFETY/FEEDBACK_POLICY）から組み立てて渡す補足コンテキスト（省略可、
 * `domain/knowledge-context.ts` が抽出する）。`gap_rule_config` は `type: "soap_gaps"` の
 * ときだけ使う: BFF が `knowledge_item`（`DOMAIN_RULE` カテゴリ、`soap_gap_detection_rules`）
 * から読み出したルール検出設定（`contracts/soap-gap-rules.ts` の `SoapGapRuleConfig`）を
 * そのまま渡す（省略可、`domain/soap-gap-rules.ts` が既定値へフォールバックする）。
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
  knowledge_context?: unknown;
  gap_rule_config?: unknown;
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
  | { status: "error"; error: string };

/** 入力 payload を処理して応答を返す seam（テストで fake を注入）。 */
export type Responder = (payload: RuntimeRequest) => Promise<RuntimeResponse>;
