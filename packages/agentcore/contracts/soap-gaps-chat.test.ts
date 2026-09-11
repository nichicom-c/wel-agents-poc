import { describe, expect, test } from "bun:test";

import { soapGapsChatOutputSchema } from "./soap-gaps-chat.ts";

describe("soapGapsChatOutputSchema", () => {
  test("message/suggestions/resolved があれば candidateText 無しでも有効", () => {
    expect(
      soapGapsChatOutputSchema.safeParse({
        message: "根拠となる様子はありましたか？",
        suggestions: ["ふらつきがあった", "杖を使い始めた"],
        resolved: false,
      }).success,
    ).toBe(true);
  });

  test("resolved:true かつ candidateText ありも有効", () => {
    expect(
      soapGapsChatOutputSchema.safeParse({
        message: "ありがとうございます。",
        suggestions: [],
        resolved: true,
        candidateText: "訪問時にふらつきが見られた。",
      }).success,
    ).toBe(true);
  });

  test("message が空文字だと失敗する", () => {
    expect(
      soapGapsChatOutputSchema.safeParse({
        message: "",
        suggestions: [],
        resolved: false,
      }).success,
    ).toBe(false);
  });

  test("suggestions が4件以上だと失敗する", () => {
    expect(
      soapGapsChatOutputSchema.safeParse({
        message: "x",
        suggestions: ["a", "b", "c", "d"],
        resolved: false,
      }).success,
    ).toBe(false);
  });

  test("resolved 欠落は失敗する", () => {
    expect(
      soapGapsChatOutputSchema.safeParse({
        message: "x",
        suggestions: [],
      }).success,
    ).toBe(false);
  });
});
