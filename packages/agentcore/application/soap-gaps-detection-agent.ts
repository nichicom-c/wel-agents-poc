/**
 * 意味的な不足検出 agent を組み立てる。
 *
 * `domain/soap-gaps.ts` のルールベース検出は字句・構造（S/O の有無、日付/方法/担当者の欠落、
 * 固定キーワード）しか見られないため、「S/O はあるが A の結論をちゃんと支えていない」
 * 「S/O の内容が混在している」「字句が一致しない矛盾」「数値化されていない曖昧表現」のような
 * 意味的な不足は拾えない。この agent はそれを補うための2つ目の AI ステップで、ルールベース
 * 検出とは完全に独立している。issue #6 の技術方針どおり、ここでは不足の検出だけを行い、
 * 質問文の生成は行わない（それは `application/soap-gaps-agent.ts` の役割）。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { aiGapDetectionOutputSchema } from "../contracts/soap-gaps.ts";
import {
  formatKnowledgeContext,
  type KnowledgeContextItem,
} from "../domain/knowledge-context.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const SOAP_GAPS_DETECTION_AGENT_NAME = "soap_gaps_detection_agent";

/**
 * SOAP_GAPS_DETECTION_SYSTEM_PROMPT の要旨:
 *
 * 与えられた SOAP 下書き候補（S/O/A/P/UNCLASSIFIED、各々 draftText/evidenceQuote/reasoning/
 * confidence つき）を読み、以下のような「意味的な」不足だけを検出する。
 *   - A（アセスメント）の結論が、実際に示されている S/O の内容によって十分に裏付けられて
 *     いない（S/O が存在すること自体は既にルールベースで確認済みなので、ここでは内容が結論を
 *     支えているかを見る）。
 *   - S（主観的情報）と O（客観的情報）の内容が混在している（例: 本人の発言が O に分類されて
 *     いる）。
 *   - 「両立し得ない」記述（例:「食欲はある」と「何も食べていない」）。ここが最も誤検出
 *     しやすい種別のため、プロンプトでは「両立可能な事実の並記」（例:「食欲がなく」＋
 *     「朝も食べていない」。因果関係が不明でも矛盾ではない）を矛盾と混同しないよう、
 *     肯定例・否定例をセットで示している。
 *   - 定量的であるべき情報が定性的にしか書かれていない（例:「血圧は高めだった」で実測値が
 *     無い）。
 *   - その他、確認しないと記録として不正確になり得る曖昧な表現。
 * P（支援計画）の日付・方法・担当者の欠落のような構造的な不足は別のルールベース処理が
 * 担当するため、ここでは報告しない。十分に根拠がある場合や、事実どうしが両立可能な場合は
 * 何も検出しない（過検出しない）。検出した不足はすべて、与えられた候補の draftText /
 * evidenceQuote から実在する文言を relatedEvidenceQuotes として引用し、創作しない。
 */
const SOAP_GAPS_DETECTION_SYSTEM_PROMPT =
  "You review already-classified SOAP draft candidates (S/O/A/P/UNCLASSIFIED, each with " +
  "draftText, evidenceQuote, reasoning, confidence) for a support record, and detect ONLY " +
  "semantic gaps that simple structural checks cannot catch. Specifically look for: (1) an A " +
  "(assessment) whose conclusion is not actually well-supported by the CONTENT of the given " +
  "S/O candidates, even when S/O candidates exist (gapType: insufficient_reasoning); (2) S and " +
  "O content that is mixed or miscategorized, e.g. the person's own words classified as O " +
  "(gapType: review_recommended); (3) statements that CANNOT both be true at the same time " +
  "(gapType: contradictory) — see the strict definition and examples below; (4) information " +
  'that should be quantitative but is only described qualitatively, e.g. "blood pressure was ' +
  'somewhat high" with no actual reading (gapType: missing_required); (5) other ambiguous ' +
  "phrasing that would need confirmation before being accurate as a formal record (gapType: " +
  "ambiguous or review_recommended). " +
  "STRICT definition of contradictory: only use this gapType when two statements are mutually " +
  "exclusive — believing one to be true logically forces the other to be false. Example that " +
  'IS contradictory: "has appetite" vs "has not eaten anything since yesterday" — a person ' +
  "with real appetite eating nothing for a full day is a direct conflict. Example that is NOT " +
  'contradictory, even though it may look related: "recently has little appetite" alongside ' +
  '"also skipped breakfast" — reduced appetite and skipping a meal are compatible facts (one ' +
  "plausibly causes the other); an unclear causal link between two compatible facts is NOT a " +
  "contradiction and must not be reported as gapType contradictory. Do not report it as " +
  "gapType ambiguous either unless the phrasing itself is genuinely vague in a way that would " +
  "mislead a reader — merely not stating why something happened is normal, expected brevity " +
  "in a support record, not a gap. Do NOT report structural omissions in a P (support plan) " +
  "candidate such as a missing date, method, or responsible party — those are handled " +
  "separately by another process. Do NOT report an A as insufficient_reasoning when the given " +
  "S/O content genuinely and adequately supports it. When in doubt about ANY gap, do not " +
  "report it — under-reporting is far preferable to flagging normal, compatible statements as " +
  "problems. For every gap you DO report, quote the exact text from the given candidates' " +
  "draftText or evidenceQuote as relatedEvidenceQuotes — never invent or paraphrase evidence. " +
  "If you find no genuine semantic gaps, return an empty list.";

/**
 * 意味的な不足検出の model を解決する。
 *
 * 質問生成（`soap-gaps-agent.ts`）と同じ `config.soapGapsModelId`（任意）を共有する。
 * テストでは `deps.modelFor` で丸ごと差し替えられる。
 */
function resolveSoapGapsDetectionModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("soap_gaps_detection");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.soapGapsModelId || deps.config.modelId,
  });
}

/**
 * 意味的な不足検出用の Agent を生成する。structuredOutputSchema で不足配列を型付きで受け取る。
 *
 * `knowledgeContext`（保健師SOAP_KB_詳細設計書_v2 の knowledge_item、BFF が active な
 * SOAP_RULE/SAFETY/FEEDBACK_POLICY を取得して渡す）が与えられれば、末尾に補足コンテキスト
 * として追記する（soap-draft-agent.ts と同じ方針）。
 */
export function buildSoapGapsDetectionAgent(
  deps: AgentDeps,
  knowledgeContext: KnowledgeContextItem[] = [],
): Agent {
  return new Agent({
    name: SOAP_GAPS_DETECTION_AGENT_NAME,
    model: resolveSoapGapsDetectionModel(deps),
    systemPrompt:
      SOAP_GAPS_DETECTION_SYSTEM_PROMPT +
      formatKnowledgeContext(knowledgeContext),
    structuredOutputSchema: aiGapDetectionOutputSchema,
    printer: false,
  });
}
