/**
 * 分野・学習テーマ・難易度は issue #10 でマスタ管理する想定の値だが、issue #10 が未着手のため
 * Knowledge Review（issue #8）を dummy データで先行実装する間はここに固定値として持つ。
 * 将来 issue #10 の管理画面 / API に置き換える際は、このモジュールを差し替えるだけで済むようにする。
 */

export type TagOption = {
  id: string;
  label: string;
};

export const SPECIALTIES: readonly TagOption[] = [
  { id: "maternal-child", label: "母子保健" },
  { id: "elderly-care", label: "高齢者福祉" },
  { id: "mental-health", label: "精神保健" },
  { id: "public-health", label: "地域保健" },
];

export const LEARNING_THEMES: readonly TagOption[] = [
  { id: "assessment-basics", label: "アセスメントの基本" },
  { id: "support-planning", label: "支援方針の立案" },
  { id: "documentation", label: "記録表現" },
  { id: "risk-detection", label: "リスクの早期発見" },
];

export const DIFFICULTY_LEVELS: readonly TagOption[] = [
  { id: "beginner", label: "初級" },
  { id: "intermediate", label: "中級" },
  { id: "advanced", label: "上級" },
];

export function tagLabel(options: readonly TagOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}
