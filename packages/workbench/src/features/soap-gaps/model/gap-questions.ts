import type { GapQuestionApiItem } from "../api/soap-gaps.ts";

/**
 * 質問への対応状況。回答/スキップは session-local な UI 状態であり、正式記録への
 * 自動保存は行わない（issue #5 の Out of Scope を踏襲）。
 */
export type GapQuestionStatus = "pending" | "answered" | "skipped";

/**
 * `answerText` / `skipReason` は「入力中の下書き」と「確定した回答/理由」を兼ねる。
 * 入力のたびに更新し、対応するボタン押下でだけ status を変える。
 */
export type GapQuestionItem = GapQuestionApiItem & {
  id: string;
  status: GapQuestionStatus;
  answerText: string;
  skipReason: string;
};

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `gap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function fromApiQuestions(
  questions: GapQuestionApiItem[],
): GapQuestionItem[] {
  return questions.map((question) => ({
    ...question,
    id: createId(),
    status: "pending",
    answerText: "",
    skipReason: "",
  }));
}

export function withDraftAnswer(
  items: GapQuestionItem[],
  id: string,
  answerText: string,
): GapQuestionItem[] {
  return items.map((item) => (item.id === id ? { ...item, answerText } : item));
}

export function withDraftSkipReason(
  items: GapQuestionItem[],
  id: string,
  skipReason: string,
): GapQuestionItem[] {
  return items.map((item) => (item.id === id ? { ...item, skipReason } : item));
}

export function markAnswered(
  items: GapQuestionItem[],
  id: string,
): GapQuestionItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, status: "answered" } : item,
  );
}

export function markSkipped(
  items: GapQuestionItem[],
  id: string,
): GapQuestionItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, status: "skipped" } : item,
  );
}
