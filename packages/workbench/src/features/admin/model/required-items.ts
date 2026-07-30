import type { SoapRecordType } from "../../soap-draft/index.ts";

export const REQUIREMENT_LEVELS = ["required", "recommended"] as const;

export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

const REQUIREMENT_LEVEL_LABELS: Record<RequirementLevel, string> = {
  recommended: "推奨",
  required: "必須",
};

export function requirementLevelLabel(level: RequirementLevel): string {
  return REQUIREMENT_LEVEL_LABELS[level];
}

/**
 * 必須・推奨項目。BFF `/api/required-items`（Aurora Serverless v2 + RDS Data API）から取得する。
 */
export type RequiredRecommendedItem = {
  id: string;
  recordType: SoapRecordType;
  /** 分野を指定しない（全分野共通）場合は undefined。 */
  specialtyId?: string;
  itemName: string;
  requirementLevel: RequirementLevel;
  aggregationCategory: string;
};

export type RequiredItemFilters = {
  recordType?: SoapRecordType;
  specialtyId?: string;
};
