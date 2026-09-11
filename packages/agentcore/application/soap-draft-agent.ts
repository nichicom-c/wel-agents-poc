/**
 * SOAP 下書き生成 agent を組み立てる。
 *
 * supervisor の専門 tool（agents-as-tools）ではなく、SOAP Studio の「SOAP 下書き生成」画面から
 * 直接呼ばれる単発の分類 agent。structuredOutputSchema で候補配列を型付きで受け取る。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import type { SoapRecordType } from "../contracts/soap-draft.ts";
import { soapDraftOutputSchema } from "../contracts/soap-draft.ts";
import {
  formatKnowledgeContext,
  type KnowledgeContextItem,
} from "../domain/knowledge-context.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const SOAP_DRAFT_AGENT_NAME = "soap_draft_agent";

const RECORD_TYPE_LABELS: Record<SoapRecordType, string> = {
  support_activity: "支援実績",
  general_record: "汎用記録",
  meeting: "会議記録",
  summary: "サマリー",
};

const RECORD_TYPE_DESCRIPTIONS: Record<SoapRecordType, string> = {
  support_activity:
    "support_activity (支援実績): a formal log entry for a direct support activity/visit/service " +
    "provided to an individual.",
  general_record:
    "general_record (汎用記録): a general-purpose free-form note not tied to a specific formal " +
    "record category.",
  meeting:
    "meeting (会議記録): minutes/notes from a support-coordination meeting involving multiple " +
    "participants.",
  summary:
    "summary (サマリー): a condensed summary record used for periodic review or handover.",
};

/** 記録種別を画面表示・プロンプト埋め込み用の日本語ラベルに変換する。 */
export function recordTypeLabel(recordType: SoapRecordType): string {
  return RECORD_TYPE_LABELS[recordType];
}

const RECORD_TYPE_DESCRIPTIONS_TEXT = Object.values(
  RECORD_TYPE_DESCRIPTIONS,
).join(" ");

/**
 * SOAP_DRAFT_SYSTEM_PROMPT の要旨:
 *
 * 相談支援記録の下書き作成を支援するアシスタントとして、入力テキストを SOAP 形式
 * （S: 主観的情報 / O: 客観的情報 / A: アセスメント / P: 支援計画）の候補に分割する。
 * A（アセスメント）は、入力テキストに元々書かれている支援者自身の評価・判断の文だけを
 * 対象とする。複数の S/O を AI が統合・推論して新たに導き出した結論は「分類」ではなく
 * 「生成」であり、専門職の判断を AI が代弁してしまうリスクがあるため、A にはせず
 * UNCLASSIFIED とする（入力に明示的な評価文が無ければ A 候補を作らない）。
 * 各候補には根拠原文の引用・分類理由・0〜1 の信頼度を必ず含める。確信が持てない場合は
 * 無理に S/O/A/P へ分類せず UNCLASSIFIED を使う。根拠原文は入力テキストに実在する文言を
 * そのまま引用し、要約・創作をしない。入力テキストに存在しない情報を候補に含めない。
 * さらに、個々の候補ごとではなく入力テキスト全体に対して「反映候補」として支援実績/
 * 汎用記録/会議記録/サマリーのうち内容的に反映すべきものを0個以上推薦する
 * （recommendedRecordTypes、該当なしなら空配列）。
 */
const SOAP_DRAFT_SYSTEM_PROMPT =
  "You are an assistant that helps draft support-record entries from free-text input. " +
  "Split the input text into SOAP candidates: S (subjective information, typically the " +
  "person's own words/feelings), O (objective information, observed facts), A (assessment), " +
  "and P (support plan). " +
  "IMPORTANT constraint on A: only classify a passage as A when the input text ITSELF " +
  "already contains an explicit assessment or judgment written by the support worker — a " +
  "sentence stating their own evaluation, interpretation, or conclusion, not a bare recitation " +
  "of facts. Do NOT create an A candidate by synthesizing or inferring a new conclusion from " +
  "multiple S/O facts when that conclusion is not itself explicitly stated in the input — that " +
  "is generation, not classification, and it risks presenting an AI-authored professional " +
  "judgment as if it were the human support worker's own. If the input only contains raw " +
  "observations or statements with no explicit assessment sentence, do not manufacture an A " +
  "for them; leave those passages classified as S/O only. When a passage gestures toward a " +
  "judgment but does not itself constitute a clear, explicit assessment statement, use " +
  "UNCLASSIFIED rather than inferring an A. " +
  "For every candidate you MUST include: an evidenceQuote copied " +
  "verbatim from the input text (never paraphrase or invent it), a reasoning for why this " +
  "category was chosen, and a confidence between 0 and 1. When you are not confident a " +
  "sentence clearly belongs to S/O/A/P, do not force it into one of those categories — use " +
  "UNCLASSIFIED instead. Never include information in a candidate that is not present in the " +
  "input text. " +
  "After classifying all candidates, also recommend zero or more record types the input text " +
  "AS A WHOLE should be reflected into, as recommendedRecordTypes — this is a single " +
  "recommendation for the entire input, not per individual candidate. The available record " +
  `types are: ${RECORD_TYPE_DESCRIPTIONS_TEXT} Only include a record type when the overall ` +
  "input content is genuinely relevant to it — leave recommendedRecordTypes empty when none " +
  "apply. The input may be relevant to more than one record type at once. " +
  "Respond only with candidates grounded in the given input text.";

/**
 * SOAP 下書き生成の model を解決する。
 *
 * 分類タスクは supervisor の会話ほど重くないことが多いため、`config.soapDraftModelId`
 * （任意）が設定されていればそちらを使い、応答時間を短縮できるようにする。未設定なら
 * supervisor と同じ `config.modelId` にフォールバックする。テストでは他の specialist と
 * 同様に `deps.modelFor` で丸ごと差し替えられる。
 */
function resolveSoapDraftModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("soap_draft");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.soapDraftModelId || deps.config.modelId,
  });
}

/**
 * SOAP 下書き生成用の Agent を生成する。structuredOutputSchema で候補配列を型付きで受け取る。
 *
 * `knowledgeContext`（保健師SOAP_KB_詳細設計書_v2 の knowledge_item、BFF が active な
 * SOAP_RULE/SAFETY/FEEDBACK_POLICY を取得して渡す）が与えられれば、ハードコードされた
 * `SOAP_DRAFT_SYSTEM_PROMPT` を置き換えず、末尾に補足コンテキストとして追記する。
 */
export function buildSoapDraftAgent(
  deps: AgentDeps,
  knowledgeContext: KnowledgeContextItem[] = [],
): Agent {
  return new Agent({
    name: SOAP_DRAFT_AGENT_NAME,
    model: resolveSoapDraftModel(deps),
    systemPrompt:
      SOAP_DRAFT_SYSTEM_PROMPT + formatKnowledgeContext(knowledgeContext),
    structuredOutputSchema: soapDraftOutputSchema,
    printer: false,
  });
}
