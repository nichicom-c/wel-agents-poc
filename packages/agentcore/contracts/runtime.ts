import type { SoapDraftCandidate, SoapRecordType } from "./soap-draft.ts";

/**
 * AgentCore Runtime への入力 JSON。
 *
 * `type` 省略時（または `"soap_draft"` 以外）は chat（supervisor）として扱う。
 * `text` は `type: "soap_draft"` のときだけ使う。記録種別は入力ではなく、分類後に
 * 入力全体に対する反映候補（`recommendedRecordTypes`）として model が出力する
 * （個々の候補ではない）。
 */
export type RuntimeRequest = {
  prompt?: unknown;
  session_id?: unknown;
  actor_id?: unknown;
  user_id?: unknown;
  type?: unknown;
  text?: unknown;
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
  | { status: "error"; error: string };

/** 入力 payload を処理して応答を返す seam（テストで fake を注入）。 */
export type Responder = (payload: RuntimeRequest) => Promise<RuntimeResponse>;
