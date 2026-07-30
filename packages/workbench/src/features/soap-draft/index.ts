export type {
  PostSoapDraftOptions,
  SoapDraftApiCandidate,
  SoapDraftApiResult,
} from "./api/soap-draft.ts";
export { postSoapDraft } from "./api/soap-draft.ts";
export type { SoapRecordType } from "./model/record-type.ts";
export {
  isSoapRecordType,
  SOAP_RECORD_TYPES,
  soapRecordTypeLabel,
} from "./model/record-type.ts";
export type { ReflectionSelections } from "./model/reflection-selections.ts";
export {
  buildReflectionSelections,
  toggleReflectionSelection,
} from "./model/reflection-selections.ts";
export type {
  ConfidenceTier,
  SoapCandidateStatus,
  SoapCategory,
  SoapDraftCandidate,
} from "./model/soap-draft-candidates.ts";
export {
  addManualCandidate,
  confidenceTier,
  fromApiCandidates,
  groupByCategory,
  SOAP_CATEGORIES,
  withEditedText,
  withStatus,
} from "./model/soap-draft-candidates.ts";
