import { describe, expect, test } from "bun:test";

import {
  hasConfirmFlag,
  RESET_STATEMENTS,
  resetSchema,
} from "./reset-schema.ts";

const TARGET = {
  database: "training_data",
  region: "ap-northeast-1",
  resourceArn: "arn:aws:rds:ap-northeast-1:000000000000:cluster:test",
  secretArn: "arn:aws:secretsmanager:ap-northeast-1:000000000000:secret:test",
};

class FakeRdsDataClient {
  readonly statements: string[] = [];

  async send(command: { input: { sql?: string } }) {
    this.statements.push(command.input.sql ?? "");
    return {};
  }
}

describe("hasConfirmFlag", () => {
  test("--yes が無ければ false", () => {
    expect(hasConfirmFlag([])).toBe(false);
    expect(hasConfirmFlag(["--dry-run"])).toBe(false);
  });

  test("--yes があれば true", () => {
    expect(hasConfirmFlag(["--yes"])).toBe(true);
  });
});

describe("resetSchema", () => {
  test("drop schema / create schema を順に1文ずつ発行する", async () => {
    const client = new FakeRdsDataClient();

    await resetSchema(TARGET, { client: client as never });

    expect(client.statements).toEqual([...RESET_STATEMENTS]);
  });
});
