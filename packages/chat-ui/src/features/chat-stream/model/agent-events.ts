export type AgentStreamEvent =
  | { type: "ready"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; ok: boolean }
  | {
      type: "final";
      response: string;
      conversationId: string;
      modelId: string;
    }
  | { type: "error"; message: string };

export type AssistantProgressState = {
  label: string;
  tone: "active" | "complete" | "warning";
};

export type AssistantStreamState = {
  done: boolean;
  text: string;
  error?: string;
  progress?: AssistantProgressState;
};

const TOOL_PROGRESS_LABELS: Record<string, string> = {
  database_rag_agent: "データベース確認",
  document_rag_agent: "文書確認",
  law_rag_agent: "法令確認",
  medical_care_law_rag_agent: "医療関連法令確認",
  support_activity_rag_agent: "支援活動データ確認",
};

export function parseAgentEvent(raw: string): AgentStreamEvent {
  const parsed: unknown = JSON.parse(raw);
  const record = asRecord(parsed);

  switch (record.type) {
    case "ready":
      return { type: "ready", conversationId: text(record.conversationId) };
    case "delta":
      return { type: "delta", text: text(record.text) };
    case "tool_start":
      return { type: "tool_start", name: text(record.name) };
    case "tool_end":
      return {
        type: "tool_end",
        name: text(record.name),
        ok: record.ok === true,
      };
    case "final":
      return {
        type: "final",
        response: text(record.response),
        conversationId: text(record.conversationId),
        modelId: text(record.modelId),
      };
    case "error":
      return { type: "error", message: text(record.message) || "error" };
    default:
      throw new Error("unsupported WebSocket event");
  }
}

export function applyAgentEvent(
  state: AssistantStreamState,
  event: AgentStreamEvent,
): AssistantStreamState {
  switch (event.type) {
    case "ready":
      return {
        ...state,
        progress: { label: "回答を準備しています", tone: "active" },
      };
    case "tool_start":
      return {
        ...state,
        progress: {
          label: `${toolLabel(event.name)}中`,
          tone: "active",
        },
      };
    case "tool_end":
      return {
        ...state,
        progress: {
          label: event.ok
            ? `${toolLabel(event.name)}完了`
            : `${toolLabel(event.name)}で問題が発生しました`,
          tone: event.ok ? "complete" : "warning",
        },
      };
    case "delta":
      return {
        ...state,
        progress: { label: "回答を生成中", tone: "active" },
        text: state.text + event.text,
      };
    case "final":
      return {
        ...state,
        done: true,
        progress: undefined,
        text: event.response || state.text,
      };
    case "error":
      return {
        ...state,
        done: true,
        error: event.message,
        progress: undefined,
      };
    default:
      return state;
  }
}

function toolLabel(name: string): string {
  return TOOL_PROGRESS_LABELS[name] ?? "情報を確認";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
