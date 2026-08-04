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
  const output = await sender(command).catch((error) => {
    if (isNewActorNotFound(error)) {
      return {
        $metadata: {},
        sessionSummaries: [],
      } as ListSessionsCommandOutput;
    }
    throw error;
  });

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

/**
 * まだ一度も会話していない actor への ListSessions は `ResourceNotFoundException:
 * Actor <id> not found` を返す（memoryId 自体が存在しない場合の `Memory not found: <id>` とは
 * message で区別する）。前者は「セッションが 0 件」という正常系なので空配列として扱う。
 */
function isNewActorNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "ResourceNotFoundException" &&
    /^Actor .* not found$/i.test(error.message)
  );
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
