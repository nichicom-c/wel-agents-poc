export type WorkspaceNavId =
  | "chat"
  | "soap-studio"
  | "voice-capture"
  | "knowledge-review"
  | "training";

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
];

export const DEFAULT_WORKSPACE_NAV_ID: WorkspaceNavId = "soap-studio";

export type SoapStudioCard = {
  id: string;
  accent: "blue" | "teal" | "orange" | "purple";
  title: string;
  description: string;
};

export const SOAP_STUDIO_CARDS: readonly SoapStudioCard[] = [
  {
    id: "input-material",
    accent: "blue",
    title: "入力素材",
    description: "テキスト、編集済み transcript、会議メモを受け取る。",
  },
  {
    id: "soap-draft",
    accent: "teal",
    title: "SOAP 下書き",
    description: "S/O/A/P/未分類、根拠原文、信頼度を確認する。",
  },
  {
    id: "gap-check",
    accent: "orange",
    title: "不足確認",
    description: "不足、曖昧、矛盾、根拠不足を質問に変える。",
  },
  {
    id: "reflection-candidates",
    accent: "purple",
    title: "反映候補",
    description: "支援実績、汎用記録、会議、サマリーへ広げる。",
  },
];

export const CONTEXT_INSPECTOR_ITEMS: readonly string[] = [
  "ケース",
  "根拠",
  "不足",
  "知識",
  "履歴",
];
