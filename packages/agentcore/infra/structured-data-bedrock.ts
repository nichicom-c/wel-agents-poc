/**
 * Bedrock SQL Knowledge Base structured-data provider.
 *
 * `Retrieve` is the required path: for structured data stores, Bedrock executes
 * generated SQL and returns the query result. `GenerateQuery` is optional debug
 * output and is never executed by this runtime directly.
 */

import {
  BedrockAgentRuntimeClient,
  GenerateQueryCommand,
  type GenerateQueryCommandOutput,
  type RetrievalResultContentColumn,
  RetrieveCommand,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import {
  NO_STRUCTURED_DATA_MESSAGE,
  type StructuredDataProvider,
} from "./structured-data.ts";

export interface StructuredDataRuntimeClient {
  send(command: RetrieveCommand): Promise<RetrieveCommandOutput>;
  send(command: GenerateQueryCommand): Promise<GenerateQueryCommandOutput>;
}

export type BedrockStructuredDataProviderOptions = {
  knowledgeBaseId: string;
  knowledgeBaseArn: string;
  region?: string | undefined;
  includeGeneratedSql?: boolean;
  client?: StructuredDataRuntimeClient;
};

export function formatStructuredDataResults(
  response: RetrieveCommandOutput,
): string {
  const chunks: string[] = [];
  const rows: RetrievalResultContentColumn[][] = [];
  for (const item of response.retrievalResults ?? []) {
    const text = item.content?.text?.trim();
    if (text) {
      chunks.push(text);
    }
    const row = item.content?.row?.filter((column) => column.columnName);
    if (row?.length) {
      rows.push(row);
    }
  }

  const table = formatRowsAsMarkdownTable(rows);
  if (table) {
    chunks.push(table);
  }

  return chunks.length > 0 ? chunks.join("\n\n") : NO_STRUCTURED_DATA_MESSAGE;
}

function formatRowsAsMarkdownTable(
  rows: RetrievalResultContentColumn[][],
): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Array.from(
    new Set(
      rows.flatMap((row) =>
        row
          .map((column) => column.columnName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    ),
  );
  if (headers.length === 0) {
    return "";
  }

  const tableRows = rows.map((row) => {
    const valuesByHeader = new Map(
      row
        .filter((column) => column.columnName)
        .map((column) => [
          column.columnName?.trim() ?? "",
          formatMarkdownTableCell(column.columnValue ?? ""),
        ]),
    );
    return `| ${headers
      .map((header) => valuesByHeader.get(header) ?? "")
      .join(" | ")} |`;
  });

  return [
    `| ${headers.map(formatMarkdownTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...tableRows,
  ].join("\n");
}

function formatMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function makeBedrockStructuredDataProvider({
  client,
  includeGeneratedSql = false,
  knowledgeBaseArn,
  knowledgeBaseId,
  region,
}: BedrockStructuredDataProviderOptions): StructuredDataProvider {
  const runtimeClient =
    client ?? new BedrockAgentRuntimeClient(region ? { region } : {});

  return {
    async query({ query }) {
      const generatedSql = includeGeneratedSql
        ? await generateSql(runtimeClient, knowledgeBaseArn, query)
        : undefined;
      const results = await retrieveStructuredData(
        runtimeClient,
        knowledgeBaseId,
        query,
      );

      if (!generatedSql) {
        return results;
      }
      return `Generated SQL:\n${generatedSql}\n\nResults:\n${results}`;
    },
  };
}

async function retrieveStructuredData(
  client: StructuredDataRuntimeClient,
  knowledgeBaseId: string,
  query: string,
): Promise<string> {
  const response = await client.send(
    new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: { text: query },
    }),
  );
  return formatStructuredDataResults(response);
}

async function generateSql(
  client: StructuredDataRuntimeClient,
  knowledgeBaseArn: string,
  query: string,
): Promise<string> {
  const response = await client.send(
    new GenerateQueryCommand({
      queryGenerationInput: { type: "TEXT", text: query },
      transformationConfiguration: {
        mode: "TEXT_TO_SQL",
        textToSqlConfiguration: {
          type: "KNOWLEDGE_BASE",
          knowledgeBaseConfiguration: { knowledgeBaseArn },
        },
      },
    }),
  );
  const sql = response.queries
    ?.map((generated) => generated.sql?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  return sql || NO_STRUCTURED_DATA_MESSAGE;
}
