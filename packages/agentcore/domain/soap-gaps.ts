/**
 * SOAP 下書き候補から不足・曖昧・矛盾・根拠不足を検出するルールベースの判定器。
 *
 * issue #6 の技術方針どおり、ここでは字句・構造ベースの決定的なルールだけで判定し
 * （AI は使わない）、自然文の質問生成は `application/soap-gaps-agent.ts` 側の AI に委ねる。
 * こう分離することで、AI 呼び出しが失敗しても不足一覧自体は常に返せる。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";
import {
  SOAP_CATEGORIES,
  type SoapCategory,
  type SoapDraftCandidate,
} from "../contracts/soap-draft.ts";
import type {
  AiDetectedGap,
  Gap,
  GapQuestion,
  GapType,
} from "../contracts/soap-gaps.ts";

/** 質問が多くなりすぎないよう、AI 質問生成の対象にする不足件数の上限。 */
export const MAX_QUESTIONS = 8;

/** 低信頼度とみなす閾値。workbench 側の confidenceTier の "low" と揃える。 */
const LOW_CONFIDENCE_THRESHOLD = 0.4;

/** gapType の優先度（数値が小さいほど優先）。必須不足・根拠不足・矛盾を優先する。 */
const GAP_TYPE_PRIORITY: Record<GapType, number> = {
  missing_required: 0,
  insufficient_reasoning: 1,
  contradictory: 2,
  ambiguous: 3,
  missing_recommended: 4,
  review_recommended: 5,
};

const FOLLOW_UP_PLAN_KEYWORDS = [
  "次回",
  "予定",
  "フォロー",
  "経過観察",
  "再評価",
  "再検討",
  "継続",
  "訪問予定",
];

const DATE_PATTERN =
  /\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*年|来週|来月|今週中|今月中|明日|再来週|再来月/;

const METHOD_KEYWORDS = [
  "訪問",
  "電話",
  "面談",
  "オンライン",
  "来所",
  "メール",
  "手紙",
  "同行",
];

const RESPONSIBLE_KEYWORDS = [
  "担当",
  "ケアマネ",
  "相談員",
  "主治医",
  "看護師",
  "職員",
  "本人",
  "家族",
  "支援員",
];

const AMBIGUOUS_KEYWORDS = [
  "たぶん",
  "かもしれない",
  "のような",
  "適宜",
  "様子を見る",
  "検討する",
  "できれば",
  "なるべく",
  "多分",
  "おそらく",
  "そのうち",
  "近いうちに",
  "など",
];

/** 矛盾検知に使う対義語ペア（POC 向けの単純な字句一致ルール。意味的な矛盾検知はしない）。 */
const CONTRADICTION_WORD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["改善", "悪化"],
  ["できる", "できない"],
  ["増加", "減少"],
  ["安定", "不安定"],
  ["良好", "不良"],
  ["賛成", "反対"],
  ["希望", "拒否"],
  ["継続", "中止"],
];

function candidateText(candidate: SoapDraftCandidate): string {
  return `${candidate.draftText} ${candidate.evidenceQuote}`;
}

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A（アセスメント）はあるが S/O（根拠）が候補内に一件も無い場合、根拠不足として検出する。 */
function detectInsufficientReasoning(candidates: SoapDraftCandidate[]): Gap[] {
  const assessments = candidates.filter(
    (candidate) => candidate.category === "A",
  );
  if (assessments.length === 0) {
    return [];
  }
  const hasSupport = candidates.some(
    (candidate) => candidate.category === "S" || candidate.category === "O",
  );
  if (hasSupport) {
    return [];
  }
  return assessments.map((candidate) => ({
    gapType: "insufficient_reasoning",
    soapCategory: "A",
    targetItem: truncate(candidate.draftText),
    detail:
      `アセスメント「${truncate(candidate.draftText)}」の根拠となる S（主観的情報）または ` +
      "O（客観的情報）が見当たりません。",
    relatedEvidenceQuotes: [candidate.evidenceQuote],
    skippable: false,
  }));
}

/** P（支援計画）のうち次回予定らしい候補について、日付・方法・担当者の欠落を検出する。 */
function detectFollowUpPlanGaps(candidates: SoapDraftCandidate[]): Gap[] {
  const gaps: Gap[] = [];
  for (const candidate of candidates.filter((c) => c.category === "P")) {
    const text = candidateText(candidate);
    const looksLikeFollowUp = FOLLOW_UP_PLAN_KEYWORDS.some((keyword) =>
      text.includes(keyword),
    );
    if (!looksLikeFollowUp) {
      continue;
    }

    if (!DATE_PATTERN.test(text)) {
      gaps.push({
        gapType: "missing_required",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail: `次回予定「${truncate(candidate.draftText)}」に実施日が明記されていません。`,
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: false,
      });
    }
    if (!METHOD_KEYWORDS.some((keyword) => text.includes(keyword))) {
      gaps.push({
        gapType: "missing_recommended",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail:
          `次回予定「${truncate(candidate.draftText)}」に実施方法（訪問/電話など）が明記されて` +
          "いません。",
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: true,
      });
    }
    if (!RESPONSIBLE_KEYWORDS.some((keyword) => text.includes(keyword))) {
      gaps.push({
        gapType: "missing_recommended",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail: `次回予定「${truncate(candidate.draftText)}」に担当者が明記されていません。`,
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: true,
      });
    }
  }
  return gaps;
}

/** 候補本文に曖昧な表現（ヘッジ表現）が含まれていないか検出する。 */
function detectAmbiguous(candidates: SoapDraftCandidate[]): Gap[] {
  const gaps: Gap[] = [];
  for (const candidate of candidates) {
    const text = candidateText(candidate);
    const hit = AMBIGUOUS_KEYWORDS.find((keyword) => text.includes(keyword));
    if (!hit) {
      continue;
    }
    gaps.push({
      gapType: "ambiguous",
      soapCategory: candidate.category,
      targetItem: truncate(candidate.draftText),
      detail: `「${truncate(candidate.draftText)}」に曖昧な表現（${hit}）が含まれています。`,
      relatedEvidenceQuotes: [candidate.evidenceQuote],
      skippable: true,
    });
  }
  return gaps;
}

/** 候補どうしで対義語ペアが出現していないか総当たりで検出する（字句一致のみ）。 */
function detectContradictions(candidates: SoapDraftCandidate[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!a || !b) {
        continue;
      }
      const aText = candidateText(a);
      const bText = candidateText(b);
      for (const [wordA, wordB] of CONTRADICTION_WORD_PAIRS) {
        const crossed =
          (aText.includes(wordA) && bText.includes(wordB)) ||
          (aText.includes(wordB) && bText.includes(wordA));
        if (!crossed) {
          continue;
        }
        gaps.push({
          gapType: "contradictory",
          soapCategory: a.category,
          targetItem: truncate(a.draftText),
          detail:
            `「${truncate(a.draftText)}」と「${truncate(b.draftText)}」の間に矛盾する可能性の` +
            `ある記述（${wordA}/${wordB}）があります。`,
          relatedEvidenceQuotes: [a.evidenceQuote, b.evidenceQuote],
          skippable: false,
        });
      }
    }
  }
  return gaps;
}

/** UNCLASSIFIED または低信頼度の候補は、内容に関わらず確認をおすすめする。 */
function detectReviewRecommended(candidates: SoapDraftCandidate[]): Gap[] {
  const gaps: Gap[] = [];
  for (const candidate of candidates) {
    const isUnclassified = candidate.category === "UNCLASSIFIED";
    const isLowConfidence = candidate.confidence < LOW_CONFIDENCE_THRESHOLD;
    if (!isUnclassified && !isLowConfidence) {
      continue;
    }
    gaps.push({
      gapType: "review_recommended",
      soapCategory: candidate.category,
      targetItem: truncate(candidate.draftText),
      detail: isUnclassified
        ? `「${truncate(candidate.draftText)}」は SOAP 区分が未分類のため確認をおすすめします。`
        : `「${truncate(candidate.draftText)}」は分類の確信度が低いため確認をおすすめします。`,
      relatedEvidenceQuotes: [candidate.evidenceQuote],
      skippable: true,
    });
  }
  return gaps;
}

/** SOAP 下書き候補から検出できる不足をすべて（種別を問わず）返す。 */
export function detectGaps(candidates: SoapDraftCandidate[]): Gap[] {
  return [
    ...detectInsufficientReasoning(candidates),
    ...detectFollowUpPlanGaps(candidates),
    ...detectAmbiguous(candidates),
    ...detectContradictions(candidates),
    ...detectReviewRecommended(candidates),
  ];
}

/**
 * gapType ごとのスキップ可否の既定値。必須不足・根拠不足・矛盾はスキップ不可、それ以外は
 * スキップ可とする。AI 検出（`application/soap-gaps-detection-agent.ts`）の出力にも同じ基準を
 * 適用し、スキップ可否が AI の判断ゆらぎに左右されないようにする。
 */
const DEFAULT_SKIPPABLE_BY_GAP_TYPE: Record<GapType, boolean> = {
  missing_required: false,
  insufficient_reasoning: false,
  contradictory: false,
  ambiguous: true,
  missing_recommended: true,
  review_recommended: true,
};

export function defaultSkippableForGapType(gapType: GapType): boolean {
  return DEFAULT_SKIPPABLE_BY_GAP_TYPE[gapType];
}

/** AI が検出した不足に、gapType から導出した決定的な skippable を付与して Gap にする。 */
export function toGap(detected: AiDetectedGap): Gap {
  return {
    ...detected,
    skippable: defaultSkippableForGapType(detected.gapType),
  };
}

function gapKey(gap: Gap): string {
  return `${gap.gapType} ${gap.soapCategory} ${gap.targetItem}`;
}

/**
 * ルールベースの不足一覧と AI 検出の不足一覧を統合する。同じ (gapType, soapCategory,
 * targetItem) の組み合わせが両方にあれば、決定的なルールベース側を優先し AI 側の重複は
 * 落とす（同じ内容を二重に質問しないため）。
 */
export function mergeGapLists(ruleBased: Gap[], aiDetected: Gap[]): Gap[] {
  const ruleBasedKeys = new Set(ruleBased.map(gapKey));
  const uniqueAiDetected = aiDetected.filter(
    (gap) => !ruleBasedKeys.has(gapKey(gap)),
  );
  return [...ruleBased, ...uniqueAiDetected];
}

/**
 * 質問が多くなりすぎないよう、必須不足・根拠不足・矛盾を優先して上位 `limit` 件だけ残す。
 * `Array.prototype.sort` は安定ソートなので、同じ gapType 内では検出順を保つ。
 */
export function prioritizeGaps(gaps: Gap[], limit = MAX_QUESTIONS): Gap[] {
  return [...gaps]
    .sort((a, b) => GAP_TYPE_PRIORITY[a.gapType] - GAP_TYPE_PRIORITY[b.gapType])
    .slice(0, limit);
}

const GAP_TYPE_QUESTION_LABELS: Record<GapType, string> = {
  missing_required: "必須の情報が不足しています",
  missing_recommended: "推奨される情報が不足している可能性があります",
  ambiguous: "表現が曖昧です",
  contradictory: "矛盾する記述の可能性があります",
  insufficient_reasoning: "判断根拠が不足しています",
  review_recommended: "内容の確認をおすすめします",
};

/** AI 質問生成に頼らず、不足の `detail` から機械的に質問文を組み立てる（fallback 用）。 */
export function fallbackQuestionText(gap: Gap): string {
  return `${GAP_TYPE_QUESTION_LABELS[gap.gapType]}：${gap.detail} 補足情報があれば入力してください。`;
}

/** AI 質問生成が失敗した不足を、fallback の質問文で GapQuestion に変換する。 */
export function buildFallbackQuestion(gap: Gap): GapQuestion {
  return {
    gapType: gap.gapType,
    soapCategory: gap.soapCategory,
    targetItem: gap.targetItem,
    questionText: fallbackQuestionText(gap),
    skippable: gap.skippable,
  };
}

/** payload が不足確認リクエストかどうか。 */
export function isSoapGapsRequest(payload: RuntimeRequest): boolean {
  return payload.type === "soap_gaps";
}

function isSoapCategory(value: unknown): value is SoapCategory {
  return (SOAP_CATEGORIES as readonly unknown[]).includes(value);
}

function isSoapDraftCandidate(value: unknown): value is SoapDraftCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isSoapCategory(record.category) &&
    typeof record.draftText === "string" &&
    record.draftText.trim() !== "" &&
    typeof record.evidenceQuote === "string" &&
    record.evidenceQuote.trim() !== "" &&
    typeof record.reasoning === "string" &&
    typeof record.confidence === "number"
  );
}

/** payload から不足確認の対象となる SOAP 下書き候補配列を取り出す。無ければ undefined。 */
export function getSoapGapsCandidates(
  payload: RuntimeRequest,
): SoapDraftCandidate[] | undefined {
  const { candidates } = payload;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }
  return candidates.every(isSoapDraftCandidate)
    ? (candidates as SoapDraftCandidate[])
    : undefined;
}
