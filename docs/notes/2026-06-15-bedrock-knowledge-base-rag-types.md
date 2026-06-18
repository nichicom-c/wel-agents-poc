# Amazon Bedrock Knowledge Bases の RAG 種別と対応データ形式

確認日: 2026-06-15

## Context

このメモは、Amazon Bedrock Knowledge Bases を中心に、AWS の RAG 作成で扱える
RAG 種別と、Knowledge Base に投入できる主なデータ形式を整理する。

`wel-agents-poc` の現行 Terraform は、3 つの `VECTOR` Knowledge Base を作り、
各 Knowledge Base の storage に `S3_VECTORS`、data source に S3 prefix を使う。
現在の sample data は Markdown と CSV が中心である。

## Boundaries

Always:

- Amazon Bedrock Knowledge Bases の公式 docs を一次情報として扱う。
- `document RAG` と `structured data / SQL RAG` を分ける。
- `Excel` / `CSV` は、ファイルとして取り込む場合と structured data store を
  query する場合を混同しない。

Never:

- このメモでは code、Terraform、deployment 手順を変更しない。
- repo 固有の KB 再設計や投入先推奨までは行わない。

Ask First:

- service 横断比較として Amazon Q Business、Amazon Kendra、Neptune 単体まで
  広げる場合。
- file size、chunking、parser、region availability まで詳細化する場合。

## RAG 種別

| 種別 | Bedrock Knowledge Bases での扱い | 主な用途 | 注意点 |
| --- | --- | --- | --- |
| Document / vector RAG | S3、Web、Confluence、Salesforce、SharePoint、Custom data source などから content を ingest し、vector store に格納して検索する | PDF、Markdown、Word、HTML、CSV、Excel などの文書検索 | connector と file format は別概念。S3 以外では connector 側の制約も確認する |
| Structured data / SQL RAG | structured data store に接続し、natural language query を SQL に変換して query engine で実行する | Redshift / Glue Data Catalog などの表データ検索 | CSV / Excel を文書として ingest する方式とは別。schema、table / column description、inclusion / exclusion が重要 |
| Multimodal RAG | text に加えて image、audio、video などを index / retrieve する | 画像類似検索、音声記録検索、動画 segment 検索、図表を含む資料検索 | multimodal content は S3 と custom data source が中心。他 connector では multimodal file が skip される場合がある |
| GraphRAG | Neptune Analytics を vector store として使い、document から entity / fact / relationship を抽出して graph と vector retrieval を組み合わせる | 複数 document chunk をまたぐ関係推論、説明可能性が必要な検索 | S3 data source と Neptune Analytics が前提。通常の S3 Vectors 構成とは storage choice が異なる |

## 対応データ形式

Amazon Bedrock Knowledge Bases の document data source では、公式 docs 上で次の
source file format が supported format とされている。

| 種別 | 拡張子 | 備考 |
| --- | --- | --- |
| Plain text | `.txt` | UTF-8 encoded |
| Markdown | `.md` | UTF-8 encoded |
| HTML | `.html` | UTF-8 encoded |
| Microsoft Word | `.doc`, `.docx` | Word 文書 |
| CSV | `.csv` | 文書として ingest する形式。structured data store query とは別 |
| Microsoft Excel | `.xls`, `.xlsx` | spreadsheet file として ingest する形式。structured data store query とは別 |
| PDF | `.pdf` | Portable Document Format |

公式 docs では、source document file size は 50 MB を超えないこととされている。
また、S3 または custom data source では JPEG / PNG image や、table、chart、
diagram、その他 image を含む file を multimodal data として扱える。
JPEG / PNG の最大 size は 3.75 MB とされている。

## Data Source / Connector

Bedrock API の `DataSourceConfiguration.type` では、少なくとも次の type が定義
されている。

| type | 位置づけ |
| --- | --- |
| `S3` | S3 bucket / prefix を data source にする |
| `WEB` | Web crawler |
| `CONFLUENCE` | Confluence connector |
| `SALESFORCE` | Salesforce connector |
| `SHAREPOINT` | SharePoint connector |
| `CUSTOM` | Custom data source |
| `REDSHIFT_METADATA` | structured data / SQL RAG 用の metadata source |

この一覧は「どこから取り込むか」の分類であり、「投入できる file format」の一覧とは
別に扱う必要がある。

## Architecture

今回の選択 approach は、調査結果を `docs/notes/` に残す「調査メモ型」である。

File change list:

- Add `docs/notes/2026-06-15-bedrock-knowledge-base-rag-types.md`

## Acceptance Criteria

- Given PDF / Markdown / Excel / Word などの投入可否を確認したい場合、When このメモを見ると、supported format と拡張子を確認できる。
- Given RAG の種類を整理したい場合、When このメモを見ると、document / vector RAG、structured data / SQL RAG、multimodal RAG、GraphRAG の違いを確認できる。
- Given CSV / Excel を扱う場合、When このメモを見ると、file ingestion と structured data query を混同しない注意点を確認できる。
- Given 後続設計で根拠を確認したい場合、When このメモを見ると、AWS 公式 docs の参照先を確認できる。

## Decisions Made

- Bedrock Knowledge Bases 中心で整理する。理由は、repo の現行 RAG 構成が Bedrock
  Knowledge Bases + S3 Vectors であり、今回の質問に最も直結するため。
  Confidence: 90%.
- 成果物は対応形式と RAG 種別分類に限定する。repo 固有の投入先推奨は今回の範囲外。
  Confidence: 90%.
- GraphRAG は Bedrock Knowledge Bases の公式機能として確認できたため、RAG 種別に含める。
  Confidence: 85%.

## Open Questions

- 各 connector ごとの attachment / file format 差分を確認するか。
- multimodal RAG の region availability と model / embedding 選定まで踏み込むか。
- file size、chunking strategy、parser selection、metadata filtering の運用設計まで
  別メモで整理するか。

## Non-Goals

- Amazon Q Business、Amazon Kendra、Neptune 単体との service 比較。
- `wel-agents-poc` の Terraform / runtime 実装変更。
- 本番用 ingestion pipeline、権限設計、運用 runbook の作成。

## References

- [Prerequisites for your Amazon Bedrock knowledge base data](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-ds.html)
- [Connect a data source to your knowledge base](https://docs.aws.amazon.com/bedrock/latest/userguide/data-source-connectors.html)
- [Create a knowledge base by connecting to a structured data store](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-structured-create.html)
- [Build a knowledge base for multimodal content](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-multimodal.html)
- [Build a knowledge base with Amazon Neptune Analytics graphs](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-build-graphs.html)
- [DataSourceConfiguration - Amazon Bedrock API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent_DataSourceConfiguration.html)
- [`terraform/aws/agentcore/knowledge-bases.tf`](../../terraform/aws/agentcore/knowledge-bases.tf)
- [`terraform/aws/agentcore/data/`](../../terraform/aws/agentcore/data/)
