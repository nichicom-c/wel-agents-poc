import { describe, expect, test } from "bun:test";

import {
  appendAssistantMessage,
  appendUserMessage,
  latestAssistantSuggestions,
} from "./chat-thread.ts";

describe("appendUserMessage / appendAssistantMessage", () => {
  test("末尾にメッセージを追加し、id を発行する", () => {
    let messages = appendUserMessage([], "こんにちは");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.text).toBe("こんにちは");
    expect(messages[0]?.id).toBeTruthy();

    messages = appendAssistantMessage(messages, "どうしましたか？", [
      "候補1",
      "候補2",
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.suggestions).toEqual(["候補1", "候補2"]);
  });

  test("suggestions が空配列なら undefined にする", () => {
    const messages = appendAssistantMessage([], "了解です。", []);
    expect(messages[0]?.suggestions).toBeUndefined();
  });

  test("元の配列を破壊しない", () => {
    const original = appendUserMessage([], "a");
    const next = appendUserMessage(original, "b");
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("latestAssistantSuggestions", () => {
  test("直近の assistant メッセージの suggestions を返す", () => {
    let messages = appendAssistantMessage([], "最初の提示", ["a", "b"]);
    messages = appendUserMessage(messages, "回答します");
    messages = appendAssistantMessage(messages, "次の提示", ["c"]);

    expect(latestAssistantSuggestions(messages)).toEqual(["c"]);
  });

  test("assistant メッセージが無ければ空配列", () => {
    expect(latestAssistantSuggestions([])).toEqual([]);
    expect(latestAssistantSuggestions(appendUserMessage([], "x"))).toEqual([]);
  });

  test("直近の assistant メッセージに suggestions が無ければ空配列", () => {
    const messages = appendAssistantMessage([], "了解です。");
    expect(latestAssistantSuggestions(messages)).toEqual([]);
  });
});
