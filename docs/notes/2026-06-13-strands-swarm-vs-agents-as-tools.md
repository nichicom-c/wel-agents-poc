# Strands multi-agent パターン比較

## 概要

このメモは、Strands Agents SDK の multi-agent パターンである
`Agents as Tools`、`Swarm`、`Graph`、`Workflow` の違いを整理する。
Docker や A2A の分散実行ではなく、同一アプリケーション内で複数 agent を
組み合わせる設計判断に焦点を置く。

結論として、`Agents as Tools` は supervisor / orchestrator が専門 agent を
tool として呼び分ける中央集権型の構成であり、`Swarm` は複数 agent が
`nodes` として参加し、agent 同士が自律的に handoff する協調型の構成である。
`Graph` は node と edge で実行経路を明示する構成、`Workflow` は task の
依存関係を固定して繰り返し実行する構成である。

## 比較表

| 観点 | Agents as Tools | Swarm | Graph | Workflow |
| --- | --- | --- | --- | --- |
| 基本モデル | 階層型の委譲 | 自律協調型の handoff | 有向 graph による依存関係実行 | task dependency graph |
| 制御主体 | supervisor / orchestrator agent | 現在実行中の agent | developer が定義した node / edge | developer が定義した task dependency |
| 構成単位 | specialist agent を tool として親 agent に渡す | specialist agent を Swarm の `nodes` に渡す | agent / custom node / nested graph などを `nodes` に渡す | task と依存関係を定義する |
| TypeScript の代表形 | `new Agent({ tools: [specialistToolOrAgent] })` | `new Swarm({ nodes: [agentA, agentB], start, maxSteps })` | `new Graph({ nodes, edges, sources, maxSteps })` | custom code で agent を chain する |
| 経路の決まり方 | supervisor が user query と tool description を見て呼び先を選ぶ | agent が structured output で次の `agentId` を返し handoff する | edge と条件 handler に従う | task dependencies に従う |
| context | specialist 呼び出しはデフォルトで独立しやすい。必要に応じて `preserveContext` を使う | handoff message と `context` を通じて協調する | 元 task と依存 node の出力を後続 node に渡す | 依存 task の結果を後続 task に渡す |
| cycle | 通常は想定しない | 可能 | 可能 | 不可 |
| 安全装置 | 通常の agent / tool 実行設計に依存 | `maxSteps`、`timeout`、`nodeTimeout` が重要 | cycle がある場合は `maxSteps`、`timeout`、`nodeTimeout` が重要 | failed task が downstream を止める前提で retry / recovery を設計する |
| 得意な問題 | ドメイン判定、RAG ルーティング、専門 QA、明確な責務分離 | 調査、設計、実装、レビューのような探索的・多段階タスク | 条件分岐、合流、error path、feedback loop がある業務プロセス | 定型 pipeline、定期処理、監査可能な多段階プロセス |
| 再現性 | 比較的高い。supervisor prompt と tool description で制御しやすい | 比較的揺れやすい。handoff 経路が emergent になる | 高い。構造は edge で明示される | 高い。依存関係が固定される |

## Agents as Tools

`Agents as Tools` は、専門 agent を callable tool として親 agent に渡す
パターンである。親 agent は user query を受け取り、system prompt と tool
description をもとに、どの専門 agent を呼ぶかを判断する。

TypeScript では、専門 agent をそのまま `tools` に渡す方法、`asTool()` で
名前・説明・context 維持などを調整する方法、`tool()` で wrapper を作って
入力整形やエラー処理を自前で制御する方法がある。

最小構成のイメージ:

```ts
const orchestrator = new Agent({
  systemPrompt: "Route queries to specialized agents.",
  tools: [researchAgent, productAgent, travelAgent],
});
```

この構成は、RAG のように「質問を分類して適切な専門知識へ渡す」用途と相性が
よい。例えば AWS サービス、業務データ、社内文書という3つの Knowledge Base
があり、質問内容に応じて1つまたは複数の専門 agent を呼ぶ場合は、
`Agents as Tools` が自然である。

## Swarm

`Swarm` は、複数の専門 agent を `nodes` として登録し、agent 同士が自律的に
handoff しながらタスクを進めるパターンである。TypeScript では、各 agent に
`id`、`description`、`systemPrompt` を与え、`Swarm` に `nodes` として渡す。

最小構成のイメージ:

```ts
const researcher = new Agent({
  id: "researcher",
  description: "Researches topics and gathers information.",
  systemPrompt: "You are a research specialist.",
});

const reviewer = new Agent({
  id: "reviewer",
  description: "Reviews work and provides the final answer.",
  systemPrompt: "You are a review specialist.",
});

const swarm = new Swarm({
  nodes: [researcher, reviewer],
  start: "researcher",
  maxSteps: 4,
  timeout: 120_000,
  nodeTimeout: 60_000,
});
```

TypeScript の `Swarm` は Python の `handoff_to_agent` tool 方式とは異なり、
各 agent の応答を `{ agentId, message, context }` の structured output に
寄せる。`agentId` があればその agent に handoff し、なければ `message` が
最終応答になる。

`Swarm` は、次に誰が担当すべきかを事前に固定しにくいタスクに向く。例えば
「調査 agent が調べ、設計 agent が構成を作り、実装 agent が案を具体化し、
レビュー agent が検証する」といった探索的な流れでは、handoff によって
柔軟に進行できる。

一方で、実行経路が揺れやすいため、`maxSteps`、`timeout`、`nodeTimeout` を
設定して runaway loop を防ぐ必要がある。

## Graph

`Graph` は、agent、custom node、nested graph などを node として登録し、
edge で依存関係と情報の流れを定義するパターンである。構造は developer が
明示しつつ、条件付き edge によって実行 path を動的に変えられる。

最小構成のイメージ:

```ts
const graph = new Graph({
  nodes: [researcher, analyst, factChecker, reportWriter],
  edges: [
    ["researcher", "analyst"],
    ["researcher", "fact_checker"],
    ["analyst", "report_writer"],
    ["fact_checker", "report_writer"],
  ],
  sources: ["researcher"],
  maxSteps: 20,
});
```

`Graph` は、条件分岐、合流、error path、feedback loop のように、業務フローを
明示的に表現したい場合に向く。例えば「質問分類 -> KB 検索 -> 回答生成 ->
根拠検証 -> NG なら再検索」のような流れは、`Graph` で edge と条件を定義すると
追いやすい。

TypeScript の `Graph` は AND semantics で、複数の incoming edge を持つ node は
すべての依存元が完了してから実行される。一方、Python は OR semantics とされて
いるため、SDK 間で graph の実行タイミングに差がある点に注意する。

cycle を含められるため、loop を使う場合は `maxSteps` や timeout を必ず設計する。

## Workflow

`Workflow` は、複数 task の依存関係を定義し、順序実行、並列実行、join point、
情報フローを管理するパターンである。公式 docs では、明示的な実行順序、依存関係、
情報フローを制御して、特定の実行 pattern が必要なプロセスを信頼性高く処理する
ための構成として説明されている。

最小構成のイメージ:

```text
data_extraction
  -> trend_analysis
      -> report_generation
```

独立 task を並列化する場合:

```text
prepare
  -> analyze_a --
  -> analyze_b -- join -> report
```

`Workflow` は、定型的で繰り返し可能な処理を1つの再利用可能な手順として
まとめたい場合に向く。例えば、定期レポート生成、データ抽出、分析、要約、
通知のように、依存関係が固定されている処理で使いやすい。

注意点として、公式の workflow ページは Python 例が中心である。TypeScript で
同じ考え方を使う場合は、現時点では first-class の `Workflow` orchestrator を
そのまま使う前提にせず、agent を custom code で chain する、または `Graph` で
依存関係を表現する方針も検討する。

## 選定指針

以下の場合は `Agents as Tools` を優先する。

- user query を見て専門領域へルーティングしたい
- supervisor が最終回答の責任を持つ構成にしたい
- どの専門 agent を呼ぶべきかを prompt / tool description で制御したい
- RAG で Knowledge Base ごとに専門 agent を分けたい
- テストで specialist runner や wrapper を差し替えたい

以下の場合は `Swarm` を検討する。

- タスクが探索的で、次の担当 agent を実行中に決めたい
- 複数 agent が互いの途中成果を見ながら作業する必要がある
- 調査、設計、実装、レビューのような多段階 handoff が自然である
- supervisor が一方的に tool を選ぶより、agent 間協調を表現したい

以下の場合は `Graph` を検討する。

- 分岐、合流、loop、error path を明示したい
- 実行経路を developer が edge と条件で管理したい
- 検証結果に応じて修正 node に戻すなど、feedback loop が必要である
- agent だけでなく deterministic な custom node も混ぜたい

以下の場合は `Workflow` を検討する。

- 毎回同じ task dependency で処理したい
- independent task を並列実行し、最後に集約したい
- pause / resume、retry、status tracking、監査性が重要である
- process を1つの再利用可能な手順として扱いたい

## 実装上の注意

- `Agents as Tools` の専門 agent は、親 agent の `tools` 配列に入る「呼び出し
  可能な機能」として扱う。
- `Swarm` の `nodes` は、Swarm に参加する agent 自体であり、個々の agent が
  持つ `tools` とは別物である。
- TypeScript の `Swarm` は `maxSteps` と timeout を必ず設定する。公式 docs
  でも、`maxSteps` も `timeout` もない Swarm は無制限実行になり得るため警告
  対象とされている。
- `Graph` は cycle を扱えるため、loop を入れる場合は exit condition と
  実行上限を明示する。
- `Workflow` は TypeScript の具体 API が公式 workflow ページで薄いため、
  実装前に TypeScript API reference または `Graph` で代替できるかを確認する。
- remote agent / 別 process / 別 container を扱いたい場合は、この4つだけで
  判断せず、A2A パターンを別途検討する。

## 参考リンク

- [Swarm Multi-Agent Pattern](https://strandsagents.com/docs/user-guide/concepts/multi-agent/swarm/)
- [Agents as Tools with Strands Agents SDK](https://strandsagents.com/docs/user-guide/concepts/multi-agent/agents-as-tools/)
- [Graph Multi-Agent Pattern](https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/)
- [Agent Workflows: Building Multi-Agent Systems with Strands Agents SDK](https://strandsagents.com/docs/user-guide/concepts/multi-agent/workflow/)
- [Multi-agent Patterns](https://strandsagents.com/docs/user-guide/concepts/multi-agent/multi-agent-patterns/)
- [Swarm API Reference](https://strandsagents.com/docs/api/typescript/Swarm/)
