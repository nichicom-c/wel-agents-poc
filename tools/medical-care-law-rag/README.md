# tools/medical-care-law-rag

保険診療基本法令テキストブックのスキャン PDF から `medical_care_law` RAG corpus を生成・整形するツール群。

**エンドツーエンドの手順**は Claude Code skill [`medical-care-law-corpus`](../../.claude/skills/medical-care-law-corpus/SKILL.md) を参照(tessdata 準備 → 再OCR → 整形 workflow → 組み立て → 品質ゲート → commit)。本 README は各スクリプトの引数リファレンス。

決定的処理(OCR・組み立て)は bun スクリプト、LLM 工程(整形/検証/修復)は Claude Code の Workflow ツールで実行する。捏造ゼロ化の設計意図は skill を参照。

## スクリプト

### `setup-tessdata-best.sh [target_dir]`

tessdata_best の `jpn` / `eng` / `jpn_vert` を取得し、system tessdata の `configs`(tesseract が txt/tsv 出力に使う)をコピーして、`--tessdata-dir` で使える独立 tessdata を作る。`target_dir` 既定 `tmp/tessdata-best`(gitignore 済み)。

```bash
bash tools/medical-care-law-rag/setup-tessdata-best.sh tmp/tessdata-best
```

### `generate-textbook-corpus.ts`

PDF→画像(`pdftoppm`)→OCR(`tesseract`)→ページ単位 Markdown + Bedrock metadata sidecar(`<file>.md.metadata.json`)+ OCR review manifest を生成する。`chapter_split_manifest.txt` を読み 9PDF・260ページを検証(`pdfinfo`)。

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `--input-dir=<dir>` | `tmp/保険診療基本法令テキストブック` | 入力 PDF + manifest のディレクトリ |
| `--tessdata-dir=<dir>` | (system) | tessdata ディレクトリ。tessdata_best 利用時に指定 |
| `--lang=<langs>` | `jpn+eng` | tesseract 言語 |
| `--psm=<n>` | (tesseract 既定 3) | Page Segmentation Mode |
| `--dpi=<n>` | `300` | レンダリング解像度 |
| `--allow-empty-pages` | off | 空ページ(図版/章区切り)で fail-fast せず継続。本テキストブックでは必須 |

出力先: `terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/<CORPUS_VERSION>/`(corpus)、`terraform/aws/agentcore/data/medical-care-law-manifests/basic-law-textbook/<CORPUS_VERSION>/manifest.json`(ingestion 対象外)。`jpn` 言語データが無い場合は生成前に fail-fast。

```bash
bun run tools/medical-care-law-rag/generate-textbook-corpus.ts \
  --tessdata-dir=tmp/tessdata-best --allow-empty-pages
```

### `cleanup-corpus.workflow.mjs`（Claude Code Workflow ツールで実行）

raw best-OCR の各ページを per-page で **clean → verify → (捏造なら repair → reverify → なお捏造なら raw fallback)** で処理し、整形後**本文だけ**を構造化出力で返す(ファイルは書かない)。

- **設定はスクリプト先頭の定数**(`RAW_DIR` / `LIMIT`)で行う。Workflow の args は本スクリプトでは安定して届かないため使わない。`RAW_DIR` の `<REPO_ROOT>` をリポジトリ絶対パスに置換し、pilot 時は `LIMIT` を正の数(例 4)、本番は `0`(全260)にする。
- 出力: `{ total, summary{byStage,byType}, results: [{file, content_type, final_body|null, stage, faithful, additions}] }`
- `stage`: `clean` / `repair` / `raw-fallback`(=`final_body` null・raw 本文採用) / `clean-failed`
- ページ列は scripts 内で生成。図表/様式/空ページは汎用ノートに置換し検証を省略。

### `assemble-corpus.ts`

workflow 結果から corpus を決定的に組み立てる。見出し(H1)/脚注("---" 以降)は **raw を正本**として全ページ採用、本文は `final_body`(null は raw 本文)、metadata に `content_type` を付与、全ページの脚注整合を検証。

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `--results=<json>` | (必須) | workflow の `.result.results` を抽出した JSON |
| `--raw=<dir>` | `tmp/medical-care-law-rag/raw-audit` | raw best-OCR の .md |
| `--corpus=<dir>` | `terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/2026-06-16` | 出力 corpus |

```bash
jq '.result.results' <workflow-output> > tmp/medical-care-law-rag/cleanup-results.json
bun run tools/medical-care-law-rag/assemble-corpus.ts \
  --results=tmp/medical-care-law-rag/cleanup-results.json
```

## テスト

`generate-textbook-corpus.test.ts` が manifest パース・section 判定・ページ計画・tesseract 言語 fail-fast・OCR 品質判定・metadata 生成等の純粋関数を検証する(`bun run test`)。`*.workflow.mjs` は Workflow ランタイム前提(top-level return / 注入グローバル)のため biome 対象外(`biome.json`)。
