import { describe, expect, test } from "bun:test";
import {
  composeMessage,
  DEFAULT_ACTOR_ID,
  DEFAULT_SESSION_ID,
  getActorId,
  getPrompt,
  getSessionId,
} from "../domain/session.ts";
import type { Config } from "../infra/config.ts";
import type { MemoryStore } from "../infra/memory.ts";
import { buildResponse, configError } from "./build-response.ts";

function makeConfig(memoryId?: string): Config {
  return {
    modelId: "test-model",
    region: "ap-northeast-1",
    kbIds: {
      database: "kb2",
      document: "kb3",
      law: "kb4",
      medical_care_law: "kb5",
    },
    memoryId,
    numberOfResults: 5,
    supportActivity: {
      kbId: "kb-support-activity",
      kbArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      includeGeneratedSql: false,
    },
  };
}

const EMPTY_CONFIG: Config = {
  modelId: "",
  region: undefined,
  kbIds: {
    database: "",
    document: "",
    law: "",
    medical_care_law: "",
  },
  memoryId: undefined,
  numberOfResults: 5,
  supportActivity: {
    kbId: "",
    kbArn: "",
    includeGeneratedSql: false,
  },
};

/** 渡されたメッセージを記録し固定回答を返す supervisor runner。 */
function fakeSupervisor(answer = "FAKE ANSWER") {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return answer;
  };
  return { run, messages };
}

class FakeMemory implements MemoryStore {
  readonly saved: [string, string, string, string][] = [];
  constructor(private readonly history = "") {}
  async recentHistory(): Promise<string> {
    return this.history;
  }
  async saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    this.saved.push([actorId, sessionId, userText, assistantText]);
  }
}

describe("getPrompt / getActorId / getSessionId", () => {
  test("有効な prompt を trim して返す / 無効なら undefined", () => {
    expect(getPrompt({ prompt: "  hello  " })).toBe("hello");
    expect(getPrompt({})).toBeUndefined();
    expect(getPrompt({ prompt: "   " })).toBeUndefined();
    expect(getPrompt({ prompt: 123 })).toBeUndefined();
  });

  test("actor/session は既定値にフォールバック", () => {
    expect(getActorId({})).toBe(DEFAULT_ACTOR_ID);
    expect(getSessionId({})).toBe(DEFAULT_SESSION_ID);
    expect(getActorId({ actor_id: "u1" })).toBe("u1");
    expect(getSessionId({ session_id: "s1" })).toBe("s1");
  });
});

describe("configError / composeMessage", () => {
  test("configError は欠落項目を列挙する", () => {
    const error = configError(["BEDROCK_MODEL_ID", "DATABASE_KB_ID"]);
    expect(error.status).toBe("error");
    if (error.status === "error") {
      expect(error.error).toContain("BEDROCK_MODEL_ID");
      expect(error.error).toContain("DATABASE_KB_ID");
    }
  });

  test("composeMessage は履歴があれば前置きする", () => {
    expect(composeMessage("now?", "User: before")).toContain(
      "Previous conversation:",
    );
    expect(composeMessage("now?", "User: before")).toContain("now?");
    expect(composeMessage("now?", "")).toBe("now?");
  });
});

describe("buildResponse", () => {
  test("設定不備は throw せず error JSON を返す", async () => {
    const result = await buildResponse(
      { prompt: "x" },
      { config: EMPTY_CONFIG },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
  });

  test("prompt 欠落は error を返し、supervisor を呼ばず Memory も保存しない", async () => {
    const supervisor = fakeSupervisor();
    const memory = new FakeMemory("User: prev\nAssistant: ok");
    const result = await buildResponse(
      { session_id: "s1", actor_id: "a1" },
      { config: makeConfig("mem"), supervisorRunner: supervisor.run, memory },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("prompt");
    }
    expect(supervisor.messages).toHaveLength(0);
    expect(memory.saved).toHaveLength(0);
  });

  test("空回答でも success を返し、警告を残す", async () => {
    const supervisor = fakeSupervisor("");
    const warnings: string[] = [];
    const result = await buildResponse(
      { prompt: "hi" },
      {
        config: makeConfig(),
        supervisorRunner: supervisor.run,
        memory: null,
        warn: (m) => warnings.push(m),
      },
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.response).toBe("");
    }
    expect(warnings.some((w) => w.includes("empty response"))).toBe(true);
  });

  test("履歴を前置きし、今回ターンを保存して success を返す", async () => {
    const supervisor = fakeSupervisor();
    const memory = new FakeMemory("User: prev\nAssistant: ok");
    const result = await buildResponse(
      { prompt: "hello", session_id: "s1", actor_id: "a1" },
      {
        config: makeConfig("mem"),
        supervisorRunner: supervisor.run,
        memory,
      },
    );
    expect(result).toEqual({
      status: "success",
      response: "FAKE ANSWER",
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(supervisor.messages[0]).toContain("Previous conversation:");
    expect(supervisor.messages[0]).toContain("hello");
    expect(memory.saved).toEqual([["a1", "s1", "hello", "FAKE ANSWER"]]);
  });

  test("Memory なし（null）では既定 ID で履歴を使わず prompt をそのまま渡す", async () => {
    const supervisor = fakeSupervisor();
    const result = await buildResponse(
      { prompt: "hi" },
      { config: makeConfig(), supervisorRunner: supervisor.run, memory: null },
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.session_id).toBe(DEFAULT_SESSION_ID);
      expect(result.actor_id).toBe(DEFAULT_ACTOR_ID);
    }
    expect(supervisor.messages[0]).toBe("hi");
  });

  test("Memory の履歴取得失敗でも会話を止めず warning を残す", async () => {
    const supervisor = fakeSupervisor();
    const warnings: string[] = [];
    const failingMemory: MemoryStore = {
      recentHistory: async () => {
        throw new Error("boom");
      },
      saveTurn: async () => {},
    };
    const result = await buildResponse(
      { prompt: "hi", actor_id: "a1", session_id: "s1" },
      {
        config: makeConfig("mem"),
        supervisorRunner: supervisor.run,
        memory: failingMemory,
        warn: (m) => warnings.push(m),
      },
    );
    expect(result.status).toBe("success");
    expect(supervisor.messages[0]).toBe("hi");
    expect(warnings.some((w) => w.includes("recentHistory failed"))).toBe(true);
  });
});
