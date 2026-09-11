/**
 * 保健師SOAP_KB_詳細設計書_v2 の固定 Knowledge Base（knowledge_item）から BFF が組み立てて
 * 渡す補足コンテキストの抽出・整形。`soap_draft` / `soap_gaps` の両方で共有する
 * （payload の `knowledge_context` フィールド）。
 *
 * AgentCore 自身は DB を持たないため、ここでは payload に既に埋め込まれた値を読むだけで、
 * KB からの取得ロジックは持たない（それは BFF 側 `infra/soap-knowledge-base-store.ts` の役割）。
 */

import type { RuntimeRequest } from "../contracts/runtime.ts";

export type KnowledgeContextItem = {
  category: string;
  title: string;
  content: string;
};

function isKnowledgeContextItem(value: unknown): value is KnowledgeContextItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.category === "string" &&
    typeof record.title === "string" &&
    typeof record.content === "string"
  );
}

/** payload から知識ベースの補足コンテキストを取り出す。無ければ空配列。 */
export function getKnowledgeContext(
  payload: RuntimeRequest,
): KnowledgeContextItem[] {
  const { knowledge_context: knowledgeContext } = payload;
  if (!Array.isArray(knowledgeContext)) {
    return [];
  }
  return knowledgeContext.filter(isKnowledgeContextItem);
}

/**
 * 知識ベース項目をカテゴリごとにグループ化し、システムプロンプトへ追記できるテキストへ
 * 整形する。項目が無ければ空文字列を返す（呼び出し側は追記自体をスキップできる）。
 */
export function formatKnowledgeContext(items: KnowledgeContextItem[]): string {
  if (items.length === 0) {
    return "";
  }

  const byCategory = new Map<string, KnowledgeContextItem[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.category) ?? [];
    bucket.push(item);
    byCategory.set(item.category, bucket);
  }

  const sections = [...byCategory.entries()].map(
    ([category, categoryItems]) => {
      const lines = categoryItems
        .map((item) => `- ${item.title}: ${item.content}`)
        .join("\n");
      return `[${category}]\n${lines}`;
    },
  );

  return (
    "\n\nThe following Knowledge Base rules are currently active and MUST be followed " +
    "together with the rules above (source of truth: the organization's SOAP Knowledge Base, " +
    "not this prompt):\n" +
    sections.join("\n\n")
  );
}
