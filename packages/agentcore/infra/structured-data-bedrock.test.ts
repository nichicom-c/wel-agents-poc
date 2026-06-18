import { describe, expect, test } from "bun:test";
import {
  GenerateQueryCommand,
  type GenerateQueryCommandOutput,
  RetrieveCommand,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { NO_STRUCTURED_DATA_MESSAGE } from "./structured-data.ts";
import {
  formatStructuredDataResults,
  makeBedrockStructuredDataProvider,
  type StructuredDataRuntimeClient,
} from "./structured-data-bedrock.ts";

class FakeStructuredDataClient implements StructuredDataRuntimeClient {
  readonly commands: Array<GenerateQueryCommand | RetrieveCommand> = [];

  async send(command: RetrieveCommand): Promise<RetrieveCommandOutput>;
  async send(
    command: GenerateQueryCommand,
  ): Promise<GenerateQueryCommandOutput>;
  async send(
    command: GenerateQueryCommand | RetrieveCommand,
  ): Promise<GenerateQueryCommandOutput | RetrieveCommandOutput> {
    this.commands.push(command);
    if (command instanceof GenerateQueryCommand) {
      return {
        queries: [{ type: "REDSHIFT_SQL", sql: "select count(*) from cases" }],
        $metadata: {},
      } as GenerateQueryCommandOutput;
    }
    return {
      retrievalResults: [{ content: { text: "status,count\nopen,8" } }],
      $metadata: {},
    } as RetrieveCommandOutput;
  }
}

describe("formatStructuredDataResults", () => {
  test("Retrieve results の text chunk を連結する", () => {
    expect(
      formatStructuredDataResults({
        retrievalResults: [
          { content: { text: "row 1" } },
          { content: { text: "row 2" } },
        ],
        $metadata: {},
      } as RetrieveCommandOutput),
    ).toBe("row 1\n\nrow 2");
  });

  test("Retrieve results の SQL row を Markdown table に整形する", () => {
    expect(
      formatStructuredDataResults({
        retrievalResults: [
          {
            content: {
              type: "ROW",
              row: [
                {
                  columnName: "table_name",
                  columnValue: "households",
                  type: "STRING",
                },
                { columnName: "row_count", columnValue: "12", type: "LONG" },
              ],
            },
          },
          {
            content: {
              type: "ROW",
              row: [
                {
                  columnName: "table_name",
                  columnValue: "support_cases",
                  type: "STRING",
                },
                { columnName: "row_count", columnValue: "32", type: "LONG" },
              ],
            },
          },
        ],
        $metadata: {},
      } as RetrieveCommandOutput),
    ).toBe(
      [
        "| table_name | row_count |",
        "| --- | --- |",
        "| households | 12 |",
        "| support_cases | 32 |",
      ].join("\n"),
    );
  });

  test("結果が空なら readable message", () => {
    expect(
      formatStructuredDataResults({ retrievalResults: [], $metadata: {} }),
    ).toBe(NO_STRUCTURED_DATA_MESSAGE);
  });
});

describe("makeBedrockStructuredDataProvider", () => {
  test("RetrieveCommand で SQL KB ID と natural-language query を送る", async () => {
    const client = new FakeStructuredDataClient();
    const provider = makeBedrockStructuredDataProvider({
      client,
      knowledgeBaseArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      knowledgeBaseId: "KB12345678",
    });

    await expect(provider.query({ query: "Count open cases" })).resolves.toBe(
      "status,count\nopen,8",
    );

    expect(client.commands).toHaveLength(1);
    expect(client.commands[0]).toBeInstanceOf(RetrieveCommand);
    expect(client.commands[0]?.input).toEqual({
      knowledgeBaseId: "KB12345678",
      retrievalQuery: { text: "Count open cases" },
    });
  });

  test("includeGeneratedSql=true なら GenerateQuery を先に呼び SQL を結果へ含める", async () => {
    const client = new FakeStructuredDataClient();
    const provider = makeBedrockStructuredDataProvider({
      client,
      includeGeneratedSql: true,
      knowledgeBaseArn:
        "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
      knowledgeBaseId: "KB12345678",
    });

    const result = await provider.query({ query: "Count open cases" });

    expect(client.commands[0]).toBeInstanceOf(GenerateQueryCommand);
    expect(client.commands[0]?.input).toEqual({
      queryGenerationInput: { type: "TEXT", text: "Count open cases" },
      transformationConfiguration: {
        mode: "TEXT_TO_SQL",
        textToSqlConfiguration: {
          type: "KNOWLEDGE_BASE",
          knowledgeBaseConfiguration: {
            knowledgeBaseArn:
              "arn:aws:bedrock:ap-northeast-1:123456789012:knowledge-base/KB12345678",
          },
        },
      },
    });
    expect(client.commands[1]).toBeInstanceOf(RetrieveCommand);
    expect(result).toContain("Generated SQL:");
    expect(result).toContain("select count(*) from cases");
    expect(result).toContain("Results:");
    expect(result).toContain("status,count");
  });
});
