import { z } from "zod";

import { SOAP_CATEGORIES } from "./soap-draft.ts";

/**
 * issue #6 の技術方針に定義された不足種別。
 * 必須不足・根拠不足・矛盾は不足確認チャットで優先的に提示し、推奨不足・曖昧・確認推奨より前に出す
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
 * 不足確認チャットの会話生成が失敗しても不足一覧を表示できるよう常に人間が読める文言にする。
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

/**
 * 意味的な不足検出 agent（`application/soap-gaps-detection-agent.ts`）の structuredOutputSchema。
 *
 * ルールベース検出（字句・構造）では拾えない、S/O が根拠として意味的に A を支えていない、
 * S/O の混在、字句一致しない矛盾、数値化されていない曖昧表現などを検出する。`skippable` は
 * gapType から決定的に導出するため AI には出力させない
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
