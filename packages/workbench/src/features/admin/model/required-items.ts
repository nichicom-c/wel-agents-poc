import type { SoapRecordType } from "../../soap-draft/index.ts";
import { createId } from "./create-id.ts";

export const REQUIREMENT_LEVELS = ["required", "recommended"] as const;

export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

const REQUIREMENT_LEVEL_LABELS: Record<RequirementLevel, string> = {
  recommended: "推奨",
  required: "必須",
};

export function requirementLevelLabel(level: RequirementLevel): string {
  return REQUIREMENT_LEVEL_LABELS[level];
}

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

export function filterRequiredItems(
  items: readonly RequiredRecommendedItem[],
  filters: RequiredItemFilters,
): RequiredRecommendedItem[] {
  return items.filter(
    (item) =>
      (!filters.recordType || item.recordType === filters.recordType) &&
      (!filters.specialtyId || item.specialtyId === filters.specialtyId),
  );
}

export type NewRequiredItemInput = {
  recordType: SoapRecordType;
  specialtyId?: string;
  itemName: string;
  requirementLevel: RequirementLevel;
  aggregationCategory: string;
};

export function createRequiredItem(
  items: readonly RequiredRecommendedItem[],
  input: NewRequiredItemInput,
): RequiredRecommendedItem[] {
  return [...items, { ...input, id: createId("required-item") }];
}
