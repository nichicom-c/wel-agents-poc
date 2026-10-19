import type { SoapCategory } from "../model/soap-draft-candidates.ts";

/**
 * SOAP 区分ごとの色分け（旧 `--soap-cat-*` の置き換え）。DADS のパレットから採り、
 * SOAP Studio の候補カードと Knowledge Review の記録表示で同じ対応を使う。
 */
export const SOAP_CATEGORY_ACCENTS: Record<
  SoapCategory,
  { border: string; text: string }
> = {
  A: { border: "border-l-orange-700", text: "text-orange-700" },
  O: { border: "border-l-green-700", text: "text-green-700" },
  P: { border: "border-l-purple-700", text: "text-purple-700" },
  S: { border: "border-l-blue-700", text: "text-blue-700" },
  UNCLASSIFIED: { border: "border-l-border", text: "text-muted-foreground" },
};
