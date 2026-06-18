export type AgentCoreSessionSummary = {
  actorId: string;
  createdAt: string;
  runtimeSessionId: string;
};

export type AgentCoreSessionsResult = {
  memoryId: string;
  sessions: AgentCoreSessionSummary[];
  truncated: boolean;
};

export type BffSessionSummary = {
  conversationId: string;
  createdAt: string;
};

export type BffSessionsResponse = {
  memoryId: string;
  sessions: BffSessionSummary[];
  truncated: boolean;
};
