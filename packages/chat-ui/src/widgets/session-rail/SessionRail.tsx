import type { ChatSessionRecord } from "../../features/session-history/index.ts";
import { Icon } from "../../shared/ui/Icon.tsx";

type SessionsStatus = "error" | "idle" | "loading" | "ready";

type SessionRailProps = {
  activeConversationId: string;
  canRefreshSessions: boolean;
  isCollapsed: boolean;
  isOverlayOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onRefreshSessions: () => void;
  onSelectSession: (conversationId: string) => void;
  onToggleCollapsed: () => void;
  processingConversationIds: readonly string[];
  sessions: readonly ChatSessionRecord[];
  sessionsError: string;
  sessionsStatus: SessionsStatus;
  sessionsTruncated: boolean;
};

const sessionTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
});

export function SessionRail({
  activeConversationId,
  canRefreshSessions,
  isCollapsed,
  isOverlayOpen,
  onClose,
  onNewSession,
  onRefreshSessions,
  onSelectSession,
  onToggleCollapsed,
  processingConversationIds,
  sessionsError,
  sessionsStatus,
  sessionsTruncated,
  sessions,
}: SessionRailProps) {
  const processingConversationIdSet = new Set(processingConversationIds);
  return (
    <aside
      className="session-panel"
      id="session-panel"
      aria-label="セッション一覧"
      data-collapsed={isCollapsed}
      data-overlay-open={isOverlayOpen}
    >
      {isCollapsed ? (
        <>
          <div className="panel-collapsed-slot panel-collapsed-slot-start">
            <button
              className="panel-reopen-button"
              type="button"
              aria-controls="session-panel-body"
              aria-expanded={false}
              aria-label="会話パネルを開く"
              title="会話パネルを開く"
              onClick={onToggleCollapsed}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
          <div id="session-panel-body" hidden />
        </>
      ) : (
        <>
          <div className="session-panel-header">
            <div>
              <p className="eyebrow">Sessions</p>
              <h2>会話</h2>
            </div>
            <div className="session-actions">
              <button
                className="session-action-button"
                type="button"
                aria-label="AWS セッションを更新"
                title="AWS セッションを更新"
                disabled={!canRefreshSessions || sessionsStatus === "loading"}
                onClick={onRefreshSessions}
              >
                <Icon name="refresh" />
              </button>
              <button
                className="new-session-button"
                type="button"
                aria-label="新規セッション"
                title="新規セッション"
                onClick={onNewSession}
              >
                <Icon name="add" />
              </button>
              <button
                className="panel-collapse-button"
                type="button"
                aria-controls="session-panel-body"
                aria-expanded={true}
                aria-label="会話パネルを閉じる"
                title="会話パネルを閉じる"
                onClick={onToggleCollapsed}
              >
                <Icon name="chevron_left" />
              </button>
              <button
                className="panel-close-button"
                type="button"
                aria-label="会話パネルを閉じる"
                title="会話パネルを閉じる"
                onClick={onClose}
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
          <div className="session-panel-body" id="session-panel-body">
            {sessionsError ? (
              <p className="session-status session-status-error">
                {sessionsError}
              </p>
            ) : sessionsTruncated ? (
              <p className="session-status">
                AWS session は一部のみ表示しています
              </p>
            ) : null}
            <ul className="session-list">
              {sessions.map((session) => {
                const isActive =
                  session.conversationId === activeConversationId;
                const isProcessing = processingConversationIdSet.has(
                  session.conversationId,
                );
                return (
                  <li key={session.conversationId}>
                    <button
                      className="session-item"
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      data-active={isActive}
                      data-processing={isProcessing}
                      disabled={isActive}
                      onClick={() => onSelectSession(session.conversationId)}
                    >
                      <span className="session-title-row">
                        <span className="session-title">{session.title}</span>
                        {isProcessing ? (
                          <span className="session-processing-badge">
                            処理中
                          </span>
                        ) : null}
                      </span>
                      <span className="session-preview">{session.preview}</span>
                      <span className="session-meta">
                        <span>{formatSessionTime(session.updatedAt)}</span>
                        <span>{session.messageCount}件</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </aside>
  );
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--"
    : sessionTimeFormatter.format(date);
}
