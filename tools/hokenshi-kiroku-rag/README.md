# tools/hokenshi-kiroku-rag

書籍『こう書けばわかる！保健師記録』（医学書院）の Markdown から `hokenshi_kiroku` RAG corpus を組み立てるツール。

`medical_care_law` と違い OCR 工程はここに含まない。入力は PDF から変換済みの結合 Markdown 1 本で、本スクリプトはそれをページ単位 corpus + Bedrock metadata sidecar + review manifest に決定的に分解するだけ。

## 入力の置き場所

原本（PDF・結合 Markdown・切り出し画像）は ingestion 対象に入れたくないため、gitignore 済みの `tmp/hokenshi-kiroku/` に置く。

```
tmp/hokenshi-kiroku/
├── こう書けばわかる保健師記録.pdf   # 原本 PDF
├── こう書けばわかる保健師記録.md    # 結合 Markdown（<!-- pdf-page: N --> でページ境界）
├── pages/page-NNN.md               # ページ単位（結合 Markdown と同一内容。参照用）
└── images/page-NNN-figM.png        # 図版画像（corpus には alt text だけ残す）
```

## `assemble-corpus.ts`

結合 Markdown を 172 ページに分解し、1 ページ = 1 Markdown ファイル（見出し + 本文 + 脚注ブロック）と同名の `.metadata.json` を書き出す。画像参照 `![alt](...)` は S3 に上げない画像を指さないよう `（図: alt）` に畳み、alt text だけを検索対象として残す。

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `--source=<path>` | `tmp/hokenshi-kiroku/こう書けばわかる保健師記録.md` | 結合 Markdown |
| `--pdf=<path>` | `tmp/hokenshi-kiroku/こう書けばわかる保健師記録.pdf` | 原本 PDF（manifest の sha256 用。無ければ null） |
| `--version=<ver>` | `2026-11-10` | corpus バージョン（出力ディレクトリ名） |
| `--generated-at=<iso>` | 実行時刻 | 脚注・metadata に埋める生成時刻。再生成の差分を抑えたいときに固定する |

```bash
bun run tools/hokenshi-kiroku-rag/assemble-corpus.ts --generated-at=2026-11-10T00:00:00.000Z
```

出力先:

- corpus — `terraform/aws/agentcore/data/hokenshi-kiroku/record-guide/<version>/`（S3 data source の inclusion prefix 内）
- manifest — `terraform/aws/agentcore/data/hokenshi-kiroku-manifests/record-guide/<version>/manifest.json`（inclusion prefix の外）

## 単元表

ページ範囲は書籍の目次（PDF 5-8 ページ）と本文見出しから起こし、`UNITS` 定数に持つ。全 172 ページを隙間・重複なく覆うことはテストで検証している。章立てを直すときは `UNITS` を直し、corpus を作り直す。

| section | 単元 | ページ |
| --- | --- | --- |
| `front-matter` | 前付 / 目次 | 1-8 |
| `kiso` | 基礎編 扉 + 1-2 | 9-31 |
| `jissen` | 実践編 扉 + 1-8 | 32-119 |
| `tenkai` | 展開編 扉 + 1-4 | 120-144 |
| `appendix` | 付録1-2 | 145-169 |
| `afterword` | あとがき | 170 |
| `index` | 索引 | 171-172 |

## metadata

`metadataAttributes` は `corpus_id` / `source_title` / `section` / `section_title` / `unit` / `unit_title` / `source_file` / `source_page` / `output_page` / `conversion` / `generated_at` / `content_type`。`content_type` は `body` / `figure_or_form` / `blank` / `front_matter` / `toc` / `section_divider` / `afterword` / `index`。

## テスト

```bash
bun test tools/hokenshi-kiroku-rag/
```
