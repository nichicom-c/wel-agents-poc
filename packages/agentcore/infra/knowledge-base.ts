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
 * Bedrock が自分で付ける内部 metadata key の prefix。chunk ID や data source ID は出典として
 * 意味を持たないので、LLM に渡す source block からは落とす。
 */
const INTERNAL_METADATA_PREFIX = "x-amz-bedrock-kb-";

/**
 * 1 chunk 分の出典ヘッダを組み立てる。
 *
 * corpus ごとに metadata の key は違う（保健師記録は section_title / unit_title / output_page、
 * 医療法令は chapter_title / output_page、法令は article / source_url、document / database は
 * 実質なし）ので、key を決め打ちせず corpus 側が付けた属性をそのまま並べる。key 順は安定させる。
 */
export function formatSourceHeader(
  index: number,
  item: NonNullable<RetrieveCommandOutput["retrievalResults"]>[number],
): string {
  const parts = [`[source ${index}]`];

  const uri = item.location?.s3Location?.uri?.trim();
  if (uri) {
    parts.push(uri);
  }

  if (typeof item.score === "number" && Number.isFinite(item.score)) {
    parts.push(`(score ${item.score.toFixed(3)})`);
  }

  const attributes = Object.entries(item.metadata ?? {})
    .filter(([key]) => !key.startsWith(INTERNAL_METADATA_PREFIX))
    .map(([key, value]) => [key, String(value).trim()] as const)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`);

  const header = parts.join(" ");
  return attributes.length > 0
    ? `${header}\nmetadata: ${attributes.join("; ")}`
    : header;
}

/**
 * Retrieve レスポンスを、出典つきの chunk 列に整形する。
 *
 * Retrieve は本文を `retrievalResults[].content.text`、出典を `.location` / `.metadata` / `.score`
 * に分けて返す。本文だけを渡すと、専門 agent の system prompt が「retrieved chunk の metadata から
 * ページを引用せよ」と指示していても引用元の情報が手元に無く、ページを示せない（本文に出典 footer を
 * 埋め込んだ corpus でだけ偶然うまくいく）。chunk ごとに出典ヘッダを付けて渡す。
 */
export function formatRetrievalResults(
  response: RetrieveCommandOutput,
): string {
  const chunks: string[] = [];
  for (const item of response.retrievalResults ?? []) {
    const text = item.content?.text?.trim();
    if (text) {
      chunks.push(`${formatSourceHeader(chunks.length + 1, item)}\n${text}`);
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
