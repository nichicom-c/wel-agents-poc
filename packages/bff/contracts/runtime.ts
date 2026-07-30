/**
 * AgentCore Runtime `/invocations` に渡す payload。
 *
 * `type` 省略時は chat として扱われる（`prompt` を使う）。`type: "soap_draft"` のときは
 * `prompt` の代わりに `text` を使う。`type: "soap_gaps"` のときは `candidates`（`soap_draft`
 * の出力）を不足確認の対象として渡す。`type: "exercise_feedback"`（issue #9 の演習フィード
 * バック生成）のときは `exercise_case` / `exercise_answers` を使う。いずれも agentcore 側
 * `RuntimeRequest` の wire shape に合わせたもの。記録種別は入力ではなく、分類後に候補ごとの
 * 反映候補として返る。
 */
export type RuntimePayload = {
  /** Runtime / Memory で利用者を分離する actor ID。 */
  actor_id: string;
  /** ユーザー入力から取り出した prompt（chat 用）。 */
  prompt?: string;
  /** Runtime / Memory の会話 session ID。 */
  session_id: string;
  /** リクエスト種別。省略時は chat 扱い。 */
  type?: "soap_draft" | "soap_gaps" | "exercise_feedback";
  /** type: "soap_draft" のときの分類対象テキスト。 */
  text?: string;
  /** type: "soap_gaps" のときの不足確認対象（SOAP 下書き候補）。 */
  candidates?: unknown[];
  /** type: "exercise_feedback" のときの演習ケースの文脈。 */
  exercise_case?: unknown;
  /** type: "exercise_feedback" のときの受講者の提出物。 */
  exercise_answers?: unknown;
};

/** Runtime invoke の成否を BFF core が扱いやすい形に正規化した結果。 */
export type RuntimeInvokeResult =
  | {
      /** Runtime が 2xx を返したことを示す。 */
      ok: true;
      /** Runtime response body。JSON / event stream / text を adapter 側で parse 済み。 */
      payload: unknown;
      /** Runtime が返した HTTP status code。 */
      statusCode: number;
    }
  | {
      /** Runtime が非 2xx を返したことを示す。 */
      body: string;
      ok: false;
      statusCode: number;
    };

/** conversation ID と RuntimePayload を受け取り、Runtime を invoke する seam。 */
export type RuntimeInvoker = (
  runtimeSessionId: string,
  payload: RuntimePayload,
) => Promise<RuntimeInvokeResult>;
