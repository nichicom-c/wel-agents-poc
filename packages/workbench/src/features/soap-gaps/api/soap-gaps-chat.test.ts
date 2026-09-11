import { describe, expect, test } from "bun:test";

import type { GapApiItem } from "./soap-gaps.ts";
import { postSoapGapsChat } from "./soap-gaps-chat.ts";

const CANDIDATE = {
  category: "A" as const,
  draftText: "転倒リスクが高い。",
  evidenceQuote: "転倒リスクが高い",
  reasoning: "観察結果からの評価。",
  confidence: 0.8,
};

const GAP: GapApiItem = {
  gapType: "insufficient_reasoning",
  soapCategory: "A",
  targetItem: "転倒リスクが高い。",
  detail: "アセスメントの根拠が不足しています。",
  relatedEvidenceQuotes: ["転倒リスクが高い"],
  skippable: false,
};

describe("postSoapGapsChat", () => {
  test("candidates/gap を POST body に含めて呼ぶ（conversationId/message は省略可）", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        conversationId: "chat-1",
        message: "根拠となる様子はありましたか？",
        suggestions: ["ふらつきがあった", "杖を使い始めた"],
        resolved: false,
      });
    };

    const result = await postSoapGapsChat({
      candidates: [CANDIDATE],
      gap: GAP,
      fetchFn,
    });

    expect(capturedBody).toEqual({ candidates: [CANDIDATE], gap: GAP });
    expect(result).toEqual({
      candidateText: undefined,
      conversationId: "chat-1",
      message: "根拠となる様子はありましたか？",
      resolved: false,
      suggestions: ["ふらつきがあった", "杖を使い始めた"],
    });
  });

  test("conversationId/message を渡せば body に含める", async () => {
    let capturedBody: unknown;
    const fetchFn = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = JSON.parse(String(init?.body));
      return Response.json({
        conversationId: "chat-1",
        message: "ありがとうございます。",
        suggestions: [],
        resolved: true,
        candidateText: "訪問時にふらつきが見られた。",
      });
    };

    const result = await postSoapGapsChat({
      candidates: [CANDIDATE],
      gap: GAP,
      conversationId: "chat-1",
      message: "訪問時にふらついていました",
      fetchFn,
    });

    expect(capturedBody).toEqual({
      candidates: [CANDIDATE],
      gap: GAP,
      conversationId: "chat-1",
      message: "訪問時にふらついていました",
    });
    expect(result.resolved).toBe(true);
    expect(result.candidateText).toBe("訪問時にふらつきが見られた。");
  });

  test("非 2xx は error メッセージを throw する", async () => {
    const fetchFn = async () =>
      Response.json({ error: "gap is required" }, { status: 400 });

    await expect(
      postSoapGapsChat({ candidates: [CANDIDATE], gap: GAP, fetchFn }),
    ).rejects.toThrow("gap is required");
  });

  test("conversationId が欠落したレスポンスは throw する", async () => {
    const fetchFn = async () =>
      Response.json({ message: "x", suggestions: [], resolved: false });

    await expect(
      postSoapGapsChat({ candidates: [CANDIDATE], gap: GAP, fetchFn }),
    ).rejects.toThrow("invalid response from /api/soap-gaps-chat");
  });
});
