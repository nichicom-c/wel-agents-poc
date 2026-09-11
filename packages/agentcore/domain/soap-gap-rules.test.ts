import { describe, expect, test } from "bun:test";
import type { RuntimeRequest } from "../contracts/runtime.ts";
import { DEFAULT_SOAP_GAP_RULE_CONFIG } from "../contracts/soap-gap-rules.ts";
import {
  compileDatePattern,
  getGapRuleConfig,
  renderTemplate,
} from "./soap-gap-rules.ts";

describe("getGapRuleConfig", () => {
  test("gap_rule_config 未指定なら既定値を返す", () => {
    expect(getGapRuleConfig({})).toEqual(DEFAULT_SOAP_GAP_RULE_CONFIG);
  });

  test("不正な gap_rule_config（配列であるべき箇所が文字列等）は既定値にフォールバックする", () => {
    const payload: RuntimeRequest = {
      gap_rule_config: { ambiguousKeywords: "not-an-array" },
    };
    expect(getGapRuleConfig(payload)).toEqual(DEFAULT_SOAP_GAP_RULE_CONFIG);
  });

  test("一部のフィールドだけ上書きし、他は既定値のまま残す", () => {
    const payload: RuntimeRequest = {
      gap_rule_config: {
        lowConfidenceThreshold: 0.6,
        ambiguousKeywords: ["いわゆる"],
      },
    };
    const config = getGapRuleConfig(payload);
    expect(config.lowConfidenceThreshold).toBe(0.6);
    expect(config.ambiguousKeywords).toEqual(["いわゆる"]);
    expect(config.methodKeywords).toEqual(
      DEFAULT_SOAP_GAP_RULE_CONFIG.methodKeywords,
    );
    expect(config.messages).toEqual(DEFAULT_SOAP_GAP_RULE_CONFIG.messages);
  });

  test("messages の一部だけを上書きしても他の文言は既定値のまま残る", () => {
    const payload: RuntimeRequest = {
      gap_rule_config: {
        messages: { ambiguous: "カスタム文言: {draftText} / {keyword}" },
      },
    };
    const config = getGapRuleConfig(payload);
    expect(config.messages.ambiguous).toBe(
      "カスタム文言: {draftText} / {keyword}",
    );
    expect(config.messages.missingAssessment).toBe(
      DEFAULT_SOAP_GAP_RULE_CONFIG.messages.missingAssessment,
    );
  });
});

describe("renderTemplate", () => {
  test("{key} 形式のプレースホルダを置換する", () => {
    expect(
      renderTemplate("「{draftText}」に{keyword}があります。", {
        draftText: "様子を見る",
        keyword: "曖昧な表現",
      }),
    ).toBe("「様子を見る」に曖昧な表現があります。");
  });

  test("対応する変数が無いプレースホルダはそのまま残す", () => {
    expect(renderTemplate("{unknown}", {})).toBe("{unknown}");
  });
});

describe("compileDatePattern", () => {
  test("有効な正規表現文字列はそのままコンパイルする", () => {
    const pattern = compileDatePattern("来週|来月");
    expect(pattern.test("来週訪問予定")).toBe(true);
    expect(pattern.test("特に予定なし")).toBe(false);
  });

  test("不正な正規表現は既定の日付パターンにフォールバックする", () => {
    const pattern = compileDatePattern("(未閉じの括弧");
    expect(pattern.test("来週訪問予定")).toBe(true);
  });
});
