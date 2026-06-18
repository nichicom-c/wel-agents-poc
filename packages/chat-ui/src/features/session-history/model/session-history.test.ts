import { describe, expect, test } from "bun:test";

import {
  type ChatSessionRecord,
  ensureSession,
  loadSessionHistory,
  mergeRemoteSessions,
  messagesForSession,
  SESSION_HISTORY_STORAGE_NAME,
  saveSessionHistory,
  updateSessionMessages,
} from "./session-history.ts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const SESSION_A: ChatSessionRecord = {
  conversationId: "chat-a",
  createdAt: "2026-06-17T00:00:00.000Z",
  messageCount: 0,
  messages: [],
  preview: "会話はまだありません",
  title: "New session",
  updatedAt: "2026-06-17T00:00:00.000Z",
};

const SESSION_B: ChatSessionRecord = {
  ...SESSION_A,
  conversationId: "chat-b",
  createdAt: "2026-06-17T01:00:00.000Z",
  updatedAt: "2026-06-17T01:00:00.000Z",
};

describe("session history persistence", () => {
  test("保存済み session を createdAt 降順で読み込む", () => {
    const storage = new MemoryStorage();
    const olderSessionUpdatedLater = {
      ...SESSION_A,
      updatedAt: "2026-06-17T03:00:00.000Z",
    };
    storage.setItem(
      SESSION_HISTORY_STORAGE_NAME,
      JSON.stringify([olderSessionUpdatedLater, SESSION_B]),
    );

    expect(
      loadSessionHistory(storage).map((item) => item.conversationId),
    ).toEqual(["chat-b", "chat-a"]);
  });

  test("壊れた localStorage 値は空配列として扱う", () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_HISTORY_STORAGE_NAME, "{not json");

    expect(loadSessionHistory(storage)).toEqual([]);
  });

  test("session history を canonical shape で保存する", () => {
    const storage = new MemoryStorage();
    saveSessionHistory([SESSION_A], storage);

    expect(
      JSON.parse(String(storage.getItem(SESSION_HISTORY_STORAGE_NAME))),
    ).toEqual([SESSION_A]);
  });
});

describe("session list updates", () => {
  test("存在しない conversationId は空 session として追加する", () => {
    const sessions = ensureSession(
      [],
      "chat-new",
      new Date("2026-06-17T02:00:00.000Z"),
    );

    expect(sessions).toEqual([
      {
        conversationId: "chat-new",
        createdAt: "2026-06-17T02:00:00.000Z",
        messageCount: 0,
        messages: [],
        preview: "会話はまだありません",
        title: "New session",
        updatedAt: "2026-06-17T02:00:00.000Z",
      },
    ]);
  });

  test("messages からタイトル、preview、件数を更新する", () => {
    const sessions = updateSessionMessages(
      [SESSION_A],
      "chat-a",
      [
        {
          id: "m1",
          role: "user",
          text: "  児童虐待防止法の通告義務を教えて  ",
        },
        {
          id: "m2",
          role: "assistant",
          text: "通告義務は第6条に定められています。",
        },
      ],
      new Date("2026-06-17T03:00:00.000Z"),
    );

    expect(sessions[0]).toMatchObject({
      conversationId: "chat-a",
      messageCount: 2,
      preview: "通告義務は第6条に定められています。",
      title: "児童虐待防止法の通告義務を教えて",
      updatedAt: "2026-06-17T03:00:00.000Z",
    });
    const [updated] = sessions;
    if (!updated) {
      throw new Error("updated session was not created");
    }
    expect(messagesForSession(sessions, "chat-a")).toEqual(updated.messages);
  });

  test("AWS session を既存 local 履歴へ追加する", () => {
    const sessions = mergeRemoteSessions(
      [SESSION_A],
      [
        {
          conversationId: "chat-remote",
          createdAt: "2026-06-17T04:00:00.000Z",
        },
        {
          conversationId: "chat-a",
          createdAt: "2026-06-17T05:00:00.000Z",
        },
      ],
    );

    expect(sessions).toEqual([
      {
        conversationId: "chat-remote",
        createdAt: "2026-06-17T04:00:00.000Z",
        messageCount: 0,
        messages: [],
        preview: "AWS Memory に保存済み",
        title: "AWS session",
        updatedAt: "2026-06-17T04:00:00.000Z",
      },
      SESSION_A,
    ]);
  });

  test("既存 session を選択しても createdAt 順を維持する", () => {
    expect(
      ensureSession([SESSION_A, SESSION_B], "chat-a").map(
        (session) => session.conversationId,
      ),
    ).toEqual(["chat-b", "chat-a"]);
  });

  test("古い session の messages を更新しても createdAt 順を維持する", () => {
    expect(
      updateSessionMessages(
        [SESSION_A, SESSION_B],
        "chat-a",
        [{ id: "m1", role: "user", text: "older session update" }],
        new Date("2026-06-17T03:00:00.000Z"),
      ).map((session) => session.conversationId),
    ).toEqual(["chat-b", "chat-a"]);
  });
});
