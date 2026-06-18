import { ChatSurface } from "../widgets/chat-surface/index.ts";
import { EnvironmentPanel } from "../widgets/environment-panel/index.ts";
import { KnowledgeBaseDetailPage } from "../widgets/knowledge-base-detail/index.ts";
import { SessionRail } from "../widgets/session-rail/index.ts";
import { useChatApp } from "./useChatApp.ts";

export function App() {
  const chat = useChatApp();

  return (
    <main
      className="app-shell"
      data-environment-panel-collapsed={
        chat.isEnvironmentPanelCollapsed ? "true" : "false"
      }
      data-session-panel-collapsed={
        chat.isSessionPanelCollapsed ? "true" : "false"
      }
    >
      {chat.compactPanel ? (
        <button
          className="panel-backdrop"
          type="button"
          aria-label="パネルを閉じる"
          onClick={chat.closeCompactPanel}
        />
      ) : null}
      <SessionRail
        activeConversationId={chat.conversationId}
        canRefreshSessions={Boolean(chat.accessToken)}
        isCollapsed={chat.isSessionPanelCollapsed}
        isOverlayOpen={chat.compactPanel === "sessions"}
        onClose={chat.closeCompactPanel}
        onNewSession={chat.startNewSessionFromRail}
        onRefreshSessions={() => void chat.refreshAwsSessions()}
        onSelectSession={chat.selectSessionFromRail}
        onToggleCollapsed={chat.toggleSessionPanelCollapsed}
        processingConversationIds={Object.keys(chat.sessionTurns)}
        sessionsError={chat.sessionsError}
        sessionsStatus={chat.sessionsStatus}
        sessionsTruncated={chat.sessionsTruncated}
        sessions={chat.sessions}
      />
      {chat.mainView.type === "knowledge-base" ? (
        <KnowledgeBaseDetailPage
          accessToken={chat.accessToken}
          domain={chat.mainView.domain}
          isEnvironmentPanelOpen={chat.compactPanel === "environment"}
          isSessionPanelOpen={chat.compactPanel === "sessions"}
          onBack={chat.openChatView}
          onOpenEnvironmentPanel={chat.openEnvironmentPanel}
          onOpenSessionPanel={chat.openSessionPanel}
        />
      ) : (
        <ChatSurface
          activeAssistantProgress={chat.activeAssistantProgress}
          canSend={
            !chat.isBusy &&
            Boolean(chat.prompt.trim()) &&
            Boolean(chat.accessToken)
          }
          inputRef={chat.inputRef}
          isBusy={chat.isBusy}
          isEnvironmentPanelOpen={chat.compactPanel === "environment"}
          isSessionPanelOpen={chat.compactPanel === "sessions"}
          messages={chat.messages}
          onComposerKeyDown={chat.handleComposerKeyDown}
          onOpenEnvironmentPanel={chat.openEnvironmentPanel}
          onOpenSessionPanel={chat.openSessionPanel}
          onPromptChange={chat.setPrompt}
          onSubmit={chat.handleSubmit}
          prompt={chat.prompt}
          threadRef={chat.threadRef}
        />
      )}
      <EnvironmentPanel
        authError={chat.authError}
        authState={chat.authState}
        canRefreshDevInfo={Boolean(chat.accessToken)}
        conversationIdInput={chat.conversationIdInput}
        devInfo={chat.devInfo}
        devInfoError={chat.devInfoError}
        devInfoStatus={chat.devInfoStatus}
        isCollapsed={chat.isEnvironmentPanelCollapsed}
        isOverlayOpen={chat.compactPanel === "environment"}
        onClose={chat.closeCompactPanel}
        onConversationIdBlur={chat.handleConversationIdChange}
        onConversationIdInputChange={chat.setConversationIdInput}
        onOpenKnowledgeBase={chat.openKnowledgeBaseDetail}
        onRefreshDevInfo={() => void chat.refreshDevInfo()}
        onSignIn={() => void chat.handleSignIn()}
        onSignOut={chat.handleSignOut}
        onToggleCollapsed={chat.toggleEnvironmentPanelCollapsed}
        sessionsStatus={chat.sessionsStatus}
        status={chat.status}
      />
    </main>
  );
}
