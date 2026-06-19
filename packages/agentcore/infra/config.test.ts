import { describe, expect, test } from "bun:test";

import {
  type Config,
  configFromEnv,
  DEFAULT_NUMBER_OF_RESULTS,
  type DomainKey,
  missingConfig,
} from "./config.ts";

const FULL_ENV = {
  BEDROCK_MODEL_ID: "jp.anthropic.claude-test",
  DATABASE_KB_ID: "kb-db",
  DOCUMENT_KB_ID: "kb-doc",
  LAW_KB_ID: "kb-law",
  LAW_HIERARCHICAL_KB_ID: "kb-law-hierarchical",
  MEDICAL_CARE_LAW_KB_ID: "kb-medical-care-law",
  SUPPORT_ACTIVITY_KB_ID: "kb-support-activity",
  SUPPORT_ACTIVITY_KB_ARN:
    "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
  AWS_REGION: "ap-northeast-1",
  AGENTCORE_MEMORY_ID: "mem-123",
};

describe("configFromEnv", () => {
  test("完全な env から全項目を読み取る", () => {
    const config = configFromEnv(FULL_ENV);
    expect(missingConfig(config)).toEqual([]);
    expect(config.modelId).toBe("jp.anthropic.claude-test");
    expect(config.region).toBe("ap-northeast-1");
    expect(config.memoryId).toBe("mem-123");
    expect(config.kbIds).toEqual({
      database: "kb-db",
      document: "kb-doc",
      law: "kb-law",
      medical_care_law: "kb-medical-care-law",
    });
    expect(config.lawHierarchicalKbId).toBe("kb-law-hierarchical");
    expect(config.supportActivity).toEqual({
      kbId: "kb-support-activity",
      kbArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      includeGeneratedSql: false,
    });
    expect(config.numberOfResults).toBe(DEFAULT_NUMBER_OF_RESULTS);
  });

  test("region は AWS_DEFAULT_REGION を優先する", () => {
    const config = configFromEnv({
      ...FULL_ENV,
      AWS_DEFAULT_REGION: "us-east-1",
    });
    expect(config.region).toBe("us-east-1");
  });

  test("region 未設定なら undefined（SDK の既定解決に委ねる）", () => {
    const { AWS_REGION: _omit, ...env } = FULL_ENV;
    expect(configFromEnv(env).region).toBeUndefined();
  });

  test("空文字・空白のみは未設定扱い", () => {
    const config = configFromEnv({
      ...FULL_ENV,
      AGENTCORE_MEMORY_ID: "   ",
      DATABASE_KB_ID: "",
    });
    expect(config.memoryId).toBeUndefined();
    expect(config.kbIds.database).toBe("");
  });

  test("KB_NUMBER_OF_RESULTS は正の整数のみ採用し、それ以外は既定値", () => {
    expect(
      configFromEnv({ ...FULL_ENV, KB_NUMBER_OF_RESULTS: "8" }).numberOfResults,
    ).toBe(8);
    for (const invalid of ["", "0", "-3", "abc", "2.5"]) {
      expect(
        configFromEnv({ ...FULL_ENV, KB_NUMBER_OF_RESULTS: invalid })
          .numberOfResults,
      ).toBe(DEFAULT_NUMBER_OF_RESULTS);
    }
  });

  test("support_activity の debug flag を読み取る", () => {
    const config = configFromEnv({
      ...FULL_ENV,
      SUPPORT_ACTIVITY_INCLUDE_GENERATED_SQL: "true",
    });

    expect(config.supportActivity).toMatchObject({
      includeGeneratedSql: true,
    });
  });

  test("support_activity KB ARN は generated SQL debug 無効なら任意", () => {
    const { SUPPORT_ACTIVITY_KB_ARN: _omit, ...env } = FULL_ENV;
    const config = configFromEnv(env);

    expect(config.supportActivity.kbArn).toBe("");
    expect(config.supportActivity.includeGeneratedSql).toBe(false);
    expect(missingConfig(config)).toEqual([]);
  });

  test("law hierarchical KB ID は比較用の任意設定として読み取る", () => {
    const config = configFromEnv({
      ...FULL_ENV,
      LAW_HIERARCHICAL_KB_ID: "  kb-law-hierarchical-alt  ",
    });

    expect(config.lawHierarchicalKbId).toBe("kb-law-hierarchical-alt");

    const { LAW_HIERARCHICAL_KB_ID: _omit, ...env } = FULL_ENV;
    expect(configFromEnv(env).lawHierarchicalKbId).toBeUndefined();
    expect(missingConfig(configFromEnv(env))).toEqual([]);
  });
});

describe("missingConfig", () => {
  test("空 env では必須項目をすべて列挙する（Memory は除く）", () => {
    const missing = missingConfig(configFromEnv({}));
    expect(missing).toContain("BEDROCK_MODEL_ID");
    expect(missing).toContain("DATABASE_KB_ID");
    expect(missing).toContain("DOCUMENT_KB_ID");
    expect(missing).toContain("LAW_KB_ID");
    expect(missing).toContain("MEDICAL_CARE_LAW_KB_ID");
    expect(missing).toContain("SUPPORT_ACTIVITY_KB_ID");
    expect(missing).not.toContain("LAW_HIERARCHICAL_KB_ID");
    expect(missing).not.toContain("SUPPORT_ACTIVITY_KB_ARN");
    expect(missing).not.toContain("AGENTCORE_MEMORY_ID");
  });

  test("Memory ID は任意（未設定でも missing にならない）", () => {
    const { AGENTCORE_MEMORY_ID: _omit, ...env } = FULL_ENV;
    const config = configFromEnv(env);
    expect(missingConfig(config)).toEqual([]);
    expect(config.memoryId).toBeUndefined();
  });

  test("一部の KB ID 欠落を検出する", () => {
    const config: Config = {
      modelId: "m",
      region: undefined,
      kbIds: {
        database: "",
        document: "d",
        law: "l",
        medical_care_law: "m",
      } as Record<DomainKey, string>,
      memoryId: undefined,
      numberOfResults: DEFAULT_NUMBER_OF_RESULTS,
      supportActivity: {
        kbId: "support",
        kbArn: "support-arn",
        includeGeneratedSql: false,
      },
    };
    expect(missingConfig(config)).toEqual(["DATABASE_KB_ID"]);
  });

  test("support_activity は SQL KB ID を常時、ARN は debug 時だけ列挙する", () => {
    expect(
      missingConfig(
        configFromEnv({
          ...FULL_ENV,
          SUPPORT_ACTIVITY_KB_ID: "",
          SUPPORT_ACTIVITY_KB_ARN: "",
        }),
      ),
    ).toEqual(["SUPPORT_ACTIVITY_KB_ID"]);

    expect(
      missingConfig(
        configFromEnv({
          ...FULL_ENV,
          SUPPORT_ACTIVITY_KB_ARN: "",
          SUPPORT_ACTIVITY_INCLUDE_GENERATED_SQL: "true",
        }),
      ),
    ).toEqual(["SUPPORT_ACTIVITY_KB_ARN"]);
  });
});
