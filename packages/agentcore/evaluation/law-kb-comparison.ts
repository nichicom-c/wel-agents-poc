import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  type RetrieveCommandOutput,
} from "@aws-sdk/client-bedrock-agent-runtime";

import { configFromEnv, type EnvSource } from "../infra/config.ts";
import type { RetrieveClient } from "../infra/knowledge-base.ts";

export type RetrievedChunk = {
  readonly index: number;
  readonly text: string;
  readonly score?: number;
  readonly location?: unknown;
  readonly metadata?: Record<string, unknown>;
};

export type KnowledgeBaseComparison = {
  readonly knowledgeBaseId: string;
  readonly resultCount: number;
  readonly results: RetrievedChunk[];
};

export type LawKbComparisonReport = {
  readonly query: string;
  readonly numberOfResults: number;
  readonly current: KnowledgeBaseComparison;
  readonly hierarchical: KnowledgeBaseComparison;
};

type ComparisonInput = {
  readonly knowledgeBaseId: string;
  readonly response: RetrieveCommandOutput;
};

export type BuildLawKbComparisonReportOptions = {
  readonly query: string;
  readonly numberOfResults: number;
  readonly current: ComparisonInput;
  readonly hierarchical: ComparisonInput;
};

export type RetrieveLawKbComparisonOptions = {
  readonly query: string;
  readonly currentKnowledgeBaseId: string;
  readonly hierarchicalKnowledgeBaseId: string;
  readonly numberOfResults: number;
};

function extractChunks(response: RetrieveCommandOutput): RetrievedChunk[] {
  const chunks: RetrievedChunk[] = [];
  for (const result of response.retrievalResults ?? []) {
    const text = result.content?.text?.trim();
    if (!text) {
      continue;
    }
    chunks.push({
      index: chunks.length + 1,
      text,
      score: result.score,
      location: result.location,
      metadata: result.metadata as Record<string, unknown> | undefined,
    });
  }
  return chunks;
}

function buildComparison(input: ComparisonInput): KnowledgeBaseComparison {
  const results = extractChunks(input.response);
  return {
    knowledgeBaseId: input.knowledgeBaseId,
    resultCount: results.length,
    results,
  };
}

export function buildLawKbComparisonReport(
  options: BuildLawKbComparisonReportOptions,
): LawKbComparisonReport {
  return {
    query: options.query,
    numberOfResults: options.numberOfResults,
    current: buildComparison(options.current),
    hierarchical: buildComparison(options.hierarchical),
  };
}

export function formatComparisonJson(report: LawKbComparisonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function retrieveLawKbComparison(
  client: RetrieveClient,
  options: RetrieveLawKbComparisonOptions,
): Promise<LawKbComparisonReport> {
  const retrievalConfiguration = {
    vectorSearchConfiguration: {
      numberOfResults: options.numberOfResults,
    },
  };
  const retrievalQuery = { text: options.query };

  const [current, hierarchical] = await Promise.all([
    client.send(
      new RetrieveCommand({
        knowledgeBaseId: options.currentKnowledgeBaseId,
        retrievalConfiguration,
        retrievalQuery,
      }),
    ),
    client.send(
      new RetrieveCommand({
        knowledgeBaseId: options.hierarchicalKnowledgeBaseId,
        retrievalConfiguration,
        retrievalQuery,
      }),
    ),
  ]);

  return buildLawKbComparisonReport({
    query: options.query,
    numberOfResults: options.numberOfResults,
    current: {
      knowledgeBaseId: options.currentKnowledgeBaseId,
      response: current,
    },
    hierarchical: {
      knowledgeBaseId: options.hierarchicalKnowledgeBaseId,
      response: hierarchical,
    },
  });
}

function parseQueryArg(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--query") {
      return args[index + 1]?.trim() || undefined;
    }
    if (arg?.startsWith("--query=")) {
      return arg.slice("--query=".length).trim() || undefined;
    }
  }
  return (
    args
      .filter((arg) => !arg.startsWith("--"))
      .join(" ")
      .trim() || undefined
  );
}

function comparisonOptionsFromEnv(
  env: EnvSource,
  query: string,
): RetrieveLawKbComparisonOptions {
  const config = configFromEnv(env);
  const lawKbId = config.kbIds.law;
  const lawHierarchicalKbId = config.lawHierarchicalKbId;
  const missing: string[] = [];
  if (!lawKbId) {
    missing.push("LAW_KB_ID");
  }
  if (!lawHierarchicalKbId) {
    missing.push("LAW_HIERARCHICAL_KB_ID");
  }
  if (!lawKbId || !lawHierarchicalKbId) {
    throw new Error(
      `Missing required env for law KB comparison: ${missing.join(", ")}`,
    );
  }
  return {
    query,
    currentKnowledgeBaseId: lawKbId,
    hierarchicalKnowledgeBaseId: lawHierarchicalKbId,
    numberOfResults: config.numberOfResults,
  };
}

async function main(): Promise<void> {
  const query = parseQueryArg(Bun.argv.slice(2));
  if (!query) {
    throw new Error(
      "Usage: bun run packages/agentcore/evaluation/law-kb-comparison.ts --query <query>",
    );
  }

  const config = configFromEnv();
  const options = comparisonOptionsFromEnv(process.env, query);
  const client = new BedrockAgentRuntimeClient(
    config.region ? { region: config.region } : {},
  );
  const report = await retrieveLawKbComparison(client, options);
  process.stdout.write(formatComparisonJson(report));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
