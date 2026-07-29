export type {
  GapApiItem,
  GapQuestionApiItem,
  PostSoapGapsOptions,
  SoapGapsApiResult,
} from "./api/soap-gaps.ts";
export { postSoapGaps } from "./api/soap-gaps.ts";
export type {
  GapQuestionItem,
  GapQuestionStatus,
} from "./model/gap-questions.ts";
export {
  fromApiQuestions,
  markAnswered,
  markSkipped,
  withDraftAnswer,
  withDraftSkipReason,
} from "./model/gap-questions.ts";
export type { GapType } from "./model/gap-type.ts";
export { GAP_TYPES, gapTypeLabel, groupByGapType } from "./model/gap-type.ts";
