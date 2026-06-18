# Strands Agent-to-Agent (A2A) 解説

## 概要

`Agent-to-Agent (A2A)` は、Strands agent を別 process、別 service、別 platform
から呼び出すための protocol / service boundary である。

`Agents as Tools`、`Swarm`、`Graph`、`Workflow` が主に同一アプリケーション内の
multi-agent orchestration を扱うのに対し、A2A は HTTP 経由で remote agent と
通信する。つまり、agent ごとに deploy、scale、権限、実装言語、運用責任を
分けたい場合の選択肢である。

## 位置づけ

| 観点 | A2A |
| --- | --- |
| 主目的 | remote agent との通信 |
| 境界 | process / container / service / platform をまたぐ |
| 呼び出し側 | `A2AAgent` |
| 公開側 | `A2AExpressServer` |
| agent discovery | `/.well-known/agent-card.json` |
| request handling | server root path の JSON-RPC request |
| context | `context_id` 単位で会話状態を分離 |
| 認証 | `context_id` は認証境界ではないため、別途 transport / gateway 層で必要 |

## TypeScript で remote agent を呼ぶ

呼び出し側では `A2AAgent` を使う。`A2AAgent` は A2A protocol 通信を wrapper し、
通常の agent と近い interface で remote agent を呼び出せる。

```ts
import { A2AAgent } from "@strands-agents/sdk/a2a";

const calculatorAgent = new A2AAgent({
  url: "http://calculator-service:9000",
});

const result = await calculatorAgent.invoke("Show me 10 ^ 6");
console.log(result.lastMessage.content);
```

主な設定:

- `url`: remote A2A agent の base URL。
- `agentCardPath`: agent card path。デフォルトは `/.well-known/agent-card.json`。
- `id`: agent instance の識別子。
- `name` / `description`: 指定しない場合は agent card から取得される。

agent card は最初の `invoke()` または `stream()` 時に遅延取得され、cache される。
streaming では protocol event の `A2AStreamUpdateEvent` と最終結果の
`AgentResultEvent` が返る。

## TypeScript で agent を A2A server として公開する

公開側では `A2AExpressServer` を使う。

```ts
import { Agent } from "@strands-agents/sdk";
import { A2AExpressServer } from "@strands-agents/sdk/a2a/express";

const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({
      systemPrompt: "You are a calculator agent.",
    }),
  name: "Calculator Agent",
  description: "Performs calculations.",
  host: "0.0.0.0",
  port: 8080,
});

await server.serve();
```

依存関係:

```bash
npm install @strands-agents/sdk @a2a-js/sdk express
```

`@a2a-js/sdk` と `express` は TypeScript で A2A を使う場合に明示的に追加する。
この repo で採用する場合は、既存方針どおり exact version で pin する。

## Server 設計の要点

`A2AExpressServer` では、`agentFactory` を使う構成が推奨される。`agentFactory` は
`contextId` を受け取り、その会話 context 専用の agent を返す。

```ts
const server = new A2AExpressServer({
  agentFactory: (contextId) =>
    new Agent({
      systemPrompt: `You are serving context ${contextId}.`,
    }),
  name: "My Agent",
  maxContexts: 1000,
});
```

これにより、異なる `context_id` の会話履歴が互いに影響しにくくなる。
`maxContexts` を超えた場合は、保持している context が LRU 的に削除される。

主な server option:

- `agentFactory`: `contextId` ごとに agent を作る factory。
- `agent`: 単一 agent を再利用する形式。docs では `agentFactory` が推奨される。
- `maxContexts`: 同時に保持する context 数。
- `name`: agent card に出す名前。
- `description`: agent card に出す説明。
- `host` / `port`: bind 先。
- `version`: agent card の version。
- `httpUrl`: reverse proxy / load balancer 後ろの公開 URL。
- `skills`: agent card に載せる skill metadata。
- `taskStore`: task state 永続化用の store。
- `userBuilder`: 認証情報の user 化。

## Endpoint と agent card

A2A server は agent metadata を `/.well-known/agent-card.json` で公開する。
client は agent card を使って、remote agent の名前、説明、skill などを取得する。

request は JSON-RPC として server root path で処理される。既存 Express app に
組み込む場合は、`createMiddleware()` を使って router として mount できる。

```ts
const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/calculator", server.createMiddleware());
```

load balancer や reverse proxy 配下に置く場合は、agent card が外部から正しい URL
を指すように `httpUrl` を設定する。

```ts
const server = new A2AExpressServer({
  agentFactory: (contextId) => new Agent({ systemPrompt: "You are helpful." }),
  name: "Calculator Agent",
  httpUrl: "https://example.com/calculator",
});
```

## 認証と multi-tenant の注意

`context_id` は認証境界ではない。別の caller が他者の `context_id` を知っている
場合、その会話に接続できる可能性がある。

そのため、multi-tenant 環境では次を A2A server の外側で設計する。

- API gateway / load balancer / reverse proxy での認証。
- caller identity と `context_id` の紐付け検証。
- tenant ごとの network / IAM / policy 分離。
- logs / traces に secret や個人情報を出さない運用。

## 他パターンとの関係

### Agents as Tools

A2A は `Agents as Tools` と組み合わせやすい。remote A2A-compatible agent を
`A2AAgent` として作り、orchestrator agent から tool 的に呼び出す構成にできる。

ただし、`Agents as Tools` の公式ページでは A2A との組み合わせは言及されているが、
具体的な TypeScript 実装例は A2A 側の docs を参照する形になっている。

### Graph

`Graph` は remote A2A agent を node として扱える。local agent と remote agent を
同じ graph に混ぜ、orchestration は local、専門処理は remote service に任せる
構成にできる。

```ts
const dataPrep = new Agent({
  id: "prep",
  systemPrompt: "You prepare data for analysis.",
});

const mlAnalyzer = new A2AAgent({
  url: "http://ml-service:9000",
  id: "ml",
});

const graph = new Graph({
  nodes: [dataPrep, mlAnalyzer],
  edges: [["prep", "ml"]],
});
```

### Swarm

A2A docs では、`A2AAgent` は `Swarm` patterns では未サポートとされている。
remote agent を含む multi-agent 構成にしたい場合は、`Swarm` ではなく `Graph` や
`Agents as Tools` を検討する。

### Workflow

Workflow は fixed dependency の task process を表す pattern であり、A2A は
その task の実行先を remote service にできる可能性がある。ただし、公式 workflow
page は Python 例が中心で、TypeScript で A2A と組み合わせる具体 API は薄い。
TypeScript では `Graph` で remote A2A node を表現する方が確認しやすい。

## 使うべき場合

A2A を検討するべきケース:

- agent ごとに deploy / scale / release cycle を分けたい。
- agent ごとに IAM、network、secret、data access を分離したい。
- 別チームや別 platform の agent を呼びたい。
- heavy dependency を持つ agent を main app から分離したい。
- local orchestrator と remote specialist services を組み合わせたい。

A2A を避けるべきケース:

- PoC で全 agent が同じ TypeScript / Bun app 内にある。
- network boundary、認証、observability、retry をまだ設計したくない。
- latency や partial failure を増やしたくない。
- 単に専門 agent を呼び分けたいだけで、`Agents as Tools` で足りる。

## この repo での示唆

`wel-agents-poc` の最小 PoC では、まず `Agents as Tools`、`Graph`、`Swarm` の
いずれかで同一 process 内に閉じる方が実装・検証が小さい。

A2A を採用するのは、専門 agent を独立 service として運用する要件が出てからでよい。
その場合は、`src/` 側に orchestrator と A2A client、各 specialist service 側に
`A2AExpressServer` を置く構成になる。

## 参考リンク

- [Agent-to-Agent (A2A) Protocol](https://strandsagents.com/docs/user-guide/concepts/multi-agent/agent-to-agent/)
- [Graph Multi-Agent Pattern](https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/)
- [Agents as Tools with Strands Agents SDK](https://strandsagents.com/docs/user-guide/concepts/multi-agent/agents-as-tools/)
- [Multi-agent Patterns](https://strandsagents.com/docs/user-guide/concepts/multi-agent/multi-agent-patterns/)
