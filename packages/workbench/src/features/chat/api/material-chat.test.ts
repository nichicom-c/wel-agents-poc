import { describe, expect, test } from "bun:test";

import { postMaterialChat } from "./material-chat.ts";

describe("postMaterialChat", () => {
  test("material / history / message を送り BFF /api/material-chat の message を返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchFn = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = input;
      requestedInit = init;
      return Response.json({ message: "この教材の要点は…" });
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
    });
    expect(result).toBe("この教材の要点は…");
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
