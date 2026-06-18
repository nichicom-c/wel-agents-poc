export function ThinkingIndicator() {
  return (
    <p className="thinking-indicator" role="status" aria-live="polite">
      <span>Agent が回答を準備しています</span>
      <span className="thinking-dots" aria-hidden="true">
        <span>...</span>
      </span>
    </p>
  );
}
