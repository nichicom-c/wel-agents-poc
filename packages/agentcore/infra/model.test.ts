import { describe, expect, test } from "bun:test";
import { BedrockModel } from "@strands-agents/sdk";

import type { Config } from "./config.ts";
import { makeBedrockModel } from "./model.ts";

const CONFIG: Config = {
  modelId: "jp.anthropic.claude-test",
  region: "ap-northeast-1",
  kbIds: {
    database: "b",
    document: "c",
    law: "d",
    medical_care_law: "e",
  },
  memoryId: undefined,
  numberOfResults: 5,
  supportActivity: {
    kbId: "support",
    kbArn: "support-arn",
    includeGeneratedSql: false,
  },
};

describe("makeBedrockModel", () => {
  test("Config から BedrockModel を生成する", () => {
    expect(makeBedrockModel(CONFIG)).toBeInstanceOf(BedrockModel);
  });

  test("modelId / region が空でも生成できる（SDK 既定にフォールバック）", () => {
    const bare: Config = { ...CONFIG, modelId: "", region: undefined };
    expect(makeBedrockModel(bare)).toBeInstanceOf(BedrockModel);
  });
});
