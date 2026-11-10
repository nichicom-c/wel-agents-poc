export const SESSION_HISTORY_STORAGE_NAME = "wel-agents-chat-session-history";
export const MAX_SESSION_HISTORY_ITEMS = 24;

export type SessionMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export type ChatSessionRecord = {
  conversationId: string;
  createdAt: string;
  messageCount: number;
  messages: SessionMessage[];
  preview: string;
  title: string;
  updatedAt: string;
};

export type RemoteSessionRecord = {
  conversationId: string;
  createdAt: string;
};

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

const DEFAULT_TITLE = "New session";
const EMPTY_PREVIEW = "会話はまだありません";
const REMOTE_SESSION_TITLE = "AWS session";
const REMOTE_SESSION_PREVIEW = "AWS Memory に保存済み";
const TITLE_MAX_LENGTH = 42;
const PREVIEW_MAX_LENGTH = 88;

/**
 * AgentCore Runtime session ID の制約。BFF 側の `isRuntimeSessionId` と同じ規則で、
 * 規則に合わない conversationId は送信時に BFF が 400 で弾く。UI も同じ規則を持っておかないと、
 * localStorage に残った旧形式の ID や会話ID入力欄の手入力がそのまま送られ、送信のたびに
 * エラーになる（UI からは直す手段がない）。
 */
const RUNTIME_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{32,255}$/;

export function isRuntimeSessionId(value: string): boolean {
  return RUNTIME_SESSION_ID_PATTERN.test(value);
}

export function createConversationId(randomId = randomUUID()): string {
  return `chat-${randomId}`;
}

/**
 * 規則に合う conversationId だけ通し、合わなければ新しい ID を発行する。空文字と
 * 旧形式・手入力ミスの両方がここで吸収される。
 */
export function normalizeConversationId(value: string): string {
  const trimmed = value.trim();
  return isRuntimeSessionId(trimmed) ? trimmed : createConversationId();
}

export function loadSessionHistory(
  storage: SessionStorageLike = localStorage,
): ChatSessionRecord[] {
  const raw = storage.getItem(SESSION_HISTORY_STORAGE_NAME);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sortSessionsByCreatedAt(
      parsed.flatMap((item) => {
        const record = normalizeSessionRecord(item);
        return record ? [record] : [];
      }),
    ).slice(0, MAX_SESSION_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function saveSessionHistory(
  sessions: readonly ChatSessionRecord[],
  storage: SessionStorageLike = localStorage,
): void {
  storage.setItem(
    SESSION_HISTORY_STORAGE_NAME,
    JSON.stringify(
      sortSessionsByCreatedAt(sessions).slice(0, MAX_SESSION_HISTORY_ITEMS),
    ),
  );
}

export function ensureSession(
  sessions: readonly ChatSessionRecord[],
  conversationId: string,
  now: Date = new Date(),
): ChatSessionRecord[] {
  const existing = sessions.find(
    (session) => session.conversationId === conversationId,
  );

  if (existing) {
    return sortSessionsByCreatedAt(sessions);
  }

  return sortSessionsByCreatedAt([
    createSessionRecord(conversationId, now),
    ...sessions,
  ]).slice(0, MAX_SESSION_HISTORY_ITEMS);
}

export function messagesForSession(
  sessions: readonly ChatSessionRecord[],
  conversationId: string,
): SessionMessage[] {
  const session = sessions.find(
    (item) => item.conversationId === conversationId,
  );
  return session ? session.messages.map((message) => ({ ...message })) : [];
}

export function updateSessionMessages(
  sessions: readonly ChatSessionRecord[],
  conversationId: string,
  messages: readonly SessionMessage[],
  now: Date = new Date(),
): ChatSessionRecord[] {
  const timestamp = now.toISOString();
  const nextMessages = sanitizeMessages(messages);
  const existing =
    sessions.find((session) => session.conversationId === conversationId) ??
    createSessionRecord(conversationId, now);
  const updated: ChatSessionRecord = {
    ...existing,
    messageCount: nextMessages.length,
    messages: nextMessages,
    preview: previewFromMessages(nextMessages),
    title: titleFromMessages(nextMessages) || existing.title || DEFAULT_TITLE,
    updatedAt: timestamp,
  };

  return sortSessionsByCreatedAt([
    updated,
    ...sessions.filter((session) => session.conversationId !== conversationId),
  ]).slice(0, MAX_SESSION_HISTORY_ITEMS);
}

export function mergeRemoteSessions(
  sessions: readonly ChatSessionRecord[],
  remoteSessions: readonly RemoteSessionRecord[],
): ChatSessionRecord[] {
  const byConversationId = new Map(
    sessions.map((session) => [session.conversationId, session]),
  );

  for (const remoteSession of remoteSessions) {
    const conversationId = text(remoteSession.conversationId);
    const createdAt = validIsoDate(text(remoteSession.createdAt));
    if (!conversationId || !createdAt || byConversationId.has(conversationId)) {
      continue;
    }

    byConversationId.set(conversationId, {
      conversationId,
      createdAt,
      messageCount: 0,
      messages: [],
      preview: REMOTE_SESSION_PREVIEW,
      title: REMOTE_SESSION_TITLE,
      updatedAt: createdAt,
    });
  }

  return sortSessionsByCreatedAt([...byConversationId.values()]).slice(
    0,
    MAX_SESSION_HISTORY_ITEMS,
  );
}

function createSessionRecord(
  conversationId: string,
  now: Date,
): ChatSessionRecord {
  const timestamp = now.toISOString();
  return {
    conversationId,
    createdAt: timestamp,
    messageCount: 0,
    messages: [],
    preview: EMPTY_PREVIEW,
    title: DEFAULT_TITLE,
    updatedAt: timestamp,
  };
}

function normalizeSessionRecord(value: unknown): ChatSessionRecord | undefined {
  const record = asRecord(value);
  const conversationId = text(record.conversationId);
  // 規則に合わない conversationId は BFF に送れないので、session rail に並べても選んだ瞬間に
  // 詰む。読み込み時に落として履歴ごと掃除する。
  if (!isRuntimeSessionId(conversationId)) {
    return undefined;
  }

  const messages = sanitizeMessages(
    Array.isArray(record.messages) ? record.messages : [],
  );
  const fallbackDate = new Date(0).toISOString();
  const createdAt = validIsoDate(text(record.createdAt)) ?? fallbackDate;
  const updatedAt = validIsoDate(text(record.updatedAt)) ?? createdAt;

  return {
    conversationId,
    createdAt,
    messageCount: messages.length,
    messages,
    preview: text(record.preview) || previewFromMessages(messages),
    title: text(record.title) || titleFromMessages(messages) || DEFAULT_TITLE,
    updatedAt,
  };
}

function sanitizeMessages(messages: readonly unknown[]): SessionMessage[] {
  return messages.flatMap((item) => {
    const message = asRecord(item);
    const id = text(message.id);
    const textValue = text(message.text);
    const role = message.role;
    if (!id || (role !== "assistant" && role !== "user")) {
      return [];
    }
    return [{ id, role, text: textValue }];
  });
}

function sortSessionsByCreatedAt(
  sessions: readonly ChatSessionRecord[],
): ChatSessionRecord[] {
  return [...sessions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

function titleFromMessages(messages: readonly SessionMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return compactLabel(firstUserMessage?.text ?? "", TITLE_MAX_LENGTH);
}

function previewFromMessages(messages: readonly SessionMessage[]): string {
  const lastText = [...messages]
    .reverse()
    .find((message) => message.text.trim())?.text;
  return compactLabel(lastText ?? "", PREVIEW_MAX_LENGTH) || EMPTY_PREVIEW;
}

function compactLabel(value: string, maxLength: number): string {
  const normalized = value.trim().replaceAll(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

function validIsoDate(value: string): string | undefined {
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

export function randomUUID(): string {
  // crypto.randomUUID が無い環境向けの fallback。`Math.random()` をそのまま埋めると `.` が
  // 入り conversationId の charset（A-Za-z0-9_-）に違反するため、base36 の小数部だけを使う。
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(16, "0")}-${Math.random().toString(36).slice(2).padEnd(16, "0")}`
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
