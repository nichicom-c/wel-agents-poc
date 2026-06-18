export type {
  RemoteSessionSummary,
  RequestAwsSessionsOptions,
  SessionsResponse,
} from "./api/sessions-api.ts";
export {
  AgentCoreMemoryNotConfiguredError,
  isAgentCoreMemoryNotConfiguredError,
  requestAwsSessions,
} from "./api/sessions-api.ts";
export type {
  ChatSessionRecord,
  RemoteSessionRecord,
  SessionMessage,
} from "./model/session-history.ts";
export {
  createConversationId,
  ensureSession,
  loadSessionHistory,
  MAX_SESSION_HISTORY_ITEMS,
  mergeRemoteSessions,
  messagesForSession,
  normalizeConversationId,
  SESSION_HISTORY_STORAGE_NAME,
  saveSessionHistory,
  updateSessionMessages,
} from "./model/session-history.ts";
