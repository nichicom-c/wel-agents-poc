---
name: medical-care-law-corpus
description: 保険診療基本法令テキストブックのスキャン PDF から medical_care_law RAG corpus を(再)生成する手順。tessdata_best で再OCR → LLM 整形(ノイズ除去/保守的誤字修正/段落整形/図表ページのノート化) → ハルシネーション検証→保守的修復→raw フォールバックで捏造ゼロ化 → 決定的に corpus 組み立て。corpus の再生成・OCR 品質改善・整形パイプラインの再実行時に使う。
---

# medical-care-law-corpus 生成パイプライン

`tmp/保険診療基本法令テキストブック/` のスキャン PDF(画像・全260ページ)から、`medical_care_law` ドメインの RAG corpus(`terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/<version>/`)を再現可能に生成する手順。

決定的処理(OCR・組み立て)は committed の bun スクリプト、LLM 工程(整形/検証/修復)は **Claude Code の Workflow ツール**で実行する(standalone な bun だけでは完結しない)。

## 設計の要点(なぜこの形か)

- **捏造ゼロが最優先。** LLM 整形はきれいなページでは優秀だが、文字化け・途中切れページでは条番号・年号・文の続きを「もっともらしく」捏造する。法令 corpus では捏造は OCR 文字化けより危険。→ 全ページを **verify(捏造検査)** にかけ、捏造ページは **repair(保守的再整形: 途中切れ補完・判読不能埋めを禁止)** し、**reverify** でなお捏造が残れば **raw 本文へフォールバック**(確実に忠実)する。
- **見出し(H1)と脚注ブロック("---" 以降)は raw best-OCR を正本**として全ページ採用し、整合を検証する。LLM には本文だけを触らせる。
- **エージェントにファイルを書かせない。** 整形後本文は構造化出力で返し、実ファイルの書き込みは決定的な `assemble-corpus.ts` が行う(過去にエージェントの書き込み先ズレが発生したため)。
- **Workflow の args に頼らない。** `cleanup-corpus.workflow.mjs` では args(scalar/配列とも)が届かない事象があったため、入力パス(`RAW_DIR`)と pilot 件数(`LIMIT`)はスクリプト先頭の定数で設定する。ページ列も scripts 内で生成する。

## 関連ファイル

- `tools/medical-care-law-rag/generate-textbook-corpus.ts` — PDF→画像(pdftoppm)→OCR(tesseract)→ページ単位 Markdown + metadata sidecar + review manifest。`--tessdata-dir` / `--psm` / `--allow-empty-pages` 対応。
- `tools/medical-care-law-rag/setup-tessdata-best.sh` — tessdata_best(jpn/eng/jpn_vert)取得 + configs コピー。
- `tools/medical-care-law-rag/cleanup-corpus.workflow.mjs` — 統合整形 workflow(clean→verify→repair→reverify→raw fallback)。本文を返すだけ。
- `tools/medical-care-law-rag/assemble-corpus.ts` — workflow 結果から corpus を決定的に組み立て(見出し/脚注=raw 正本、metadata content_type 付与、脚注整合検証)。
- `tools/medical-care-law-rag/README.md` — 各スクリプトの引数詳細。

## 手順

`<version>` は corpus 版ディレクトリ名(現行 `2026-06-16`。generator の `CORPUS_VERSION` と一致させる)。コマンドはリポジトリルートで実行(mise activate 済み前提、未活性なら各コマンドに `mise exec -- ` を付ける)。

### 0. 前提

```bash
command -v pdftoppm pdfinfo tesseract   # 必要
ls tmp/保険診療基本法令テキストブック/chapter_split_manifest.txt   # 入力(9PDF + manifest)
```

### 1. tessdata_best を用意(日本語高精度 OCR)

```bash
bash tools/medical-care-law-rag/setup-tessdata-best.sh tmp/tessdata-best
```

system の tesseract に日本語 data が無くても、このスクリプトが tessdata_best を `tmp/tessdata-best/` に用意する(モデルは大きいので gitignore 済み tmp に置く)。

### 2. 再OCR(raw best-OCR を生成)

```bash
bun run tools/medical-care-law-rag/generate-textbook-corpus.ts \
  --tessdata-dir=tmp/tessdata-best --allow-empty-pages
```

- 全260ページを `tessdata_best` + `preserve_interword_spaces=1` で OCR し、corpus ディレクトリに raw を書く。
- 図版/章区切り等の空ページがあるため `--allow-empty-pages` を付ける(空ページは manifest に記録され、後段で figure/blank ノート化される)。

### 3. raw を退避(検証/フォールバック/組み立ての正本)

```bash
mkdir -p tmp/medical-care-law-rag/raw-audit
cp terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/<version>/*.md \
   tmp/medical-care-law-rag/raw-audit/
```

以降、corpus の本文は LLM が書き換えるが、`raw-audit` は raw best-OCR を保持し続ける(監査・フォールバック・脚注正本)。

### 4. 整形 workflow を実行(LLM: clean→verify→repair→reverify)

`cleanup-corpus.workflow.mjs` 先頭の **実行設定**を編集してから、Claude Code の **Workflow ツール**で起動する(args は本スクリプトでは安定して届かないため定数で設定する):

- `RAW_DIR`: `<REPO_ROOT>` を実際のリポジトリ絶対パスに置換(raw-audit を指す)。
- `LIMIT`: まず `4` 等にして数ページの pilot で動作確認 → 問題なければ `0`(全260ページ)にして本番実行。

```
Workflow({ scriptPath: "<repo>/tools/medical-care-law-rag/cleanup-corpus.workflow.mjs" })
```

完了すると結果(`.result.results = [{file, content_type, final_body|null, stage}]`)が出力ファイルに入る。`stage` は `clean`/`repair`/`raw-fallback`/`clean-failed`。`final_body=null` は raw 本文採用。pilot で 4ページ動いたら `LIMIT=0` で本番(約70分・数百エージェント)。

### 5. 結果を抽出して corpus を組み立て(決定的)

```bash
# workflow の出力ファイル(<task>.output)から results 配列を抽出
jq '.result.results' <workflow-output-file> > tmp/medical-care-law-rag/cleanup-results.json

bun run tools/medical-care-law-rag/assemble-corpus.ts \
  --results=tmp/medical-care-law-rag/cleanup-results.json \
  --raw=tmp/medical-care-law-rag/raw-audit \
  --corpus=terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/<version>
```

見出し/脚注は raw 正本で組み立て直し、metadata に content_type を付与、脚注整合を検証する(不一致は失敗)。

### 6. 品質ゲート

```bash
bun run test && bun run typecheck && bun run check
mise exec -- terraform -chdir=terraform/aws/agentcore fmt -check
mise exec -- terraform -chdir=terraform/aws/agentcore validate
# metadata sidecar が 10KB 未満か(generator/assembler が守るが念のため)
```

整形結果の妥当性確認: 本文ページで柱/ページ番号が消え誤字が直っているか、figure_or_form ページがノートに置換されているか、文字化け箇所が捏造されず残っているか(`昭和N年`/`第N条` の不正補完が無いか)を数ページ目視する。

### 7. コミット

corpus(`data/medical-care-law/.../<version>/`)と manifest を commit する。`raw-audit` 等 `tmp/` は gitignore 済みで commit しない。

## 別資料・別版に適用する場合

PDF 構成(章分割・ページ範囲)が異なる場合は、`generate-textbook-corpus.ts` の `SECTIONS`/`CORPUS_VERSION` 等と `cleanup-corpus.workflow.mjs` の `SECTIONS`(ページ列生成)を入力に合わせて更新する。section 判定・section 名は `generate-textbook-corpus.ts` の `classifyPdf`/`pageFileBase` に従う。整形・検証・修復のプロンプト方針(捏造禁止)はそのまま再利用できる。
