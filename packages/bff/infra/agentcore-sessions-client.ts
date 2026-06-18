import {
  BedrockAgentCoreClient,
  EventFilterCondition,
  ListSessionsCommand,
  type ListSessionsCommandOutput,
} from "@aws-sdk/client-bedrock-agentcore";

import type { AgentCoreSessionsResult } from "../contracts/sessions.ts";

const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_UPPER_BOUND = 100;

type ListSessionsParams = {
  actorId: string;
};

type AgentCoreSessionsConfig = {
  maxResults?: number;
  memoryId: string;
  region: string;
};

export type AgentCoreSessionsSender = (
  command: ListSessionsCommand,
) => Promise<ListSessionsCommandOutput>;

export type AgentCoreSessionsClientDeps = {
  sender?: AgentCoreSessionsSender;
};

export async function listAgentCoreSessions(
  config: AgentCoreSessionsConfig,
  params: ListSessionsParams,
  deps: AgentCoreSessionsClientDeps = {},
): Promise<AgentCoreSessionsResult> {
  const maxResults = boundedMaxResults(config.maxResults);
  const command = new ListSessionsCommand({
    actorId: params.actorId,
    filter: {
      eventFilter: EventFilterCondition.HAS_EVENTS,
    },
    maxResults,
    memoryId: config.memoryId,
  });
  const sender = deps.sender ?? defaultSender(config.region);
  const output = await sender(command);

  return {
    memoryId: config.memoryId,
    sessions: (output.sessionSummaries ?? [])
      .flatMap((summary) => {
        const actorId = text(summary.actorId);
        const runtimeSessionId = text(summary.sessionId);
        const createdAt = isoDate(summary.createdAt);

        if (!actorId || !runtimeSessionId || !createdAt) {
          return [];
        }

        return [
          {
            actorId,
            createdAt,
            runtimeSessionId,
          },
        ];
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    truncated: Boolean(output.nextToken),
  };
}

function defaultSender(region: string): AgentCoreSessionsSender {
  const client = new BedrockAgentCoreClient({ region });
  return (command) => client.send(command);
}

function boundedMaxResults(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_RESULTS_UPPER_BOUND);
}

function isoDate(value: Date | undefined): string {
  if (!value) {
    return "";
  }

  const timestamp = value.toISOString();
  return Number.isNaN(Date.parse(timestamp)) ? "" : timestamp;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
