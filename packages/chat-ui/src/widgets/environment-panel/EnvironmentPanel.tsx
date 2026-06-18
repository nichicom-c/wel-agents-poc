import type { ChatAuthState } from "../../features/auth/index.ts";
import type { DevInfo, HealthStatus } from "../../features/dev-info/index.ts";
import type { KnowledgeBaseDomain } from "../../features/knowledge-base-detail/index.ts";
import { Icon } from "../../shared/ui/Icon.tsx";
import { EnvironmentRow, EnvironmentSection } from "./EnvironmentRow.tsx";

type DevInfoStatus = "error" | "idle" | "loading" | "ready";
type SessionsStatus = "error" | "idle" | "loading" | "ready";
type StatusState = "busy" | "error" | "idle" | "ready";

type EnvironmentPanelProps = {
  authError: string;
  authState: ChatAuthState;
  canRefreshDevInfo: boolean;
  conversationIdInput: string;
  devInfo: DevInfo | null;
  devInfoError: string;
  devInfoStatus: DevInfoStatus;
  isCollapsed: boolean;
  isOverlayOpen: boolean;
  onClose: () => void;
  onConversationIdBlur: (value: string) => void;
  onConversationIdInputChange: (value: string) => void;
  onOpenKnowledgeBase: (domain: KnowledgeBaseDomain) => void;
  onRefreshDevInfo: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleCollapsed: () => void;
  sessionsStatus: SessionsStatus;
  status: StatusState;
};

const statusLabels: Record<StatusState, string> = {
  busy: "考え中",
  error: "エラー",
  idle: "待機中",
  ready: "接続済み",
};

const sessionsStatusLabels: Record<SessionsStatus, string> = {
  error: "取得エラー",
  idle: "待機中",
  loading: "取得中",
  ready: "同期済み",
};

const devInfoStatusLabels: Record<DevInfoStatus, string> = {
  error: "取得エラー",
  idle: "未取得",
  loading: "取得中",
  ready: "取得済み",
};

export function EnvironmentPanel({
  authError,
  authState,
  canRefreshDevInfo,
  conversationIdInput,
  devInfo,
  devInfoError,
  devInfoStatus,
  isCollapsed,
  isOverlayOpen,
  onClose,
  onConversationIdBlur,
  onConversationIdInputChange,
  onOpenKnowledgeBase,
  onRefreshDevInfo,
  onSignIn,
  onSignOut,
  onToggleCollapsed,
  sessionsStatus,
  status,
}: EnvironmentPanelProps) {
  return (
    <aside
      className="side-panel environment-panel"
      id="environment-panel"
      aria-label="環境"
      data-collapsed={isCollapsed}
      data-overlay-open={isOverlayOpen}
    >
      {isCollapsed ? (
        <>
          <div className="panel-collapsed-slot panel-collapsed-slot-end">
            <button
              className="panel-reopen-button"
              type="button"
              aria-controls="environment-panel-body"
              aria-expanded={false}
              aria-label="環境パネルを開く"
              title="環境パネルを開く"
              onClick={onToggleCollapsed}
            >
              <Icon name="chevron_left" />
            </button>
          </div>
          <div id="environment-panel-body" hidden />
        </>
      ) : (
        <>
          <div className="environment-header">
            <div>
              <p className="eyebrow">Environment</p>
              <h2>環境</h2>
            </div>
            <div className="environment-header-actions">
              <button
                className="secondary-button environment-header-action"
                type="button"
                disabled={!canRefreshDevInfo || devInfoStatus === "loading"}
                onClick={onRefreshDevInfo}
              >
                <Icon name="refresh" size={17} />
                <span>{devInfoStatus === "loading" ? "更新中" : "更新"}</span>
              </button>
              <button
                className="panel-collapse-button"
                type="button"
                aria-controls="environment-panel-body"
                aria-expanded={true}
                aria-label="環境パネルを閉じる"
                title="環境パネルを閉じる"
                onClick={onToggleCollapsed}
              >
                <Icon name="chevron_right" />
              </button>
              <button
                className="panel-close-button"
                type="button"
                aria-label="環境パネルを閉じる"
                title="環境パネルを閉じる"
                onClick={onClose}
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
          <div className="environment-body" id="environment-panel-body">
            <EnvironmentSection title="変更">
              <div className="environment-row environment-row-stack">
                <label
                  className="environment-row-label"
                  htmlFor="conversation-id"
                >
                  Conversation ID
                </label>
                <input
                  className="environment-input"
                  id="conversation-id"
                  type="text"
                  spellCheck={false}
                  value={conversationIdInput}
                  onChange={(event) =>
                    onConversationIdInputChange(event.target.value)
                  }
                  onBlur={(event) => onConversationIdBlur(event.target.value)}
                />
              </div>
              <EnvironmentRow
                label="認証"
                value={authLabel(authState)}
                tone={
                  authState.mode === "dev" ||
                  authState.status === "authenticated"
                    ? "success"
                    : "warning"
                }
              />
              <EnvironmentRow
                label="モード"
                value={authState.mode === "dev" ? "local dev" : "jwt"}
              />
              {authState.mode === "jwt" ? (
                <div className="environment-action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={
                      authState.status === "authenticated"
                        ? onSignOut
                        : onSignIn
                    }
                  >
                    {authState.status === "authenticated"
                      ? "Sign out"
                      : "Sign in"}
                  </button>
                </div>
              ) : null}
              {authError ? <p className="panel-error">{authError}</p> : null}
            </EnvironmentSection>

            <EnvironmentSection title="進捗">
              <EnvironmentRow
                label="チャット"
                value={statusLabels[status]}
                tone={statusTone(status)}
              />
              <EnvironmentRow
                label="セッション"
                value={sessionsStatusLabels[sessionsStatus]}
                tone={statusTone(sessionsStatus)}
              />
              <EnvironmentRow
                label="Dev Info"
                value={devInfoStatusLabels[devInfoStatus]}
                tone={statusTone(devInfoStatus)}
              />
              <EnvironmentRow
                isCode
                label="Runtime"
                value={devInfo ? healthText(devInfo.runtime.health) : "未取得"}
              />
              <EnvironmentRow
                isCode
                label="BFF"
                value={devInfo ? healthText(devInfo.bff.health) : "未取得"}
              />
              {devInfoError ? (
                <p className="dev-info-error">{devInfoError}</p>
              ) : null}
            </EnvironmentSection>

            <EnvironmentSection title="情報源">
              <EnvironmentRow
                isCode
                label="AWS"
                value={
                  devInfo
                    ? `${valueOrPlaceholder(devInfo.aws.accountId)} / ${valueOrPlaceholder(devInfo.aws.region)}`
                    : "未取得"
                }
              />
              <EnvironmentRow
                isCode
                label="Runtime ARN"
                value={
                  devInfo ? valueOrPlaceholder(devInfo.runtime.arn) : "未取得"
                }
              />
              <EnvironmentRow
                isCode
                label="Endpoint"
                value={
                  devInfo
                    ? valueOrPlaceholder(devInfo.runtime.endpointName)
                    : "未取得"
                }
              />
              <EnvironmentRow
                isCode
                label="Memory ID"
                value={
                  devInfo ? valueOrPlaceholder(devInfo.memory.id) : "未取得"
                }
              />
              <EnvironmentRow
                isCode
                label="KB database"
                value={knowledgeBaseValue(devInfo, "database")}
                onClick={knowledgeBaseClickHandler(
                  devInfo,
                  "database",
                  onOpenKnowledgeBase,
                )}
                actionLabel="KB database を開く"
              />
              <EnvironmentRow
                isCode
                label="KB document"
                value={knowledgeBaseValue(devInfo, "document")}
                onClick={knowledgeBaseClickHandler(
                  devInfo,
                  "document",
                  onOpenKnowledgeBase,
                )}
                actionLabel="KB document を開く"
              />
              <EnvironmentRow
                isCode
                label="KB law"
                value={knowledgeBaseValue(devInfo, "law")}
                onClick={knowledgeBaseClickHandler(
                  devInfo,
                  "law",
                  onOpenKnowledgeBase,
                )}
                actionLabel="KB law を開く"
              />
              <EnvironmentRow
                isCode
                label="KB medical"
                value={knowledgeBaseValue(devInfo, "medical_care_law")}
                onClick={knowledgeBaseClickHandler(
                  devInfo,
                  "medical_care_law",
                  onOpenKnowledgeBase,
                )}
                actionLabel="KB medical を開く"
              />
              <EnvironmentRow
                isCode
                label="KB support"
                value={knowledgeBaseValue(devInfo, "support_activity")}
                onClick={knowledgeBaseClickHandler(
                  devInfo,
                  "support_activity",
                  onOpenKnowledgeBase,
                )}
                actionLabel="KB support を開く"
              />
              <EnvironmentRow
                isCode
                label="Chat UI"
                value={
                  devInfo ? valueOrPlaceholder(devInfo.chatUi.origin) : "未取得"
                }
              />
              <EnvironmentRow
                isCode
                label="Generated"
                value={
                  devInfo ? valueOrPlaceholder(devInfo.generatedAt) : "未取得"
                }
              />
            </EnvironmentSection>
          </div>
        </>
      )}
    </aside>
  );
}

function authLabel(authState: ChatAuthState): string {
  if (authState.mode === "dev") {
    return "Local dev";
  }

  return authState.status === "authenticated" ? "認証済み" : "未認証";
}

function healthText(health: HealthStatus): string {
  switch (health.status) {
    case "ok":
      return `ok / ${health.checkedAt}`;
    case "error":
      return `error / ${health.message} / ${health.checkedAt}`;
    case "not_checked":
      return `not_checked / ${health.reason}`;
  }
}

function valueOrPlaceholder(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || "未取得";
}

function knowledgeBaseValue(
  devInfo: DevInfo | null,
  domain: KnowledgeBaseDomain,
): string {
  return devInfo
    ? valueOrPlaceholder(devInfo.knowledgeBases[domain])
    : "未取得";
}

function knowledgeBaseClickHandler(
  devInfo: DevInfo | null,
  domain: KnowledgeBaseDomain,
  onOpenKnowledgeBase: (domain: KnowledgeBaseDomain) => void,
): (() => void) | undefined {
  const value = devInfo?.knowledgeBases[domain]?.trim() ?? "";
  if (!value || value === "not_configured") {
    return undefined;
  }

  return () => onOpenKnowledgeBase(domain);
}

function statusTone(
  value: string,
): "danger" | "default" | "success" | "warning" {
  if (value === "error") {
    return "danger";
  }

  if (value === "busy" || value === "loading") {
    return "warning";
  }

  if (value === "ready") {
    return "success";
  }

  return "default";
}
