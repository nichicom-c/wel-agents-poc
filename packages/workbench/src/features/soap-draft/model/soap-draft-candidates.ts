import type { SoapDraftApiCandidate } from "../api/soap-draft.ts";

/** SOAP 分類。低信頼度時は無理に S/O/A/P へ寄せず UNCLASSIFIED を許容する。 */
export const SOAP_CATEGORIES = ["S", "O", "A", "P", "UNCLASSIFIED"] as const;

export type SoapCategory = (typeof SOAP_CATEGORIES)[number];

/**
 * 反映候補への対応状況。採用/編集/却下/後で確認はすべて session-local な UI 状態であり、
 * 正式記録への自動保存は行わない（issue #5 の Out of Scope）。
 */
export type SoapCandidateStatus =
  | "pending"
  | "adopted"
  | "edited"
  | "rejected"
  | "deferred";

export type SoapDraftCandidate = {
  id: string;
  category: SoapCategory;
  draftText: string;
  evidenceQuote: string;
  reasoning: string;
  confidence: number;
  status: SoapCandidateStatus;
};

export type ConfidenceTier = "high" | "medium" | "low";

const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.4;

/** API から受け取った候補に、client 側だけで使う id / status を付与する。 */
export function fromApiCandidates(
  candidates: SoapDraftApiCandidate[],
): SoapDraftCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    id: createCandidateId(),
    status: "pending",
  }));
}

/**
 * React key / 候補識別にだけ使う id を作る。`crypto.randomUUID` はセキュアコンテキスト
 * （HTTPS または localhost）でしか使えないブラウザがあるため、非セキュアコンテキスト
 * （例: 開発中に network IP へ http でアクセスした場合）向けの fallback を持つ。
 */
function createCandidateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `soap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * API 分類結果ではなく、利用者入力（不足確認への回答など）から新しい候補を追加する。
 * 追加した候補は利用者が明示的に入力した内容のため、既定 status は "adopted" にする。
 */
export function addManualCandidate(
  candidates: SoapDraftCandidate[],
  input: Omit<SoapDraftCandidate, "id" | "status">,
): SoapDraftCandidate[] {
  return [
    ...candidates,
    { ...input, id: createCandidateId(), status: "adopted" },
  ];
}

/** 指定した候補だけ status を更新した新しい配列を返す。 */
export function withStatus(
  candidates: SoapDraftCandidate[],
  id: string,
  status: SoapCandidateStatus,
): SoapDraftCandidate[] {
  return candidates.map((candidate) =>
    candidate.id === id ? { ...candidate, status } : candidate,
  );
}

/** 指定した候補の draftText を編集し、status を "edited" にした新しい配列を返す。 */
export function withEditedText(
  candidates: SoapDraftCandidate[],
  id: string,
  draftText: string,
): SoapDraftCandidate[] {
  return candidates.map((candidate) =>
    candidate.id === id
      ? { ...candidate, draftText, status: "edited" }
      : candidate,
  );
}

/**
 * カテゴリごとに候補をまとめる。SOAP_CATEGORIES の順序を保つ。
 *
 * S/O/A/P は候補が0件でも常にセクションを表示する（0件のときに「判定漏れ」なのか
 * 「意図的に該当が無い」のか利用者が区別できるよう、widget 側で「該当なし」と表示する）。
 * UNCLASSIFIED だけは見出し自体が「該当なし」を表す表示のため、0件のときはセクションごと
 * 非表示にする（0件時に見出しと本文で「該当なし」が二重に出るのを避けるため）。
 */
export function groupByCategory(
  candidates: SoapDraftCandidate[],
): Array<{ category: SoapCategory; candidates: SoapDraftCandidate[] }> {
  return SOAP_CATEGORIES.map((category) => ({
    category,
    candidates: candidates.filter(
      (candidate) => candidate.category === category,
    ),
  })).filter(
    (group) => group.candidates.length > 0 || group.category !== "UNCLASSIFIED",
  );
}

/** 信頼度を表示用の3段階（high/medium/low）に変換する。 */
export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "high";
  }
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return "medium";
  }
  return "low";
}
