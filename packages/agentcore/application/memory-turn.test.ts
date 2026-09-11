import { describe, expect, test } from "bun:test";

import type { Config } from "../infra/config.ts";
import type { MemoryStore } from "../infra/memory.ts";
import {
  recentHistoryBestEffort,
  resolveMemory,
  saveTurnBestEffort,
} from "./memory-turn.ts";

function makeConfig(memoryId?: string): Config {
  return {
    modelId: "test-model",
    region: "ap-northeast-1",
    kbIds: { database: "", document: "", law: "", medical_care_law: "" },
    memoryId,
    numberOfResults: 5,
    supportActivity: { kbId: "", kbArn: "", includeGeneratedSql: false },
  };
}

class FakeMemory implements MemoryStore {
  readonly saved: [string, string, string, string][] = [];
  constructor(
    private readonly history = "",
    private readonly failHistory = false,
    private readonly failSave = false,
  ) {}
  async recentHistory(): Promise<string> {
    if (this.failHistory) {
      throw new Error("history boom");
    }
    return this.history;
  }
  async saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    if (this.failSave) {
      throw new Error("save boom");
    }
    this.saved.push([actorId, sessionId, userText, assistantText]);
  }
}

describe("resolveMemory", () => {
  test("memory が undefined なら config.memoryId から生成し、未設定なら null", () => {
    expect(resolveMemory(makeConfig(), undefined)).toBeNull();
    expect(resolveMemory(makeConfig("mem-1"), undefined)).not.toBeNull();
  });

  test("memory が明示的に渡されればそのまま使う（null も含む）", () => {
    const memory = new FakeMemory();
    expect(resolveMemory(makeConfig("mem-1"), memory)).toBe(memory);
    expect(resolveMemory(makeConfig("mem-1"), null)).toBeNull();
  });
});

describe("recentHistoryBestEffort", () => {
  test("memory が null なら空文字列", async () => {
    const warnings: string[] = [];
    expect(
      await recentHistoryBestEffort(null, "a1", "s1", (m) => warnings.push(m)),
    ).toBe("");
    expect(warnings).toHaveLength(0);
  });

  test("取得成功時はそのまま返す", async () => {
    const memory = new FakeMemory("User: hi\nAssistant: hello");
    expect(await recentHistoryBestEffort(memory, "a1", "s1", () => {})).toBe(
      "User: hi\nAssistant: hello",
    );
  });

  test("取得失敗時は空文字列 + warning", async () => {
    const memory = new FakeMemory("", true);
    const warnings: string[] = [];
    const result = await recentHistoryBestEffort(memory, "a1", "s1", (m) =>
      warnings.push(m),
    );
    expect(result).toBe("");
    expect(warnings.some((w) => w.includes("recentHistory failed"))).toBe(true);
  });
});

describe("saveTurnBestEffort", () => {
  test("memory が null なら何もしない", async () => {
    await saveTurnBestEffort(null, "a1", "s1", "u", "a", () => {});
  });

  test("保存成功時は memory.saveTurn を呼ぶ", async () => {
    const memory = new FakeMemory();
    await saveTurnBestEffort(memory, "a1", "s1", "u", "a", () => {});
    expect(memory.saved).toEqual([["a1", "s1", "u", "a"]]);
  });

  test("保存失敗時は例外を投げず warning を残す", async () => {
    const memory = new FakeMemory("", false, true);
    const warnings: string[] = [];
    await saveTurnBestEffort(memory, "a1", "s1", "u", "a", (m) =>
      warnings.push(m),
    );
    expect(warnings.some((w) => w.includes("saveTurn failed"))).toBe(true);
  });
});
