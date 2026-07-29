import { z } from "zod";

import { SOAP_CATEGORIES } from "./soap-draft.ts";

/**
 * issue #6 の技術方針に定義された不足種別。
 * 必須不足・根拠不足・矛盾は質問生成時に優先し、推奨不足・曖昧・確認推奨より前に出す
 * （優先順位は {@link "../domain/soap-gaps.ts"} 側で定義する）。
 */
export const GAP_TYPES = [
  "missing_required",
  "insufficient_reasoning",
  "contradictory",
  "ambiguous",
  "missing_recommended",
  "review_recommended",
] as const;

export type GapType = (typeof GAP_TYPES)[number];

/**
 * ルールベースで検出した不足そのもの。`detail` は機械的に組み立てた説明文で、
 * AI 質問生成が失敗しても不足一覧を表示できるよう常に人間が読める文言にする。
 */
export const gapSchema = z.object({
  gapType: z.enum(GAP_TYPES),
  soapCategory: z.enum(SOAP_CATEGORIES),
  targetItem: z
    .string()
    .min(1)
    .describe("不足/曖昧/矛盾の対象となる項目の抜粋。"),
  detail: z
    .string()
    .min(1)
    .describe("何がどう不足/曖昧/矛盾しているかの具体説明。"),
  relatedEvidenceQuotes: z
    .array(z.string().min(1))
    .min(1)
    .describe("この不足の根拠となった候補の evidenceQuote（1件以上）。"),
  skippable: z.boolean().describe("利用者がこの不足確認をスキップできるか。"),
});

export type Gap = z.infer<typeof gapSchema>;

/** 不足に対して提示する、1問1意図の追加入力質問。 */
export const gapQuestionSchema = z.object({
  gapType: z.enum(GAP_TYPES),
  soapCategory: z.enum(SOAP_CATEGORIES),
  targetItem: z.string().min(1),
  questionText: z
    .string()
    .min(1)
    .describe("利用者にそのまま提示できる、1問1意図の日本語の追加入力質問。"),
  skippable: z.boolean(),
});

export type GapQuestion = z.infer<typeof gapQuestionSchema>;

/**
 * AI 質問生成 agent の structuredOutputSchema。
 *
 * `skippable` はルールベース側が持つ権威値をそのまま使うため、AI には出力させない
 * （gapType / soapCategory / targetItem は、渡した不足とマッチさせるためそのまま echo させる）。
 */
export const aiGapQuestionSchema = z.object({
  gapType: z.enum(GAP_TYPES),
  soapCategory: z.enum(SOAP_CATEGORIES),
  targetItem: z.string().min(1),
  questionText: z.string().min(1),
});

export type AiGapQuestion = z.infer<typeof aiGapQuestionSchema>;

export const aiGapQuestionListSchema = z.object({
  questions: z.array(aiGapQuestionSchema),
});

export type AiGapQuestionList = z.infer<typeof aiGapQuestionListSchema>;

/**
 * 意味的な不足検出 agent（`application/soap-gaps-detection-agent.ts`）の structuredOutputSchema。
 *
 * ルールベース検出（字句・構造）では拾えない、S/O が根拠として意味的に A を支えていない、
 * S/O の混在、字句一致しない矛盾、数値化されていない曖昧表現などを検出する。`skippable` は
 * ルールベースの質問生成と同様、gapType から決定的に導出するため AI には出力させない
 * （`domain/soap-gaps.ts` の `toGap`/`defaultSkippableForGapType` を参照）。
 */
export const aiDetectedGapSchema = z.object({
  gapType: z.enum(GAP_TYPES),
  soapCategory: z.enum(SOAP_CATEGORIES),
  targetItem: z.string().min(1),
  detail: z.string().min(1),
  relatedEvidenceQuotes: z.array(z.string().min(1)).min(1),
});

export type AiDetectedGap = z.infer<typeof aiDetectedGapSchema>;

export const aiGapDetectionOutputSchema = z.object({
  gaps: z.array(aiDetectedGapSchema),
});

export type AiGapDetectionOutput = z.infer<typeof aiGapDetectionOutputSchema>;

/** BFF `/api/soap-gaps` が返す最終的な出力形。 */
export const soapGapsOutputSchema = z.object({
  /** ルールベースで検出した不足の全件（AI 質問生成の成否に関わらず常に表示できる）。 */
  gaps: z.array(gapSchema),
  /** 優先度上位を AI が自然文化した（または fallback の）質問。 */
  questions: z.array(gapQuestionSchema),
});

export type SoapGapsOutput = z.infer<typeof soapGapsOutputSchema>;
