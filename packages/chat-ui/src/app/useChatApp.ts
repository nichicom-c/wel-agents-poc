import {
  type KeyboardEventHandler,
  type SubmitEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  authenticatedAuthState,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  initialAuthStateFromEnv,
} from "../features/auth/index.ts";
import {
  type AgentStreamEvent,
  type AssistantProgressState,
  parseAgentEvent,
  requestWebSocketUrl,
} from "../features/chat-stream/index.ts";
import { type DevInfo, requestDevInfo } from "../features/dev-info/index.ts";
import {
  isKnowledgeBaseDomain,
  type KnowledgeBaseDomain,
} from "../features/knowledge-base-detail/index.ts";
import {
  type ChatSessionRecord,
  createConversationId,
  ensureSession,
  isAgentCoreMemoryNotConfiguredError,
  loadSessionHistory,
  mergeRemoteSessions,
  messagesForSession,
  normalizeConversationId,
  requestAwsSessions,
  type SessionMessage,
  saveSessionHistory,
} from "../features/session-history/index.ts";
import {
  applySessionTurnEvent,
  failSessionTurn,
  isSessionBusy,
  type SessionTurnModel,
  startSessionTurn,
} from "./session-turns.ts";

const CONVERSATION_STORAGE_NAME = "wel-agents-chat-conversation-id";

type DevInfoStatus = "error" | "idle" | "loading" | "ready";
type SessionsStatus = "error" | "idle" | "loading" | "ready";
type StatusState = "busy" | "error" | "idle" | "ready";
type CompactPanel = "environment" | "sessions" | null;
type MainView =
  | { type: "chat" }
  | { domain: KnowledgeBaseDomain; type: "knowledge-base" };

type ChatMessage = SessionMessage;
type ActiveAssistantProgress = {
  messageId: string;
  progress: AssistantProgressState;
};
type InitialChatState = {
  conversationId: string;
  sessions: ChatSessionRecord[];
};

function getInitialChatState(): InitialChatState {
  const storedSessions = loadSessionHistory();
  const storedConversationId =
    localStorage.getItem(CONVERSATION_STORAGE_NAME)?.trim() || "";
  const conversationId =
    storedConversationId ||
    storedSessions[0]?.conversationId ||
    createConversationId();
  const sessions = ensureSession(storedSessions, conversationId);
  return {
    conversationId,
    sessions,
  };
}

function createMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
  };
}

export function mainViewFromHash(hash: string): MainView {
  const match = /^#knowledge-bases\/([^/?#]+)$/.exec(hash);
  if (!match?.[1]) {
    return { type: "chat" };
  }

  let domain = "";
  try {
    domain = decodeURIComponent(match[1]);
  } catch {
    return { type: "chat" };
  }

  return isKnowledgeBaseDomain(domain)
    ? { domain, type: "knowledge-base" }
    : { type: "chat" };
}

function currentMainView(): MainView {
  return typeof window === "undefined"
    ? { type: "chat" }
    : mainViewFromHash(window.location.hash);
}

export function useChatApp() {
  const [initialChatState] = useState(getInitialChatState);
  const [conversationId, setConversationId] = useState(
    initialChatState.conversationId,
  );
  const [conversationIdInput, setConversationIdInput] = useState(
    initialChatState.conversationId,
  );
  const [authState, setAuthState] = useState(() =>
    initialAuthStateFromEnv(import.meta.env),
  );
  const [authError, setAuthError] = useState("");
  const [devInfo, setDevInfo] = useState<DevInfo | null>(null);
  const [devInfoError, setDevInfoError] = useState("");
  const [devInfoStatus, setDevInfoStatus] = useState<DevInfoStatus>("idle");
  const [chatModel, setChatModel] = useState<SessionTurnModel>({
    sessions: initialChatState.sessions,
    turns: {},
  });
  const [prompt, setPrompt] = useState("");
  const [sessionStatuses, setSessionStatuses] = useState<
    Record<string, StatusState>
  >({});
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsStatus, setSessionsStatus] = useState<SessionsStatus>("idle");
  const [sessionsTruncated, setSessionsTruncated] = useState(false);
  const [compactPanel, setCompactPanel] = useState<CompactPanel>(null);
  const [mainView, setMainView] = useState<MainView>(currentMainView);
  const [isSessionPanelCollapsed, setIsSessionPanelCollapsed] = useState(false);
  const [isEnvironmentPanelCollapsed, setIsEnvironmentPanelCollapsed] =
    useState(false);
  const devInfoRequestRef = useRef(0);
  const sessionsRequestRef = useRef(0);
  const conversationIdRef = useRef(conversationId);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const socketRefs = useRef(new Map<string, WebSocket>());
  const sessionRecords = chatModel.sessions;
  const sessions = sessionRecords;
  const sessionTurns = chatModel.turns;
  const messages = messagesForSession(sessionRecords, conversationId);
  const activeTurn = sessionTurns[conversationId] ?? null;
  const activeAssistantProgress: ActiveAssistantProgress | null =
    activeTurn?.progress
      ? {
          messageId: activeTurn.assistantMessageId,
          progress: activeTurn.progress,
        }
      : null;
  const isBusy = isSessionBusy(sessionTurns, conversationId);
  const status: StatusState = isBusy
    ? "busy"
    : (sessionStatuses[conversationId] ?? "idle");
  const accessToken =
    authState.status === "authenticated" ? authState.accessToken : "";

  const updateSessions = useCallback(
    (updater: (current: ChatSessionRecord[]) => ChatSessionRecord[]) => {
      setChatModel((current) => ({
        ...current,
        sessions: updater(current.sessions),
      }));
    },
    [],
  );

  function setActiveConversationId(nextConversationId: string) {
    conversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
  }

  const closeAllSockets = useCallback((reason: string) => {
    for (const socket of socketRefs.current.values()) {
      socket.close(1000, reason);
    }
    socketRefs.current.clear();
  }, []);

  const loadDevInfo = useCallback(
    async (token = accessToken) => {
      if (!token) {
        setDevInfo(null);
        setDevInfoError("");
        setDevInfoStatus("idle");
        return;
      }

      const requestId = devInfoRequestRef.current + 1;
      devInfoRequestRef.current = requestId;
      setDevInfoError("");
      setDevInfoStatus("loading");

      try {
        const info = await requestDevInfo({
          accessToken: token,
          locationOrigin: window.location.origin,
        });

        if (devInfoRequestRef.current !== requestId) {
          return;
        }

        setDevInfo(info);
        setDevInfoStatus("ready");
      } catch (error) {
        if (devInfoRequestRef.current !== requestId) {
          return;
        }

        setDevInfoError(error instanceof Error ? error.message : String(error));
        setDevInfoStatus("error");
      }
    },
    [accessToken],
  );

  const refreshAwsSessions = useCallback(
    async (token = accessToken) => {
      if (!token) {
        setSessionsError("");
        setSessionsStatus("idle");
        setSessionsTruncated(false);
        return;
      }

      const requestId = sessionsRequestRef.current + 1;
      sessionsRequestRef.current = requestId;
      setSessionsError("");
      setSessionsStatus("loading");

      try {
        const result = await requestAwsSessions({ accessToken: token });

        if (sessionsRequestRef.current !== requestId) {
          return;
        }

        updateSessions((current) =>
          mergeRemoteSessions(current, result.sessions),
        );
        setSessionsTruncated(result.truncated);
        setSessionsStatus("ready");
      } catch (error) {
        if (sessionsRequestRef.current !== requestId) {
          return;
        }

        if (isAgentCoreMemoryNotConfiguredError(error)) {
          setSessionsError("");
          setSessionsTruncated(false);
          setSessionsStatus("idle");
          return;
        }

        setSessionsError(
          error instanceof Error ? error.message : String(error),
        );
        setSessionsStatus("error");
      }
    },
    [accessToken, updateSessions],
  );

  useEffect(() => {
    conversationIdRef.current = conversationId;
    localStorage.setItem(CONVERSATION_STORAGE_NAME, conversationId);
  }, [conversationId]);

  useEffect(() => {
    setConversationIdInput(conversationId);
  }, [conversationId]);

  useEffect(() => {
    saveSessionHistory(sessionRecords);
  }, [sessionRecords]);

  useEffect(() => {
    if (!accessToken) {
      setDevInfo(null);
      setDevInfoError("");
      setDevInfoStatus("idle");
      return;
    }

    void loadDevInfo(accessToken);
  }, [accessToken, loadDevInfo]);

  useEffect(() => {
    if (!accessToken) {
      setSessionsError("");
      setSessionsStatus("idle");
      setSessionsTruncated(false);
      return;
    }

    void refreshAwsSessions(accessToken);
  }, [accessToken, refreshAwsSessions]);

  useEffect(() => {
    if (authState.mode !== "jwt" || authState.status !== "unauthenticated") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.trim();
    const callbackState = params.get("state")?.trim();

    if (!code || !callbackState) {
      return;
    }

    let cancelled = false;
    void exchangeAuthorizationCode({
      code,
      config: authState.config,
      state: callbackState,
    })
      .then((token) => {
        if (cancelled) {
          return;
        }
        setAuthState(authenticatedAuthState(authState.config, token));
        setAuthError("");
        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}${window.location.hash}`,
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authState]);

  useEffect(() => {
    const thread = threadRef.current;

    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  });

  useEffect(() => {
    return () => {
      closeAllSockets("unmount");
    };
  }, [closeAllSockets]);

  useEffect(() => {
    if (!compactPanel) {
      return;
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setCompactPanel(null);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [compactPanel]);

  useEffect(() => {
    function syncMainViewFromLocation() {
      setMainView(currentMainView());
    }

    window.addEventListener("hashchange", syncMainViewFromLocation);
    window.addEventListener("popstate", syncMainViewFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncMainViewFromLocation);
      window.removeEventListener("popstate", syncMainViewFromLocation);
    };
  }, []);

  function failAllSessionTurns(message: string) {
    const failedConversationIds = Object.keys(sessionTurns);
    if (failedConversationIds.length === 0) {
      return;
    }

    closeAllSockets(message);
    setChatModel((current) =>
      Object.keys(current.turns).reduce(
        (model, turnConversationId) =>
          failSessionTurn(model, {
            conversationId: turnConversationId,
            message,
          }),
        current,
      ),
    );
    setSessionStatuses((current) => ({
      ...current,
      ...Object.fromEntries(
        failedConversationIds.map((turnConversationId) => [
          turnConversationId,
          "error" satisfies StatusState,
        ]),
      ),
    }));
  }

  async function runWebSocketTurn(
    turnConversationId: string,
    webSocketUrl: string,
    message: string,
    onEvent: (event: AgentStreamEvent) => void,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(webSocketUrl);
      let settled = false;
      socketRefs.current.set(turnConversationId, socket);

      function finish(error?: Error) {
        if (settled) {
          return;
        }
        settled = true;
        if (socketRefs.current.get(turnConversationId) === socket) {
          socketRefs.current.delete(turnConversationId);
        }
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "user_message",
            message,
            conversationId: turnConversationId,
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        try {
          if (typeof event.data !== "string") {
            throw new Error("unsupported WebSocket message");
          }
          const agentEvent = parseAgentEvent(event.data);
          onEvent(agentEvent);

          if (agentEvent.type === "final") {
            socket.close(1000, "complete");
            finish();
          } else if (agentEvent.type === "error") {
            socket.close(1000, "error");
            finish(new Error(agentEvent.message));
          }
        } catch (error) {
          socket.close(1008, "invalid message");
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });

      socket.addEventListener("error", () => {
        finish(new Error("WebSocket connection failed"));
      });

      socket.addEventListener("close", () => {
        finish(new Error("WebSocket closed before final response"));
      });
    });
  }

  async function sendPrompt(
    turnConversationId: string,
    message: string,
    token: string,
  ) {
    try {
      if (!token) {
        throw new Error("access token is required");
      }

      const { webSocketUrl } = await requestWebSocketUrl({
        accessToken: token,
        conversationId: turnConversationId,
      });

      await runWebSocketTurn(
        turnConversationId,
        webSocketUrl,
        message,
        (event) => {
          setChatModel((current) =>
            applySessionTurnEvent(current, {
              conversationId: turnConversationId,
              event,
            }),
          );
        },
      );
      setSessionStatuses((current) => ({
        ...current,
        [turnConversationId]: "ready",
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setChatModel((current) =>
        failSessionTurn(current, {
          conversationId: turnConversationId,
          message: errorMessage,
        }),
      );
      setSessionStatuses((current) => ({
        ...current,
        [turnConversationId]: "error",
      }));
    } finally {
      if (conversationIdRef.current === turnConversationId) {
        inputRef.current?.focus();
      }
    }
  }

  function submitCurrentPrompt() {
    const message = prompt.trim();

    if (!message || isBusy || !accessToken) {
      return;
    }

    const turnConversationId = conversationId;
    const token = accessToken;
    const assistantMessage = createMessage("assistant", "");
    const userMessage = createMessage("user", message);
    setChatModel((current) =>
      startSessionTurn(current, {
        assistantMessage,
        conversationId: turnConversationId,
        startedAt: new Date().toISOString(),
        userMessage,
      }),
    );
    setSessionStatuses((current) => ({
      ...current,
      [turnConversationId]: "busy",
    }));
    setPrompt("");
    void sendPrompt(turnConversationId, message, token);
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    submitCurrentPrompt();
  };

  const handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    submitCurrentPrompt();
  };

  function handleConversationIdChange(value: string) {
    const nextConversationId = normalizeConversationId(value);
    const nextSessions = ensureSession(sessionRecords, nextConversationId);
    setActiveConversationId(nextConversationId);
    updateSessions(() => nextSessions);
  }

  function startNewSession() {
    const nextConversationId = createConversationId();
    const nextSessions = ensureSession(sessionRecords, nextConversationId);
    setActiveConversationId(nextConversationId);
    updateSessions(() => nextSessions);
    inputRef.current?.focus();
  }

  function startNewSessionFromRail() {
    startNewSession();
    setCompactPanel(null);
  }

  function selectSession(nextConversationId: string) {
    if (nextConversationId === conversationId) {
      return;
    }

    setActiveConversationId(nextConversationId);
    inputRef.current?.focus();
  }

  function selectSessionFromRail(nextConversationId: string) {
    selectSession(nextConversationId);
    setCompactPanel(null);
  }

  function openChatView() {
    setMainView({ type: "chat" });
    setCompactPanel(null);
    window.history.pushState(
      {},
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
    inputRef.current?.focus();
  }

  function openKnowledgeBaseDetail(domain: KnowledgeBaseDomain) {
    setMainView({ domain, type: "knowledge-base" });
    setCompactPanel(null);
    window.history.pushState(
      {},
      document.title,
      `#knowledge-bases/${encodeURIComponent(domain)}`,
    );
  }

  async function handleSignIn() {
    if (authState.mode !== "jwt") {
      return;
    }

    try {
      setAuthError("");
      const request = await createAuthorizationRequest(authState.config);
      window.location.assign(request.url);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleSignOut() {
    if (authState.mode !== "jwt") {
      return;
    }

    failAllSessionTurns("認証が解除されました");
    setAuthState({
      config: authState.config,
      mode: "jwt",
      status: "unauthenticated",
    });
    setAuthError("");
  }

  return {
    accessToken,
    activeAssistantProgress,
    authError,
    authState,
    closeCompactPanel: () => setCompactPanel(null),
    compactPanel,
    conversationId,
    conversationIdInput,
    devInfo,
    devInfoError,
    devInfoStatus,
    handleComposerKeyDown,
    handleConversationIdChange,
    handleSignIn,
    handleSignOut,
    handleSubmit,
    inputRef,
    isEnvironmentPanelCollapsed,
    isBusy,
    isSessionPanelCollapsed,
    mainView,
    messages,
    openChatView,
    openEnvironmentPanel: () => {
      setIsEnvironmentPanelCollapsed(false);
      setCompactPanel("environment");
    },
    openKnowledgeBaseDetail,
    openSessionPanel: () => {
      setIsSessionPanelCollapsed(false);
      setCompactPanel("sessions");
    },
    prompt,
    refreshAwsSessions,
    refreshDevInfo: loadDevInfo,
    selectSessionFromRail,
    sessionTurns,
    sessions,
    sessionsError,
    sessionsStatus,
    sessionsTruncated,
    setConversationIdInput,
    setPrompt,
    startNewSessionFromRail,
    status,
    threadRef,
    toggleEnvironmentPanelCollapsed: () =>
      setIsEnvironmentPanelCollapsed((current) => !current),
    toggleSessionPanelCollapsed: () =>
      setIsSessionPanelCollapsed((current) => !current),
  };
}
