/**
 * 1 つの Amazon Bedrock Knowledge Base を検索する Strands tool を組み立てる。
 *
 * ポイント（複数の異なる KB をそれぞれの専門 agent に割り当てる方法）:
 *   `knowledgeBaseId` を model 可視の tool 引数にすると、どの KB を引くかが LLM の入力に漏れる。
 *   そこで「kb_id を closure に束縛した自前 tool」を作り、各専門 agent には自分専用の KB だけを
 *   引く tool を 1 つ持たせる（kb_id は LLM から不可視、model へは `query` だけを露出）。
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { type InvokableTool, tool } from "@strands-agents/sdk";
import { z } from "zod";

import { DEFAULT_NUMBER_OF_RESULTS } from "./config.ts";

/** retrieve に必要な最小 client 契約。テストでは `.send` を持つ fake を注入できる。 */
export interface RetrieveClient {
  send(command: RetrieveCommand): Promise<RetrieveCommandOutput>;
}

/** KB に関連情報が無いときに返す定型文。 */
export const NO_INFORMATION_MESSAGE =
  "No relevant information was found in this knowledge base.";

/**
 * Retrieve レスポンスから本文チャンクを連結する。
 *
 * Retrieve は `retrievalResults[].content.text` に本文を返す。スコア順に並んだ上位チャンクを
 * そのまま連結して LLM へ渡す。空・型不一致の項目は読み飛ばし、結果が無ければ定型文を返す。
 */
export function formatRetrievalResults(
  response: RetrieveCommandOutput,
): string {
  const chunks: string[] = [];
  for (const item of response.retrievalResults ?? []) {
    const text = item.content?.text?.trim();
    if (text) {
      chunks.push(text);
    }
  }
  return chunks.length > 0 ? chunks.join("\n\n") : NO_INFORMATION_MESSAGE;
}

/**
 * client で KB を検索し、整形済みテキストを返す。client は DI で受け取る（テスト容易）。
 */
export async function searchKb(
  client: RetrieveClient,
  knowledgeBaseId: string,
  query: string,
  numberOfResults: number = DEFAULT_NUMBER_OF_RESULTS,
): Promise<string> {
  const response = await client.send(
    new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults },
      },
    }),
  );
  return formatRetrievalResults(response);
}

export type MakeKbSearchToolOptions = {
  /** client の region（未指定なら AWS SDK の既定解決）。 */
  region?: string | undefined;
  /** 取得するチャンク数。 */
  numberOfResults?: number;
  /** テスト用に注入する client（省略時は BedrockAgentRuntimeClient を生成）。 */
  client?: RetrieveClient;
};

/**
 * 指定 KB を引く Strands tool を生成する。kb_id を closure に束縛し、model へは `query` だけを露出する。
 */
export function makeKbSearchTool(
  knowledgeBaseId: string,
  options: MakeKbSearchToolOptions = {},
): InvokableTool<{ query: string }, string> {
  const numberOfResults = options.numberOfResults ?? DEFAULT_NUMBER_OF_RESULTS;
  const client =
    options.client ??
    new BedrockAgentRuntimeClient(
      options.region ? { region: options.region } : {},
    );

  return tool({
    name: "search_knowledge_base",
    description:
      "Search this agent's dedicated knowledge base and return the most relevant text.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "A natural-language search query describing what information is needed.",
        ),
    }),
    callback: ({ query }) =>
      searchKb(client, knowledgeBaseId, query, numberOfResults),
  });
}
