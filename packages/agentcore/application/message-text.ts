import type { Message } from "@strands-agents/sdk";

/**
 * メッセージから本文テキスト（textBlock）のみを連結して取り出す。
 *
 * reasoningBlock などは含めない（ユーザー向け回答に推論を混ぜない）。AgentResult.toString() は
 * reasoning / structuredOutput も含むため、回答本文だけが欲しい場面ではこちらを使う。
 */
export function extractText(message: Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "textBlock") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
