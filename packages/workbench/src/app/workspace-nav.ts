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

export const CONTEXT_INSPECTOR_ITEMS: readonly string[] = [
  "ケース",
  "根拠",
  "不足",
  "知識",
  "履歴",
];
