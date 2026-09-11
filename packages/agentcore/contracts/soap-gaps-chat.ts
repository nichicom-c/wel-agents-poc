import { z } from "zod";

/**
 * 不足確認チャット（`type: "soap_gaps_chat"`）の agent structuredOutputSchema。
 *
 * 「次にどの不足を扱うか」は呼び出し側（BFF/Workbench）が決定的に管理し、この agent は
 * 渡された1件の不足（`RuntimeRequest.gap`）を会話的に提示・深掘りするだけに専念する。
 */
export const soapGapsChatOutputSchema = z.object({
  message: z
    .string()
    .min(1)
    .describe("利用者にそのまま表示するチャット発言（日本語）。"),
  suggestions: z
    .array(z.string().min(1))
    .max(3)
    .describe(
      "断定しないブレインストーミング的な言い回し候補（0〜3件）。resolvedがtrueなら空配列でよい。",
    ),
  resolved: z
    .boolean()
    .describe("今回のやりとりでこの不足への対応が完了したか。"),
  candidateText: z
    .string()
    .min(1)
    .optional()
    .describe(
      "resolvedがtrueかつ、利用者の発言から具体的なSOAP文が組み立てられた場合のみ設定する文章。",
    ),
});

export type SoapGapsChatOutput = z.infer<typeof soapGapsChatOutputSchema>;
