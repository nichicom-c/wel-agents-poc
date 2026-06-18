import type { AssistantProgressState } from "../../features/chat-stream/index.ts";

type AgentProgressIndicatorProps = {
  progress: AssistantProgressState;
};

export function AgentProgressIndicator({
  progress,
}: AgentProgressIndicatorProps) {
  return (
    <p
      className="agent-progress"
      data-tone={progress.tone}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="agent-progress-pulse" aria-hidden="true" />
      <span>{progress.label}</span>
    </p>
  );
}
