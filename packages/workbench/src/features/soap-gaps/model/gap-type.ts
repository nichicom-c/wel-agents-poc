/**
 * 不足種別。issue #6 の技術方針（必須不足、推奨不足、曖昧、矛盾、根拠不足、確認推奨）に合わせる。
 * 順序は agentcore 側の優先度（必須不足・根拠不足・矛盾を優先）と揃え、グルーピング表示でも
 * この順で並べる。
 */
export const GAP_TYPES = [
  "missing_required",
  "insufficient_reasoning",
  "contradictory",
  "ambiguous",
  "missing_recommended",
  "review_recommended",
] as const;

export type GapType = (typeof GAP_TYPES)[number];

const GAP_TYPE_LABELS: Record<GapType, string> = {
  missing_required: "必須不足",
  insufficient_reasoning: "根拠不足",
  contradictory: "矛盾",
  ambiguous: "曖昧",
  missing_recommended: "推奨不足",
  review_recommended: "確認推奨",
};

export function gapTypeLabel(gapType: GapType): string {
  return GAP_TYPE_LABELS[gapType];
}

export function isGapType(value: unknown): value is GapType {
  return (GAP_TYPES as readonly unknown[]).includes(value);
}

/** gapType ごとにまとめる。GAP_TYPES の優先順序を保ち、該当が無い種別は含めない。 */
export function groupByGapType<T extends { gapType: GapType }>(
  items: T[],
): Array<{ gapType: GapType; items: T[] }> {
  return GAP_TYPES.map((gapType) => ({
    gapType,
    items: items.filter((item) => item.gapType === gapType),
  })).filter((group) => group.items.length > 0);
}
