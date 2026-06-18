/**
 * Structured-data RAG provider seam.
 *
 * Bedrock SQL Knowledge Base provider を specialist agent から分離し、
 * agent からは `query` だけを受ける Strands tool として扱う。
 */

import { type InvokableTool, tool } from "@strands-agents/sdk";
import { z } from "zod";

export const NO_STRUCTURED_DATA_MESSAGE =
  "No structured data results were returned.";

export type StructuredDataQuery = {
  /** Natural-language query normalized for the support activity SQL Knowledge Base. */
  query: string;
};

export type StructuredDataProvider = {
  query(input: StructuredDataQuery): Promise<string>;
};

export function makeStructuredDataTool(
  provider: StructuredDataProvider,
): InvokableTool<StructuredDataQuery, string> {
  return tool({
    name: "query_structured_data",
    description:
      "Query this agent's dedicated structured data source. Use this for support activity counts, filters, joins, status summaries, due dates, and case/activity aggregations.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "An English natural-language query describing the support activity data needed.",
        ),
    }),
    callback: ({ query }) => {
      const trimmed = query.trim();
      if (!trimmed) {
        return NO_STRUCTURED_DATA_MESSAGE;
      }
      return provider.query({ query: trimmed });
    },
  });
}
