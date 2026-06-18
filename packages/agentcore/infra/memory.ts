/**
 * AgentCore Memory の short-term（会話 event）を保存・取得する薄いラッパ。
 *
 * long-term strategy（要約・意味記憶）は使わず raw event だけを使う。1 ターン（user 発話 +
 * assistant 応答）を `CreateEvent` で 1 event として保存し、次ターンで直近の event を `ListEvents`
 * で取り出して supervisor への入力に前置きする。これで session / actor 単位の multi-turn を実現する。
 *
 * 重要: AWS の ListEvents は応答順序を規定していない（API_ListEvents 参照）。そこで maxResults で
 * 取得したうえで `eventTimestamp` 昇順にソートし、直近 N 件を採用する（サーバ順序に依存しない）。
 * Python SDK の `MemoryClient.get_last_k_turns` は TS にないため、AWS SDK の command で同等を組む。
 *
 * PoC 制約: 1 session の event 数が maxResults を超える長対話では、1 ページ（nextToken 不使用）に
 * 最新ターンが含まれない可能性があり直近性は保証されない。恒久対応はページング（nextToken）。
 */

import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  type CreateEventCommandOutput,
  type Event,
  ListEventsCommand,
  type ListEventsCommandOutput,
} from "@aws-sdk/client-bedrock-agentcore";

/** create / list event に必要な最小 client 契約。テストでは fake を注入できる。 */
export interface MemoryClient {
  send(command: CreateEventCommand): Promise<CreateEventCommandOutput>;
  send(command: ListEventsCommand): Promise<ListEventsCommandOutput>;
}

/**
 * runtime が依存する Memory の振る舞い契約。{@link ConversationMemory} が実装する。
 * runtime 側はこの interface に依存し、テストでは fake を注入できる（private を持つ
 * クラス型ではなく interface に依存させることで構造的に差し替え可能にする）。
 */
export interface MemoryStore {
  recentHistory(actorId: string, sessionId: string): Promise<string>;
  saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void>;
}

// AgentCore Memory の Conversational.role（"ASSISTANT" | "USER" | "TOOL" | "OTHER"）。
const ROLE_USER = "USER";
const ROLE_ASSISTANT = "ASSISTANT";

/** session 全体を概ね取得する上限（PoC: これでページングを避ける）。 */
export const DEFAULT_MAX_RESULTS = 100;
/** 履歴に採用する直近 event 数（1 event ≒ 1 ターン）。 */
export const DEFAULT_RECENT_TURNS = 5;
/** 履歴テキストの最大文字数（末尾＝新しい会話を優先して丸める）。 */
export const DEFAULT_MAX_CHARS = 4000;

/** 表示用ラベル。未知の role は素のまま表示する。 */
const ROLE_LABELS: Record<string, string> = {
  USER: "User",
  ASSISTANT: "Assistant",
  TOOL: "Tool",
  OTHER: "Other",
};

/** 1 event の payload から (role, text) を best-effort で取り出す。 */
function* iterEventMessages(event: Event): Generator<[string, string]> {
  for (const item of event.payload ?? []) {
    const conversational = item.conversational;
    const role = conversational?.role;
    const text = conversational?.content?.text?.trim();
    if (role && text) {
      yield [role, text];
    }
  }
}

/**
 * event 列を `eventTimestamp` 昇順（古い順）に並べ替える（元配列は破壊しない）。
 *
 * ListEvents の応答順序は未規定のため、整形・truncate の前に必ずこれで安定化させる。
 * timestamp 欠落は最古（0）として扱う。
 */
export function sortEventsByTimestamp(events: readonly Event[]): Event[] {
  return [...events].sort(
    (a, b) =>
      (a.eventTimestamp?.getTime() ?? 0) - (b.eventTimestamp?.getTime() ?? 0),
  );
}

/**
 * 昇順に並んだ event 列を「Label: text」の行に整形する（末尾を max_chars で丸める）。
 */
export function formatEvents(
  events: readonly Event[],
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  const lines: string[] = [];
  for (const event of events) {
    for (const [role, text] of iterEventMessages(event)) {
      lines.push(`${ROLE_LABELS[role.toUpperCase()] ?? role}: ${text}`);
    }
  }
  const history = lines.join("\n");
  return history.length > maxChars ? history.slice(-maxChars) : history;
}

export type ConversationMemoryOptions = {
  /** テスト用に注入する client（省略時は region から BedrockAgentCoreClient を生成）。 */
  client?: MemoryClient;
  /** client 未注入時の region（未指定なら AWS SDK の既定解決）。 */
  region?: string | undefined;
  /** ListEvents の取得上限。 */
  maxResults?: number;
  /** 履歴に採用する直近 event 数。 */
  recentTurns?: number;
  /** 履歴テキストの最大文字数。 */
  maxChars?: number;
  /** eventTimestamp の生成（テストで固定可能）。既定は現在時刻。 */
  now?: () => Date;
};

/** AgentCore Memory への保存・取得を担うラッパ。 */
export class ConversationMemory implements MemoryStore {
  private readonly client: MemoryClient;
  private readonly maxResults: number;
  private readonly recentTurns: number;
  private readonly maxChars: number;
  private readonly now: () => Date;

  constructor(
    readonly memoryId: string,
    options: ConversationMemoryOptions = {},
  ) {
    this.client =
      options.client ??
      new BedrockAgentCoreClient(
        options.region ? { region: options.region } : {},
      );
    this.maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    this.recentTurns = options.recentTurns ?? DEFAULT_RECENT_TURNS;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.now = options.now ?? (() => new Date());
  }

  /** 1 ターン（user + assistant）を会話 event として保存する。 */
  async saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    await this.client.send(
      new CreateEventCommand({
        memoryId: this.memoryId,
        actorId,
        sessionId,
        eventTimestamp: this.now(),
        payload: [
          { conversational: { role: ROLE_USER, content: { text: userText } } },
          {
            conversational: {
              role: ROLE_ASSISTANT,
              content: { text: assistantText },
            },
          },
        ],
      }),
    );
  }

  /** 直近のターンを整形済みテキストで返す（無ければ空文字列）。 */
  async recentHistory(actorId: string, sessionId: string): Promise<string> {
    const output = await this.client.send(
      new ListEventsCommand({
        memoryId: this.memoryId,
        actorId,
        sessionId,
        includePayloads: true,
        maxResults: this.maxResults,
      }),
    );
    const sorted = sortEventsByTimestamp(output.events ?? []);
    const recent = sorted.slice(-this.recentTurns);
    return formatEvents(recent, this.maxChars);
  }
}
