import type { RuntimeInvokeResult } from "../contracts/runtime.ts";

/** Runtime response body を content-type に応じて client 向け payload に変換する。 */
export function parseRuntimeBody(text: string, contentType: string): unknown {
  if (contentType.includes("text/event-stream")) {
    return {
      contentType,
      response: eventStreamText(text),
    };
  }

  if (contentType.includes("application/json") || text.trim().startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch {
      return { contentType, response: text };
    }
  }

  return { contentType, response: text };
}

/** fetch Response から RuntimeInvokeResult を作る local dev adapter 用 helper。 */
export async function runtimeInvokeResultFromResponse(
  response: Response,
): Promise<RuntimeInvokeResult> {
  const text = await response.text();

  if (!response.ok) {
    return {
      body: trimForClient(text),
      ok: false,
      statusCode: response.status,
    };
  }

  return {
    ok: true,
    payload: parseRuntimeBody(text, response.headers.get("content-type") || ""),
    statusCode: response.status,
  };
}

/** upstream error body を client response に載せられる長さへ丸める。 */
export function trimForClient(value: string): string {
  const trimmed = String(value || "").trim();
  return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}...` : trimmed;
}

/** server-sent events の `data:` 行だけを連結して通常の response text に戻す。 */
function eventStreamText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .filter((line) => line && line !== "[DONE]")
    .join("\n");
}
