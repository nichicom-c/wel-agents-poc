import type { KeyboardEventHandler, Ref, SubmitEventHandler } from "react";

import {
  type AssistantProgressState,
  MessageMarkdown,
} from "../../features/chat-stream/index.ts";
import type { SessionMessage } from "../../features/session-history/index.ts";
import { Icon } from "../../shared/ui/Icon.tsx";
import { AgentProgressIndicator } from "./AgentProgressIndicator.tsx";
import { ThinkingIndicator } from "./ThinkingIndicator.tsx";

type ChatSurfaceProps = {
  activeAssistantProgress: {
    messageId: string;
    progress: AssistantProgressState;
  } | null;
  canSend: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  isBusy: boolean;
  isEnvironmentPanelOpen: boolean;
  isSessionPanelOpen: boolean;
  messages: readonly SessionMessage[];
  onComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onOpenEnvironmentPanel: () => void;
  onOpenSessionPanel: () => void;
  onPromptChange: (value: string) => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  prompt: string;
  threadRef: Ref<HTMLDivElement>;
};

export function ChatSurface({
  activeAssistantProgress,
  canSend,
  inputRef,
  isBusy,
  isEnvironmentPanelOpen,
  isSessionPanelOpen,
  messages,
  onComposerKeyDown,
  onOpenEnvironmentPanel,
  onOpenSessionPanel,
  onPromptChange,
  onSubmit,
  prompt,
  threadRef,
}: ChatSurfaceProps) {
  return (
    <section className="chat-surface" aria-label="チャット">
      <header className="topbar">
        <div className="mobile-panel-actions topbar-history-action">
          <button
            className="topbar-icon-button"
            type="button"
            aria-controls="session-panel"
            aria-expanded={isSessionPanelOpen}
            aria-label="会話履歴を開く"
            title="会話履歴を開く"
            onClick={onOpenSessionPanel}
          >
            <Icon name="menu" />
          </button>
        </div>
        <div className="topbar-title">
          <p className="eyebrow">WEL Agents PoC</p>
          <h1>AgentCore Chat</h1>
        </div>
        <div className="mobile-panel-actions topbar-actions">
          <button
            className="topbar-icon-button"
            type="button"
            aria-controls="environment-panel"
            aria-expanded={isEnvironmentPanelOpen}
            aria-label="環境情報を開く"
            title="環境情報を開く"
            onClick={onOpenEnvironmentPanel}
          >
            <Icon name="info" />
          </button>
        </div>
      </header>

      <div
        className="thread"
        ref={threadRef}
        aria-busy={isBusy}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="empty-thread">会話はまだありません</p>
        ) : (
          messages.map((message) => {
            const isLatestMessage = message.id === messages.at(-1)?.id;
            const isPendingAssistant =
              isBusy &&
              message.role === "assistant" &&
              !message.text &&
              isLatestMessage;
            const progress =
              isBusy &&
              message.role === "assistant" &&
              isLatestMessage &&
              activeAssistantProgress?.messageId === message.id
                ? activeAssistantProgress.progress
                : null;

            return (
              <article
                className={`message message-${message.role}`}
                key={message.id}
              >
                <span className="message-label">
                  {message.role === "user" ? "User" : "Agent"}
                </span>
                {progress ? (
                  <>
                    <AgentProgressIndicator progress={progress} />
                    {message.text ? (
                      <MessageMarkdown text={message.text} />
                    ) : null}
                  </>
                ) : isPendingAssistant ? (
                  <ThinkingIndicator />
                ) : message.role === "assistant" ? (
                  <MessageMarkdown text={message.text} />
                ) : (
                  <p>{message.text}</p>
                )}
              </article>
            );
          })
        )}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
          rows={1}
          autoComplete="off"
          placeholder="メッセージを入力"
          required
          disabled={isBusy}
        />
        <button
          className="send-button"
          type="submit"
          aria-label={isBusy ? "送信待機中" : "送信"}
          title={isBusy ? "送信待機中" : "送信"}
          disabled={!canSend}
        >
          <Icon name="arrow_upward" size={19} />
        </button>
      </form>
    </section>
  );
}
