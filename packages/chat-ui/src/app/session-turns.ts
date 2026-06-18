import {
  type AgentStreamEvent,
  type AssistantProgressState,
  type AssistantStreamState,
  applyAgentEvent,
} from "../features/chat-stream/index.ts";
import {
  type ChatSessionRecord,
  messagesForSession,
  type SessionMessage,
  updateSessionMessages,
} from "../features/session-history/index.ts";

export type SessionTurnState = {
  assistantMessageId: string;
  progress?: AssistantProgressState;
  startedAt: string;
  stream: AssistantStreamState;
};

export type SessionTurnMap = Record<string, SessionTurnState>;

export type SessionTurnModel = {
  sessions: ChatSessionRecord[];
  turns: SessionTurnMap;
};

export type StartSessionTurnInput = {
  assistantMessage: SessionMessage;
  conversationId: string;
  startedAt: string;
  userMessage: SessionMessage;
};

export type ApplySessionTurnEventInput = {
  conversationId: string;
  event: AgentStreamEvent;
};

export type FailSessionTurnInput = {
  conversationId: string;
  message: string;
};

export function isSessionBusy(
  turns: SessionTurnMap,
  conversationId: string,
): boolean {
  return Boolean(turns[conversationId]);
}

export function startSessionTurn(
  model: SessionTurnModel,
  input: StartSessionTurnInput,
): SessionTurnModel {
  const messages = messagesForSession(model.sessions, input.conversationId);
  return {
    sessions: updateSessionMessages(model.sessions, input.conversationId, [
      ...messages,
      input.userMessage,
      input.assistantMessage,
    ]),
    turns: {
      ...model.turns,
      [input.conversationId]: {
        assistantMessageId: input.assistantMessage.id,
        startedAt: input.startedAt,
        stream: { done: false, text: "" },
      },
    },
  };
}

export function applySessionTurnEvent(
  model: SessionTurnModel,
  input: ApplySessionTurnEventInput,
): SessionTurnModel {
  const turn = model.turns[input.conversationId];
  if (!turn) {
    return model;
  }

  const stream = applyAgentEvent(turn.stream, input.event);
  const sessions = updateSessionsForEvent(model.sessions, {
    conversationId: input.conversationId,
    event: input.event,
    messageId: turn.assistantMessageId,
    stream,
  });

  if (stream.done) {
    const { [input.conversationId]: _finished, ...remainingTurns } =
      model.turns;
    return {
      sessions,
      turns: remainingTurns,
    };
  }

  return {
    sessions,
    turns: {
      ...model.turns,
      [input.conversationId]: {
        ...turn,
        progress: stream.progress,
        stream,
      },
    },
  };
}

function updateSessionsForEvent(
  sessions: readonly ChatSessionRecord[],
  input: {
    conversationId: string;
    event: AgentStreamEvent;
    messageId: string;
    stream: AssistantStreamState;
  },
): ChatSessionRecord[] {
  if (input.event.type === "delta" || input.event.type === "final") {
    return updateAssistantMessage(sessions, input.conversationId, {
      messageId: input.messageId,
      text:
        input.stream.text || (input.stream.done ? "応答本文が空でした。" : ""),
    });
  }

  if (input.event.type === "error") {
    return updateAssistantMessage(sessions, input.conversationId, {
      messageId: input.messageId,
      text: `エラー: ${input.stream.error ?? input.event.message}`,
    });
  }

  return [...sessions];
}

export function failSessionTurn(
  model: SessionTurnModel,
  input: FailSessionTurnInput,
): SessionTurnModel {
  const turn = model.turns[input.conversationId];
  if (!turn) {
    return model;
  }

  const { [input.conversationId]: _failed, ...remainingTurns } = model.turns;
  return {
    sessions: updateAssistantMessage(model.sessions, input.conversationId, {
      messageId: turn.assistantMessageId,
      text: `エラー: ${input.message}`,
    }),
    turns: remainingTurns,
  };
}

function updateAssistantMessage(
  sessions: readonly ChatSessionRecord[],
  conversationId: string,
  update: { messageId: string; text: string },
): ChatSessionRecord[] {
  return updateSessionMessages(
    sessions,
    conversationId,
    messagesForSession(sessions, conversationId).map((message) =>
      message.id === update.messageId
        ? { ...message, text: update.text }
        : message,
    ),
  );
}
