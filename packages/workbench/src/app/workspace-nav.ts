export type WorkspaceNavId =
  | "chat"
  | "soap-studio"
  | "voice-capture"
  | "knowledge-review"
  | "training"
  | "admin";

export type WorkspaceNavItem = {
  id: WorkspaceNavId;
  label: string;
};

export const WORKSPACE_NAV_ITEMS: readonly WorkspaceNavItem[] = [
  { id: "chat", label: "Chat" },
  { id: "soap-studio", label: "SOAP Studio" },
  { id: "voice-capture", label: "Voice Capture" },
  { id: "knowledge-review", label: "Knowledge Review" },
  { id: "training", label: "Training" },
  { id: "admin", label: "Admin" },
];

export const DEFAULT_WORKSPACE_NAV_ID: WorkspaceNavId = "soap-studio";

const DEFAULT_CHAT_UI_URL = "http://localhost:4173";

/** Chat ナビ項目を押した時に別タブで開く Chat UI の origin（`VITE_CHAT_UI_URL` 未設定時は local dev の既定値）。 */
export function resolveChatUiUrl(
  env: Record<string, string | undefined> = import.meta.env,
): string {
  const configured = env.VITE_CHAT_UI_URL?.trim();
  return configured || DEFAULT_CHAT_UI_URL;
}

export const CONTEXT_INSPECTOR_ITEMS: readonly string[] = [
  "ケース",
  "根拠",
  "不足",
  "知識",
  "履歴",
];
