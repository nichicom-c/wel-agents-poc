import { z } from "zod";

/**
 * SOAP Studio が SOAP 下書き生成時に選べる記録種別。
 * 順序は issue #5 の記載（支援実績、汎用記録、会議、サマリー）に合わせる。
 */
export const SOAP_RECORD_TYPES = [
  "support_activity",
  "general_record",
  "meeting",
  "summary",
] as const;

export type SoapRecordType = (typeof SOAP_RECORD_TYPES)[number];

/** SOAP 分類。低信頼度時は無理に S/O/A/P へ寄せず UNCLASSIFIED を許容する。 */
export const SOAP_CATEGORIES = ["S", "O", "A", "P", "UNCLASSIFIED"] as const;

export type SoapCategory = (typeof SOAP_CATEGORIES)[number];

export const soapDraftCandidateSchema = z.object({
  category: z
    .enum(SOAP_CATEGORIES)
    .describe(
      "S(主観的情報)/O(客観的情報)/A(アセスメント)/P(支援計画)。確信が持てない場合は UNCLASSIFIED。",
    ),
  draftText: z.string().min(1).describe("正式記録へ反映する下書き文章。"),
  evidenceQuote: z
    .string()
    .min(1)
    .describe("入力テキストからそのまま引用した根拠原文。"),
  reasoning: z.string().min(1).describe("この分類にした理由。"),
  confidence: z.number().min(0).max(1).describe("分類の確信度（0〜1）。"),
});

export type SoapDraftCandidate = z.infer<typeof soapDraftCandidateSchema>;

export const soapDraftOutputSchema = z.object({
  candidates: z.array(soapDraftCandidateSchema),
  recommendedRecordTypes: z
    .array(z.enum(SOAP_RECORD_TYPES))
    .describe(
      "個々の候補ではなく、入力テキスト全体を反映すべき記録種別（支援実績/汎用記録/会議記録/" +
        "サマリー）を0個以上。内容と関係が薄い記録種別は含めない。どれにも当てはまらなければ空配列。",
    ),
});

export type SoapDraftOutput = z.infer<typeof soapDraftOutputSchema>;
