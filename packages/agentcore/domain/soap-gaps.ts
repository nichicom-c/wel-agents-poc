/**
 * SOAP 下書き候補から不足・曖昧・矛盾・根拠不足を検出するルールベースの判定器。
 *
 * issue #6 の技術方針どおり、ここでは字句・構造ベースの決定的なルールだけで判定し
 * （AI は使わない）、会話的な提示は `application/soap-gaps-chat-agent.ts` 側の AI に委ねる。
 * こう分離することで、AI 呼び出しが失敗しても不足一覧自体は常に返せる。
 *
 * 既存候補の「質」（根拠不足・曖昧・矛盾等）だけでなく、A/P 候補が丸ごと欠けている「SOAPと
 * しての完成度」も見る（`detectMissingAssessment`/`detectMissingPlan`）。これが無いと、
 * 入力に元々アセスメントや計画の記述が無い場合に不足確認チャットが何もせず即終了してしまい、
 * 「不足情報をチャットで埋めてSOAPを完成させる」という目的を満たせない。
 *
 * キーワード・閾値・パターン・文言テンプレートは `contracts/soap-gap-rules.ts` の
 * `SoapGapRuleConfig` として外部化してあり（`knowledge_item` の `DOMAIN_RULE` カテゴリから
 * BFF 経由で上書き可能）、各検出関数は既定値付きの `config` 引数として受け取る。
 * gapType の優先順位（`GAP_TYPE_PRIORITY`）とキュー上限（`MAX_PRIORITIZED_GAPS`）は
 * ドメイン知識というより提示順序・ページングという実装内部の制御値なので外部化の対象外とする。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";
import {
  SOAP_CATEGORIES,
  type SoapCategory,
  type SoapDraftCandidate,
} from "../contracts/soap-draft.ts";
import {
  DEFAULT_SOAP_GAP_RULE_CONFIG,
  type SoapGapRuleConfig,
} from "../contracts/soap-gap-rules.ts";
import type { AiDetectedGap, Gap, GapType } from "../contracts/soap-gaps.ts";
import { compileDatePattern, renderTemplate } from "./soap-gap-rules.ts";

/** 不足確認チャットのキューが長くなりすぎないよう、優先度付け後に残す件数の上限。 */
export const MAX_PRIORITIZED_GAPS = 8;

/** gapType の優先度（数値が小さいほど優先）。必須不足・根拠不足・矛盾を優先する。 */
const GAP_TYPE_PRIORITY: Record<GapType, number> = {
  missing_required: 0,
  insufficient_reasoning: 1,
  contradictory: 2,
  ambiguous: 3,
  missing_recommended: 4,
  review_recommended: 5,
};

function candidateText(candidate: SoapDraftCandidate): string {
  return `${candidate.draftText} ${candidate.evidenceQuote}`;
}

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** すべての候補の evidenceQuote を「不足の根拠」として集める（missing_required 系で使う）。 */
function allEvidenceQuotes(candidates: SoapDraftCandidate[]): string[] {
  return candidates.map((candidate) => candidate.evidenceQuote);
}

/**
 * S/O はあるのに A（アセスメント）候補が一件も無ければ、SOAPを完成させる観点での不足として
 * 検出する（`detectInsufficientReasoning` は逆に「Aはあるが根拠が無い」場合を扱う。両者は
 * 排他的で同時には発火しない）。
 */
function detectMissingAssessment(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
  const hasAssessment = candidates.some(
    (candidate) => candidate.category === "A",
  );
  if (hasAssessment) {
    return [];
  }
  const hasSupport = candidates.some(
    (candidate) => candidate.category === "S" || candidate.category === "O",
  );
  if (!hasSupport) {
    return [];
  }
  return [
    {
      gapType: "missing_required",
      soapCategory: "A",
      targetItem: "アセスメント（A）",
      detail: config.messages.missingAssessment,
      relatedEvidenceQuotes: allEvidenceQuotes(candidates),
      skippable: false,
    },
  ];
}

/**
 * P（支援計画）候補が一件も無ければ、SOAPを完成させる観点での不足として検出する。A が未作成
 * でも（`detectMissingAssessment` と合わせて）両方を最初から不足一覧に含め、1回のチャットで
 * A→P の順に連続して埋められるようにする。
 */
function detectMissingPlan(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
  const hasPlan = candidates.some((candidate) => candidate.category === "P");
  if (hasPlan) {
    return [];
  }
  const hasSupportOrAssessment = candidates.some(
    (candidate) =>
      candidate.category === "S" ||
      candidate.category === "O" ||
      candidate.category === "A",
  );
  if (!hasSupportOrAssessment) {
    return [];
  }
  return [
    {
      gapType: "missing_required",
      soapCategory: "P",
      targetItem: "支援計画（P）",
      detail: config.messages.missingPlan,
      relatedEvidenceQuotes: allEvidenceQuotes(candidates),
      skippable: false,
    },
  ];
}

/** A（アセスメント）はあるが S/O（根拠）が候補内に一件も無い場合、根拠不足として検出する。 */
function detectInsufficientReasoning(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
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
    detail: renderTemplate(config.messages.insufficientReasoning, {
      draftText: truncate(candidate.draftText),
    }),
    relatedEvidenceQuotes: [candidate.evidenceQuote],
    skippable: false,
  }));
}

/** P（支援計画）のうち次回予定らしい候補について、日付・方法・担当者の欠落を検出する。 */
function detectFollowUpPlanGaps(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
  const gaps: Gap[] = [];
  const datePattern = compileDatePattern(config.datePattern);
  for (const candidate of candidates.filter((c) => c.category === "P")) {
    const text = candidateText(candidate);
    const looksLikeFollowUp = config.followUpPlanKeywords.some((keyword) =>
      text.includes(keyword),
    );
    if (!looksLikeFollowUp) {
      continue;
    }

    if (!datePattern.test(text)) {
      gaps.push({
        gapType: "missing_required",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail: renderTemplate(config.messages.followUpMissingDate, {
          draftText: truncate(candidate.draftText),
        }),
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: false,
      });
    }
    if (!config.methodKeywords.some((keyword) => text.includes(keyword))) {
      gaps.push({
        gapType: "missing_recommended",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail: renderTemplate(config.messages.followUpMissingMethod, {
          draftText: truncate(candidate.draftText),
        }),
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: true,
      });
    }
    if (!config.responsibleKeywords.some((keyword) => text.includes(keyword))) {
      gaps.push({
        gapType: "missing_recommended",
        soapCategory: "P",
        targetItem: truncate(candidate.draftText),
        detail: renderTemplate(config.messages.followUpMissingResponsible, {
          draftText: truncate(candidate.draftText),
        }),
        relatedEvidenceQuotes: [candidate.evidenceQuote],
        skippable: true,
      });
    }
  }
  return gaps;
}

/** 候補本文に曖昧な表現（ヘッジ表現）が含まれていないか検出する。 */
function detectAmbiguous(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
  const gaps: Gap[] = [];
  for (const candidate of candidates) {
    const text = candidateText(candidate);
    const hit = config.ambiguousKeywords.find((keyword) =>
      text.includes(keyword),
    );
    if (!hit) {
      continue;
    }
    gaps.push({
      gapType: "ambiguous",
      soapCategory: candidate.category,
      targetItem: truncate(candidate.draftText),
      detail: renderTemplate(config.messages.ambiguous, {
        draftText: truncate(candidate.draftText),
        keyword: hit,
      }),
      relatedEvidenceQuotes: [candidate.evidenceQuote],
      skippable: true,
    });
  }
  return gaps;
}

/** 候補どうしで対義語ペアが出現していないか総当たりで検出する（字句一致のみ）。 */
function detectContradictions(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
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
      for (const [wordA, wordB] of config.contradictionWordPairs) {
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
          detail: renderTemplate(config.messages.contradiction, {
            draftTextA: truncate(a.draftText),
            draftTextB: truncate(b.draftText),
            wordA,
            wordB,
          }),
          relatedEvidenceQuotes: [a.evidenceQuote, b.evidenceQuote],
          skippable: false,
        });
      }
    }
  }
  return gaps;
}

/** UNCLASSIFIED または低信頼度の候補は、内容に関わらず確認をおすすめする。 */
function detectReviewRecommended(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig,
): Gap[] {
  const gaps: Gap[] = [];
  for (const candidate of candidates) {
    const isUnclassified = candidate.category === "UNCLASSIFIED";
    const isLowConfidence =
      candidate.confidence < config.lowConfidenceThreshold;
    if (!isUnclassified && !isLowConfidence) {
      continue;
    }
    gaps.push({
      gapType: "review_recommended",
      soapCategory: candidate.category,
      targetItem: truncate(candidate.draftText),
      detail: renderTemplate(
        isUnclassified
          ? config.messages.reviewUnclassified
          : config.messages.reviewLowConfidence,
        { draftText: truncate(candidate.draftText) },
      ),
      relatedEvidenceQuotes: [candidate.evidenceQuote],
      skippable: true,
    });
  }
  return gaps;
}

/** SOAP 下書き候補から検出できる不足をすべて（種別を問わず）返す。 */
export function detectGaps(
  candidates: SoapDraftCandidate[],
  config: SoapGapRuleConfig = DEFAULT_SOAP_GAP_RULE_CONFIG,
): Gap[] {
  return [
    ...detectMissingAssessment(candidates, config),
    ...detectInsufficientReasoning(candidates, config),
    ...detectMissingPlan(candidates, config),
    ...detectFollowUpPlanGaps(candidates, config),
    ...detectAmbiguous(candidates, config),
    ...detectContradictions(candidates, config),
    ...detectReviewRecommended(candidates, config),
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
 * キューが長くなりすぎないよう、必須不足・根拠不足・矛盾を優先して上位 `limit` 件だけ残す。
 * `Array.prototype.sort` は安定ソートなので、同じ gapType 内では検出順を保つ。
 */
export function prioritizeGaps(
  gaps: Gap[],
  limit = MAX_PRIORITIZED_GAPS,
): Gap[] {
  return [...gaps]
    .sort((a, b) => GAP_TYPE_PRIORITY[a.gapType] - GAP_TYPE_PRIORITY[b.gapType])
    .slice(0, limit);
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
