/** AgentCore Runtime `/invocations` に渡す payload。 */
export type RuntimePayload = {
  /** Runtime / Memory で利用者を分離する actor ID。 */
  actor_id: string;
  /** ユーザー入力から取り出した prompt。 */
  prompt: string;
  /** Runtime / Memory の会話 session ID。 */
  session_id: string;
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
