import { describe, expect, test } from "bun:test";

import { postMaterialChat } from "./material-chat.ts";

describe("postMaterialChat", () => {
  test("material / teachingPoint / history / message を送り、message/suggestions/resolved を返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchFn = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = input;
      requestedInit = init;
      return Response.json({
        message: "この教材の要点は…",
        resolved: true,
        suggestions: ["視点1"],
      });
    };

    const result = await postMaterialChat(
      {
        history: [{ role: "assistant", text: "こんにちは" }],
        material: {
          learningObjective: "学習目標",
          teachingPoints: ["ポイント1"],
          title: "教材タイトル",
        },
        message: "質問です",
        teachingPoint: "ポイント1",
      },
      fetchFn,
    );

    expect(requestedUrl).toBe("/api/material-chat");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      history: [{ role: "assistant", text: "こんにちは" }],
      material: {
        learningObjective: "学習目標",
        teachingPoints: ["ポイント1"],
        title: "教材タイトル",
      },
      message: "質問です",
      teachingPoint: "ポイント1",
    });
    expect(result).toEqual({
      message: "この教材の要点は…",
      resolved: true,
      suggestions: ["視点1"],
    });
  });

  test("resolved / suggestions が無い応答は既定値（false / 空配列）にする", async () => {
    const fetchFn = async () => Response.json({ message: "応答" });

    const result = await postMaterialChat(
      { history: [], material: { title: "教材タイトル" } },
      fetchFn,
    );

    expect(result).toEqual({
      message: "応答",
      resolved: false,
      suggestions: [],
    });
  });

  test("非 2xx は BFF が返した error message を throw する", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ error: "AgentCore invoke failed" }), {
        status: 502,
      });

    await expect(
      postMaterialChat(
        { history: [], material: { title: "教材タイトル" } },
        fetchFn,
      ),
    ).rejects.toThrow("AgentCore invoke failed");
  });

  test("message が欠けた応答は invalid response を throw する", async () => {
    const fetchFn = async () => Response.json({ message: "" });

    await expect(
      postMaterialChat(
        { history: [], material: { title: "教材タイトル" } },
        fetchFn,
      ),
    ).rejects.toThrow("invalid response from /api/material-chat");
  });
});
