/** AgentCore Runtime への入力 JSON。 */
export type RuntimeRequest = {
  prompt?: unknown;
  session_id?: unknown;
  actor_id?: unknown;
  user_id?: unknown;
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
  | { status: "error"; error: string };

/** 入力 payload を処理して応答を返す seam（テストで fake を注入）。 */
export type Responder = (payload: RuntimeRequest) => Promise<RuntimeResponse>;
