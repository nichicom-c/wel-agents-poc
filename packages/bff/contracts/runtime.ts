/**
 * AgentCore Runtime `/invocations` に渡す payload。
 *
 * `type` 省略時は chat として扱われる（`prompt` を使う）。`type: "soap_draft"` のときは
 * `prompt` の代わりに `text` を使う。`type: "soap_gaps"` のときは `candidates`（`soap_draft`
 * の出力）を不足確認の対象として渡す。`type: "soap_gaps_chat"` のときは `candidates` に加えて
 * `gap`（呼び出し側が優先度順に選んだ「今回扱う1件の不足」、`soap_gaps` の出力の1要素）と
 * `message`（利用者の今回の発言、初回の提示ターンは省略）を使う。`type: "exercise_feedback"`
 * （issue #9 の演習フィードバック生成）のときは `exercise_case` / `exercise_answers` を使う。
 * `type: "teaching_material"`（Knowledge Review 画面の教材候補生成）のときは `text`
 * （専門職コメント本文）を使う。`type: "material_chat"`（Training 画面の教材チャット）の
 * ときは `material`（対話対象の教材、全体の文脈）/ `teaching_point`（呼び出し側がキューとして
 * 選ぶ「今回扱う1件の指導のポイント」、省略時は教材全体の自由対話）/ `history`（client が
 * 保持するこれまでの会話）/ `message`（今回の発言、初回は省略）を使う。いずれも agentcore 側
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
  type?:
    | "soap_draft"
    | "soap_gaps"
    | "soap_gaps_chat"
    | "exercise_feedback"
    | "teaching_material"
    | "material_chat";
  /** type: "soap_draft" / "teaching_material" のときの分類・生成対象テキスト。 */
  text?: string;
  /** type: "soap_gaps" / "soap_gaps_chat" のときの文脈（SOAP 下書き候補）。 */
  candidates?: unknown[];
  /** type: "soap_gaps_chat" のときの今回扱う不足（1件）。 */
  gap?: unknown;
  /** type: "soap_gaps_chat" / "material_chat" のときの利用者の今回の発言（初回は省略）。 */
  message?: string;
  /** type: "exercise_feedback" のときの演習ケースの文脈。 */
  exercise_case?: unknown;
  /** type: "exercise_feedback" のときの受講者の提出物。 */
  exercise_answers?: unknown;
  /** type: "material_chat" のときの対話対象の教材（title/learningObjective/teachingPoints）。 */
  material?: unknown;
  /** type: "material_chat" のときの今回扱う1件の指導のポイント（省略時は教材全体の自由対話）。 */
  teaching_point?: unknown;
  /** type: "material_chat" のときのこれまでの会話（{role, text}[]）。 */
  history?: unknown;
  /** type: "soap_draft" / "soap_gaps" / "soap_gaps_chat" のときの Knowledge Base 補足コンテキスト。 */
  knowledge_context?: { category: string; title: string; content: string }[];
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
