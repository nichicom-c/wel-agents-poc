/**
 * 保険診療基本法令テキストブック OCR corpus の整形ワークフロー（統合・単一パイプライン）。
 *
 * 各ページを per-page で clean → verify → (捏造なら repair → reverify → なお捏造なら raw fallback)
 * の順に処理する。エージェントはファイルを書かず、整形後【本文だけ】を構造化出力で返す。実ファイルの
 * 組み立て（見出し/脚注は raw 正本、本文は final_body、metadata content_type 付与、脚注整合）は
 * 決定的な assemble-corpus.ts が担当する。これにより「エージェントの書き込み先ズレ」「配列 args の
 * 不安定」を避け、捏造ゼロ（直らないページは raw 本文へ確定フォールバック）を保証する。
 *
 * 入力(args): { rawDir: string(必須・raw best-OCR の .md があるディレクトリ絶対パス), limit?: number(pilot用・先頭N件) }
 * 出力: { total, summary(stage別/content_type別件数), results: [{file, content_type, final_body|null, stage, faithful, additions}] }
 *   - final_body=null かつ stage="raw-fallback" のページは、assembler が raw 本文をそのまま採用する。
 *
 * 実行は Claude Code の Workflow ツール経由（standalone な bun 実行はできない）。手順は
 * `.claude/skills/medical-care-law-corpus/SKILL.md` と `tools/medical-care-law-rag/README.md` を参照。
 */

export const meta = {
  name: "medical-care-law-ocr-cleanup",
  description:
    "OCR ページを整形(ノイズ除去/保守的誤字修正/段落整形/図表ページ判定)し、捏造を検証→保守的修復→raw フォールバックで捏造ゼロにする",
  phases: [
    {
      title: "Clean",
      detail: "ノイズ除去・保守的誤字修正・段落整形・content_type 判定",
    },
    {
      title: "Verify",
      detail: "整形結果が raw に無い内容(条番号/年号/文)を捏造していないか検証",
    },
    {
      title: "Repair",
      detail:
        "捏造ページを raw から保守的に再整形(途中切れ補完・判読不能埋め禁止)",
    },
    {
      title: "Reverify",
      detail: "修復結果を再検証。なお捏造なら raw 本文へフォールバック",
    },
  ],
};

const CLEAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["file", "content_type", "cleaned_body"],
  properties: {
    file: { type: "string" },
    content_type: {
      type: "string",
      enum: [
        "body",
        "figure_or_form",
        "front_matter",
        "toc",
        "colophon",
        "blank",
      ],
    },
    cleaned_body: {
      type: "string",
      description: "H1見出しと脚注を含まない、整形後の本文だけ",
    },
    removed_noise: { type: "array", items: { type: "string" } },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["file", "faithful"],
  properties: {
    file: { type: "string" },
    faithful: { type: "boolean" },
    additions: { type: "array", items: { type: "string" } },
    severity: { type: "string", enum: ["none", "minor", "major"] },
  },
};

// ─── 実行設定(この workflow を起動する前に編集する) ──────────────────────
// Workflow ツールの args は本スクリプトでは安定して届かないため、設定はここに直接書く。
//   RAW_DIR: raw best-OCR(.md)があるディレクトリの【絶対パス】。SKILL.md 手順3 の raw-audit を指す。
//           <REPO_ROOT> を実際のリポジトリ絶対パスに置換する(args.rawDir が届けばそちらを優先)。
//   LIMIT  : pilot 用に先頭N件だけ処理する場合は正の数(例 4)。本番は 0(=全260ページ)。
const RAW_DIR = "<REPO_ROOT>/tmp/medical-care-law-rag/raw-audit";
const LIMIT = 0;
// ──────────────────────────────────────────────────────────────────────
const rawDir =
  args && typeof args.rawDir === "string" && args.rawDir ? args.rawDir : RAW_DIR;
if (rawDir.includes("<REPO_ROOT>")) {
  throw new Error(
    "RAW_DIR の <REPO_ROOT> をリポジトリ絶対パスに置換してください(または args.rawDir を渡す)",
  );
}

// 出力ページ範囲(planPages と一致)から 260 ファイル名を生成する。
const SECTIONS = [
  { prefix: "front-matter", start: 1, end: 6 },
  { prefix: "chapter-01", start: 7, end: 95 },
  { prefix: "chapter-02", start: 96, end: 107 },
  { prefix: "chapter-03", start: 108, end: 119 },
  { prefix: "chapter-04", start: 120, end: 194 },
  { prefix: "chapter-05", start: 195, end: 226 },
  { prefix: "chapter-06", start: 227, end: 250 },
  { prefix: "reference", start: 251, end: 259 },
  { prefix: "colophon", start: 260, end: 260 },
];
const allFiles = [];
for (const s of SECTIONS) {
  for (let p = s.start; p <= s.end; p++) {
    allFiles.push(`${s.prefix}-page-${String(p).padStart(3, "0")}.md`);
  }
}
const limit = Number(args?.limit) || LIMIT;
const files = limit > 0 ? allFiles.slice(0, limit) : allFiles;
log(`cleanup 対象: ${files.length} ページ (rawDir=${rawDir})`);

const CLEAN_RULES = `
■ 行ってよいこと:
- 柱(ランニングヘッダ)・印刷ページ番号・章タイトルの繰り返し・図表ラベル等のノイズ行の除去。
- 改行の連結・段落整形(丸数字・ア/イ/ウ・(1)(2)・第N条 等の構造は保持)。
- 文脈から一意に決まる【一文字単位】の明白な誤字修正のみ(例: 愚者→患者, 商務→責務, 療差→療養)。
■ 厳禁(捏造):
- RAW で途中で切れている文を、続きを書いて完成させること。RAW が切れている箇所は切れたまま残す。
- 文字化け・判読不能な連続(例: HRBRESE, HAE)を、特定の条番号(第N条)・年号(昭和N年/平成N年)・数値・語で埋めること。判読不能な連続はそのまま残す。
- RAW に(文字化け含め)現れない文・節・句・数値・固有名詞を足すこと。
■ content_type 判定: body / figure_or_form(表組み/帳票/図版が大半で OCR が文字化け。例: 診療報酬明細書=レセプト様式) / front_matter / toc / colophon / blank。
  figure_or_form と blank は内容を創作しない短い汎用ノートに置換する(例: "このページは〇〇の様式(帳票画像)であり、検索対象の本文テキストはありません。" / "このページには本文がありません。")。判明している章・見出しのみ根拠にし様式の中身は創作しない。`;

const cleanPrompt = (
  file,
) => `日本語の医療保険制度テキストブックを OCR したページ Markdown を整形します。

RAW(元データ・読み取り専用。文字化けや途中切れを含む): ${rawDir}/${file}

手順:
1. RAW を Read。1行目は "# ..." の H1 見出し、末尾は "---" 区切りの後に脚注。整形対象は H1 と "---" の間の【本文だけ】。
${CLEAN_RULES}
2. 整形後の【本文だけ】(H1 見出しと "---" 以降の脚注は含めない)を cleaned_body として返す。file="${file}"、content_type、removed_noise も返す。

重要: ファイルへの Write はしない。cleaned_body を構造化出力で返すだけ。翻訳しない(日本語のまま)。`;

const verifyPrompt = (
  file,
  candidateBody,
  contentType,
) => `OCR 整形の【ハルシネーション(捏造)検査】を行います。

RAW(元データ・真実。文字化けや途中切れを含む): ${rawDir}/${file}
CANDIDATE(整形後の本文・検査対象。content_type=${contentType}):
"""
${candidateBody}
"""

RAW を Read し、CANDIDATE が RAW に【存在しない情報を新たに加えていないか】を判定する。
■ 許容(faithful=true): 柱/ページ番号/図表ラベル等ノイズの除去、改行連結・段落整形、文脈から一意に決まる【一文字単位】の明白な誤字修正、図表/空ページの内容を創作しない短い汎用ノートへの置換。
■ 捏造(faithful=false。additions に具体箇所、severity=major/minor): RAW に(文字化け含め)現れない文・節・句(特に RAW で途中切れの文の完成)、RAW の判読不能/文字化け箇所を特定の条番号(第N条)・年号(昭和N年/平成N年)・数値・固有名詞で埋めている、一文字修正を超えるドメイン補完。
RAW に断片的にでも根拠がある修正は faithful=true。file="${file}" を必ず返す。`;

const repairPrompt = (
  file,
) => `OCR ページを RAW から【保守的に】整形し直します。このページは前回の整形で RAW に無い内容(条番号・年号・文の続き等)を捏造したことが検査で判明しました。今回は捏造を一切しない方針で作り直します。

RAW(元データ・読み取り専用): ${rawDir}/${file}

手順:
1. RAW を Read。H1 と "---" の間の本文だけが対象。
${CLEAN_RULES}
2. 特に: RAW で途中切れの文は切れたまま残す。文字化け・判読不能な連続は推測で埋めず残す。RAW に無い文・数値・固有名詞を一切足さない。
3. 整形後の【本文だけ】を cleaned_body として返す。file="${file}"、content_type、removed_noise も返す。ファイルへの Write はしない。`;

const PROSE = new Set(["body", "front_matter", "toc", "colophon"]);

phase("Clean");
const results = await pipeline(
  files,
  (file) =>
    agent(cleanPrompt(file), {
      schema: CLEAN_SCHEMA,
      phase: "Clean",
      label: `clean:${file}`,
      agentType: "general-purpose",
    }),
  async (clean, file) => {
    if (!clean)
      return {
        file,
        content_type: "body",
        final_body: null,
        stage: "clean-failed",
        faithful: false,
      };
    // 図表/空ページのノートは汎用文のため検証を省略(創作リスクが低い)。
    if (!PROSE.has(clean.content_type)) {
      return {
        file,
        content_type: clean.content_type,
        final_body: clean.cleaned_body,
        stage: "clean",
        faithful: true,
      };
    }
    // verify
    const v = await agent(
      verifyPrompt(file, clean.cleaned_body, clean.content_type),
      {
        schema: VERIFY_SCHEMA,
        phase: "Verify",
        label: `verify:${file}`,
        agentType: "general-purpose",
      },
    );
    if (v?.faithful) {
      return {
        file,
        content_type: clean.content_type,
        final_body: clean.cleaned_body,
        stage: "clean",
        faithful: true,
      };
    }
    // repair(保守的)
    const r = await agent(repairPrompt(file), {
      schema: CLEAN_SCHEMA,
      phase: "Repair",
      label: `repair:${file}`,
      agentType: "general-purpose",
    });
    if (!r) {
      // repair 失敗 → raw フォールバック(確実に忠実)
      return {
        file,
        content_type: clean.content_type,
        final_body: null,
        stage: "raw-fallback",
        faithful: true,
        additions: v?.additions ?? [],
      };
    }
    // reverify
    const rv = await agent(verifyPrompt(file, r.cleaned_body, r.content_type), {
      schema: VERIFY_SCHEMA,
      phase: "Reverify",
      label: `reverify:${file}`,
      agentType: "general-purpose",
    });
    if (rv?.faithful) {
      return {
        file,
        content_type: r.content_type,
        final_body: r.cleaned_body,
        stage: "repair",
        faithful: true,
      };
    }
    // なお捏造 → raw 本文へフォールバック(assembler が raw 本文を採用)
    return {
      file,
      content_type: r.content_type,
      final_body: null,
      stage: "raw-fallback",
      faithful: true,
      additions: rv?.additions ?? [],
    };
  },
);

const ok = results.filter(Boolean);
const byStage = {};
const byType = {};
for (const r of ok) {
  byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
  byType[r.content_type] = (byType[r.content_type] ?? 0) + 1;
}
log(
  `cleanup 完了: ${ok.length}/${files.length} / stage ${JSON.stringify(byStage)} / type ${JSON.stringify(byType)}`,
);

return {
  total: files.length,
  summary: { byStage, byType },
  results: ok,
}
