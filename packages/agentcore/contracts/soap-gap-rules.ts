import { z } from "zod";

/**
 * `domain/soap-gaps.ts` のルールベース不足検出が使う設定値。保健師業務のドメイン知識
 * （キーワード・閾値・パターン・文言テンプレート）であり、コード改修なしに BFF 経由の
 * `knowledge_item`（`DOMAIN_RULE` カテゴリ）から上書きできるよう、全フィールドに現行の
 * ハードコード値と同じデフォルトを持たせる（`content` が無い/壊れていても既定値で動く）。
 *
 * `messages` のテンプレート文字列は `{draftText}` 等の単純なプレースホルダを
 * `domain/soap-gap-rules.ts` の `renderTemplate` で置換する。
 */

const contradictionWordPairSchema = z.tuple([z.string(), z.string()]);

/**
 * `messages` の既定値。zod v4 では入れ子の `.default()` オブジェクトを更に外側の
 * `.default()` へ渡す際、各フィールドの `.default()` だけでは TS 上「省略可能」と推論されず
 * 型エラーになるため、全フィールドを明示したリテラルを一度だけ定義し、フィールド単位の
 * `.default()` と外側（`soapGapRuleConfigSchema` の `messages`）の `.default()` の両方から
 * 参照する。
 */
const DEFAULT_MESSAGES = {
  missingAssessment:
    "S/Oの内容に対するアセスメント（A：課題・リスク・強みの評価）がまだ作成されていません。",
  missingPlan:
    "アセスメント（A）を踏まえた支援計画（P）がまだ作成されていません。",
  /** プレースホルダ: {draftText} */
  insufficientReasoning:
    "アセスメント「{draftText}」の根拠となる S（主観的情報）または O（客観的情報）が見当たりません。",
  /** プレースホルダ: {draftText} */
  followUpMissingDate: "次回予定「{draftText}」に実施日が明記されていません。",
  /** プレースホルダ: {draftText} */
  followUpMissingMethod:
    "次回予定「{draftText}」に実施方法（訪問/電話など）が明記されていません。",
  /** プレースホルダ: {draftText} */
  followUpMissingResponsible:
    "次回予定「{draftText}」に担当者が明記されていません。",
  /** プレースホルダ: {draftText}, {keyword} */
  ambiguous: "「{draftText}」に曖昧な表現（{keyword}）が含まれています。",
  /** プレースホルダ: {draftTextA}, {draftTextB}, {wordA}, {wordB} */
  contradiction:
    "「{draftTextA}」と「{draftTextB}」の間に矛盾する可能性のある記述（{wordA}/{wordB}）があります。",
  /** プレースホルダ: {draftText} */
  reviewUnclassified:
    "「{draftText}」は SOAP 区分が未分類のため確認をおすすめします。",
  /** プレースホルダ: {draftText} */
  reviewLowConfidence:
    "「{draftText}」は分類の確信度が低いため確認をおすすめします。",
} as const satisfies Record<string, string>;

const soapGapMessagesSchema = z
  .object({
    missingAssessment: z.string().default(DEFAULT_MESSAGES.missingAssessment),
    missingPlan: z.string().default(DEFAULT_MESSAGES.missingPlan),
    insufficientReasoning: z
      .string()
      .default(DEFAULT_MESSAGES.insufficientReasoning),
    followUpMissingDate: z
      .string()
      .default(DEFAULT_MESSAGES.followUpMissingDate),
    followUpMissingMethod: z
      .string()
      .default(DEFAULT_MESSAGES.followUpMissingMethod),
    followUpMissingResponsible: z
      .string()
      .default(DEFAULT_MESSAGES.followUpMissingResponsible),
    ambiguous: z.string().default(DEFAULT_MESSAGES.ambiguous),
    contradiction: z.string().default(DEFAULT_MESSAGES.contradiction),
    reviewUnclassified: z.string().default(DEFAULT_MESSAGES.reviewUnclassified),
    reviewLowConfidence: z
      .string()
      .default(DEFAULT_MESSAGES.reviewLowConfidence),
  })
  .default(DEFAULT_MESSAGES);

export const soapGapRuleConfigSchema = z.object({
  /** 低信頼度とみなす閾値。workbench 側の confidenceTier の "low" と揃える。 */
  lowConfidenceThreshold: z.number().min(0).max(1).default(0.4),
  followUpPlanKeywords: z
    .array(z.string())
    .default([
      "次回",
      "予定",
      "フォロー",
      "経過観察",
      "再評価",
      "再検討",
      "継続",
      "訪問予定",
    ]),
  /** 正規表現のソース文字列（`new RegExp(...)` でコンパイルする）。 */
  datePattern: z
    .string()
    .default(
      "\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|\\d{4}\\s*年|来週|来月|今週中|今月中|明日|再来週|再来月",
    ),
  methodKeywords: z
    .array(z.string())
    .default([
      "訪問",
      "電話",
      "面談",
      "オンライン",
      "来所",
      "メール",
      "手紙",
      "同行",
    ]),
  responsibleKeywords: z
    .array(z.string())
    .default([
      "担当",
      "ケアマネ",
      "相談員",
      "主治医",
      "看護師",
      "職員",
      "本人",
      "家族",
      "支援員",
    ]),
  ambiguousKeywords: z
    .array(z.string())
    .default([
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
    ]),
  /** 矛盾検知に使う対義語ペア（POC 向けの単純な字句一致ルール。意味的な矛盾検知はしない）。 */
  contradictionWordPairs: z.array(contradictionWordPairSchema).default([
    ["改善", "悪化"],
    ["できる", "できない"],
    ["増加", "減少"],
    ["安定", "不安定"],
    ["良好", "不良"],
    ["賛成", "反対"],
    ["希望", "拒否"],
    ["継続", "中止"],
  ]),
  messages: soapGapMessagesSchema,
});

export type SoapGapRuleConfig = z.infer<typeof soapGapRuleConfigSchema>;

/** JSON 未指定・パース失敗時に使う既定のルール設定（現行のハードコード値と同一）。 */
export const DEFAULT_SOAP_GAP_RULE_CONFIG: SoapGapRuleConfig =
  soapGapRuleConfigSchema.parse({});
