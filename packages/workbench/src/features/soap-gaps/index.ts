export type {
  GapApiItem,
  PostSoapGapsOptions,
  SoapGapsApiResult,
} from "./api/soap-gaps.ts";
export { postSoapGaps } from "./api/soap-gaps.ts";
export type {
  PostSoapGapsChatOptions,
  SoapGapsChatApiResult,
} from "./api/soap-gaps-chat.ts";
export { postSoapGapsChat } from "./api/soap-gaps-chat.ts";
export type { ChatMessage, ChatMessageRole } from "./model/chat-thread.ts";
export {
  appendAssistantMessage,
  appendUserMessage,
  latestAssistantSuggestions,
} from "./model/chat-thread.ts";
export type { GapType } from "./model/gap-type.ts";
export { GAP_TYPES, gapTypeLabel, groupByGapType } from "./model/gap-type.ts";
