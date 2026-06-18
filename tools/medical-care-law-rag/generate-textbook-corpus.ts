/**
 * 保険診療基本法令テキストブック RAG 用 corpus generator（ローカル OCR one-shot）。
 *
 * `tmp/保険診療基本法令テキストブック/` の章別分割 PDF（画像スキャン・全260ページ）を
 * `pdftoppm` でページ画像化し、`tesseract`（既定 `jpn+eng`）で OCR して、ページ単位の Markdown
 * chunk と Bedrock Knowledge Base 用 metadata sidecar（`<source>.md.metadata.json`）を生成する。
 *
 * source of truth は OCR で起こした repo 管理の Markdown corpus とこの generator。OCR review manifest
 * は ingestion 対象 prefix（`data/medical-care-law/`）の外（`data/medical-care-law-manifests/`）に置く。
 *
 * 使い方:
 *   bun run tools/medical-care-law-rag/generate-textbook-corpus.ts
 *   bun run tools/medical-care-law-rag/generate-textbook-corpus.ts --input-dir=tmp/保険診療基本法令テキストブック
 *   bun run tools/medical-care-law-rag/generate-textbook-corpus.ts --lang=jpn+eng --dpi=300
 *   bun run tools/medical-care-law-rag/generate-textbook-corpus.ts --allow-empty-pages
 *
 * 前提: ローカルに `pdfinfo` / `pdftoppm` / `tesseract` と、日本語 OCR 用の tesseract language data
 * （少なくとも `jpn`）が必要。無い場合は corpus を 1 ファイルも生成せず fail-fast する（macOS なら
 * `brew install tesseract-lang` で導入できる）。
 *
 * 本データは画像 PDF を OCR で文字起こしした内部参照用であり、診療報酬請求・法令解釈・行政手続の
 * 最終判断ではない。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- 固定対象（corpus scope）---
export const CORPUS_ID = "medical-care-law-basic-law-textbook";
export const SOURCE_TITLE = "保険診療 基本法令テキストブック";
/** 登録設計日を暫定 corpus version とする（出力 directory 名と一致させる）。 */
export const CORPUS_VERSION = "2026-06-16";
export const DEFAULT_INPUT_DIR = "tmp/保険診療基本法令テキストブック";
export const MANIFEST_FILE = "chapter_split_manifest.txt";
export const OCR_ENGINE = "tesseract";
export const DEFAULT_OCR_LANG = "jpn+eng";
export const DEFAULT_DPI = 300;
export const EXPECTED_PDF_COUNT = 9;
export const EXPECTED_TOTAL_PAGES = 260;
export const GENERATOR =
  "wel-agents-poc/tools/medical-care-law-rag/generate-textbook-corpus.ts";
export const PROCESSOR = "WEL Agents PoC";
export const DISCLAIMER =
  "本データは画像 PDF を OCR で文字起こしした内部参照用であり、診療報酬請求・法令解釈・行政手続の最終判断ではない。";

/**
 * Bedrock Knowledge Base の metadata sidecar 1 ファイルの byte 上限（公式 docs は 10KB）。
 * 超過すると ingestion が対象文書を無視するため、生成時に厳格に守る。本 corpus の sidecar は
 * citation / filter に必要な最小 key のみで数百 bytes に収まる。
 */
export const MAX_METADATA_BYTES = 10 * 1024;

/** 文字数がこれ未満のページは「低テキスト候補」として manifest の手確認対象に載せる。 */
export const LOW_CHAR_THRESHOLD = 20;
/** 平均 OCR 信頼度がこれ未満のページは「低信頼度候補」として manifest の手確認対象に載せる。 */
export const LOW_CONFIDENCE_THRESHOLD = 60;

// --- 章分割 manifest のパース ---
export type Section = "front_matter" | "chapter" | "reference" | "colophon";

export type ChapterEntry = {
  /** 分割 PDF のファイル名（例: "01_chapter-1_iryo-hoken-seido-no-gaiyo.pdf"）。 */
  pdfFile: string;
  /** manifest 上の title（例: "第1章 医療保険制度の概要"）。 */
  title: string;
  /** 原本 PDF 上の page range 表記（例: "02.pdf:6-41, 03.pdf:1-53"）。 */
  sourceRanges: string;
  /** 分割 PDF のページ数。 */
  pages: number;
  section: Section;
  /** chapter section のときのみ章番号（1..6）。 */
  chapterNumber?: number;
};

export type ParsedManifest = {
  entries: ChapterEntry[];
  /** manifest 末尾に宣言された出力総ページ数。 */
  declaredTotalOutputPages: number;
};

/** 分割 PDF のファイル名から section と章番号を判定する。 */
export function classifyPdf(pdfFile: string): {
  section: Section;
  chapterNumber?: number;
} {
  const base = pdfFile.replace(/\.pdf$/i, "");
  const chapterMatch = /^\d+_chapter-(\d+)_/.exec(base);
  if (chapterMatch) {
    return { section: "chapter", chapterNumber: Number(chapterMatch[1]) };
  }
  if (/^\d+_front_matter(?:_|$)/.test(base)) {
    return { section: "front_matter" };
  }
  if (/^\d+_reference(?:_|$)/.test(base)) {
    return { section: "reference" };
  }
  if (/^\d+_colophon(?:_|$)/.test(base)) {
    return { section: "colophon" };
  }
  throw new Error(`section を判定できない PDF 名です: "${pdfFile}"`);
}

/**
 * `chapter_split_manifest.txt` を構造化する。
 *
 * 各 PDF ブロックは「`<n>_*.pdf` 行」+ インデントされた `title:` / `source ranges:` / `pages:` で
 * 構成される。末尾の `total output pages:` を宣言値として取り出す。
 */
export function parseChapterManifest(text: string): ParsedManifest {
  const lines = text.split(/\r?\n/);
  const entries: ChapterEntry[] = [];
  let current: Partial<ChapterEntry> & { pdfFile?: string } = {};
  let declaredTotalOutputPages = 0;

  const flush = (): void => {
    if (!current.pdfFile) {
      return;
    }
    if (current.title === undefined) {
      throw new Error(`manifest: ${current.pdfFile} に title がありません。`);
    }
    if (current.pages === undefined) {
      throw new Error(`manifest: ${current.pdfFile} に pages がありません。`);
    }
    const { section, chapterNumber } = classifyPdf(current.pdfFile);
    entries.push({
      pdfFile: current.pdfFile,
      title: current.title,
      sourceRanges: current.sourceRanges ?? "",
      pages: current.pages,
      section,
      ...(chapterNumber !== undefined ? { chapterNumber } : {}),
    });
    current = {};
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const pdfMatch = /^(\d+_\S+\.pdf)\s*$/.exec(line.trim());
    if (pdfMatch) {
      flush();
      current = { pdfFile: pdfMatch[1] };
      continue;
    }
    const totalMatch = /^total output pages:\s*(\d+)/.exec(line.trim());
    if (totalMatch) {
      declaredTotalOutputPages = Number(totalMatch[1]);
      continue;
    }
    if (!current.pdfFile) {
      continue;
    }
    const titleMatch = /^title:\s*(.+)$/.exec(line.trim());
    if (titleMatch) {
      current.title = (titleMatch[1] ?? "").trim();
      continue;
    }
    const rangesMatch = /^source ranges:\s*(.+)$/.exec(line.trim());
    if (rangesMatch) {
      current.sourceRanges = (rangesMatch[1] ?? "").trim();
      continue;
    }
    const pagesMatch = /^pages:\s*(\d+)\s*$/.exec(line.trim());
    if (pagesMatch) {
      current.pages = Number(pagesMatch[1]);
    }
  }
  flush();

  return { entries, declaredTotalOutputPages };
}

/**
 * パース済み manifest が期待形状（9PDF・合計260ページ・宣言値一致）かを検証する。
 * 形状が崩れたら corpus を生成する前に明確に失敗させる。
 */
export function assertManifestShape(parsed: ParsedManifest): void {
  if (parsed.entries.length !== EXPECTED_PDF_COUNT) {
    throw new Error(
      `manifest の PDF 数が期待値と異なります（expected ${EXPECTED_PDF_COUNT}, actual ${parsed.entries.length}）。`,
    );
  }
  const sum = parsed.entries.reduce((acc, entry) => acc + entry.pages, 0);
  if (sum !== EXPECTED_TOTAL_PAGES) {
    throw new Error(
      `manifest のページ合計が期待値と異なります（expected ${EXPECTED_TOTAL_PAGES}, actual ${sum}）。`,
    );
  }
  if (
    parsed.declaredTotalOutputPages !== 0 &&
    parsed.declaredTotalOutputPages !== EXPECTED_TOTAL_PAGES
  ) {
    throw new Error(
      `manifest 宣言の total output pages が期待値と異なります（expected ${EXPECTED_TOTAL_PAGES}, actual ${parsed.declaredTotalOutputPages}）。`,
    );
  }
}

// --- ページ計画（OCR せずに全260ページの出力計画を決める純粋関数）---
export type PagePlan = {
  /** 1..260 の通し出力ページ番号。 */
  outputPage: number;
  section: Section;
  /** chapter 番号文字列（"1".."6"）。chapter 以外は ""。 */
  chapter: string;
  /** chapter title（chapter 以外は section title）。 */
  chapterTitle: string;
  /** 分割 PDF のファイル名。 */
  sourceFile: string;
  /** 分割 PDF 内の 1-based ページ番号。 */
  sourcePage: number;
  /** 拡張子なしの出力ファイル名 base（例: "chapter-01-page-007"）。 */
  fileBase: string;
};

/** section / chapter / 出力ページから安定したファイル名 base を作る。 */
export function pageFileBase(
  section: Section,
  chapterNumber: number | undefined,
  outputPage: number,
): string {
  const page = String(outputPage).padStart(3, "0");
  if (section === "chapter") {
    if (chapterNumber === undefined) {
      throw new Error("chapter section には chapterNumber が必要です。");
    }
    return `chapter-${String(chapterNumber).padStart(2, "0")}-page-${page}`;
  }
  if (section === "front_matter") {
    return `front-matter-page-${page}`;
  }
  return `${section}-page-${page}`;
}

/** manifest の entry 群を、全ページの出力計画（通しページ番号付き）に展開する。 */
export function planPages(entries: ChapterEntry[]): PagePlan[] {
  const plans: PagePlan[] = [];
  let outputPage = 1;
  for (const entry of entries) {
    for (let sourcePage = 1; sourcePage <= entry.pages; sourcePage++) {
      plans.push({
        outputPage,
        section: entry.section,
        chapter:
          entry.chapterNumber !== undefined ? String(entry.chapterNumber) : "",
        chapterTitle: entry.title,
        sourceFile: entry.pdfFile,
        sourcePage,
        fileBase: pageFileBase(entry.section, entry.chapterNumber, outputPage),
      });
      outputPage++;
    }
  }
  return plans;
}

// --- tesseract language data の検証 ---
/** `tesseract --list-langs` の出力から利用可能 language コード一覧を取り出す。 */
export function parseTesseractLangs(listLangsOutput: string): string[] {
  return listLangsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/available languages/i.test(line));
}

/**
 * OCR language 文字列（例: "jpn+eng"）の各成分が available language に含まれるか検証する。
 * 1 つでも欠けていれば、corpus を生成する前に欠けた language を明示して fail-fast する。
 */
export function assertOcrLangsAvailable(
  available: string[],
  lang: string = DEFAULT_OCR_LANG,
): void {
  const required = lang
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const availableSet = new Set(available);
  const missing = required.filter((code) => !availableSet.has(code));
  if (missing.length > 0) {
    throw new Error(
      `tesseract に必要な language data がありません: ${missing.join(", ")}（available: ${available.join(", ") || "なし"}）。\n` +
        `日本語 OCR 用の language data を導入してください（macOS: brew install tesseract-lang）。`,
    );
  }
}

// --- OCR 品質判定 ---
export type PageQuality = {
  empty: boolean;
  lowText: boolean;
  lowConfidence: boolean;
};

/** ページの文字数と平均信頼度から品質フラグを立てる。 */
export function classifyPageQuality(
  charCount: number,
  avgConfidence: number | undefined,
): PageQuality {
  return {
    empty: charCount === 0,
    lowText: charCount > 0 && charCount < LOW_CHAR_THRESHOLD,
    lowConfidence:
      avgConfidence !== undefined && avgConfidence < LOW_CONFIDENCE_THRESHOLD,
  };
}

/**
 * tesseract TSV 出力から word 単位 conf の平均を求める（text が空・conf<0 の行は除外）。
 * 有効な word が 1 つも無ければ undefined。
 */
export function averageConfidenceFromTsv(tsv: string): number | undefined {
  const lines = tsv.split(/\r?\n/);
  let sum = 0;
  let count = 0;
  for (const line of lines) {
    const cols = line.split("\t");
    // header 行（level=="level"）や列不足行はスキップ。conf は 11 列目、text は 12 列目。
    if (cols.length < 12 || cols[0] === "level") {
      continue;
    }
    const conf = Number(cols[10]);
    const word = cols[11]?.trim() ?? "";
    if (word.length === 0 || !Number.isFinite(conf) || conf < 0) {
      continue;
    }
    sum += conf;
    count++;
  }
  return count > 0 ? sum / count : undefined;
}

// --- Markdown / metadata 生成 ---
export type PageRenderInput = {
  plan: PagePlan;
  ocrText: string;
  ocrEngine: string;
  ocrLang: string;
  generatedAt: string;
};

/** 1 ページ分の OCR テキストを Markdown chunk に整形する（末尾に出典 / disclaimer ブロック）。 */
export function renderPageMarkdown(input: PageRenderInput): string {
  const { plan, ocrText, ocrEngine, ocrLang, generatedAt } = input;
  const heading = `# ${SOURCE_TITLE}｜${plan.chapterTitle}（出力ページ ${plan.outputPage}）`;
  const body = ocrText.trim();
  const sourceLine =
    `> 出典: ${SOURCE_TITLE}（${plan.chapterTitle}） / source: ${plan.sourceFile} p.${plan.sourcePage}` +
    ` / 出力ページ ${plan.outputPage} / OCR: ${ocrEngine} (${ocrLang}) / 生成: ${generatedAt}`;
  return `${heading}\n\n${body}\n\n---\n\n${sourceLine}\n> ${DISCLAIMER}\n`;
}

export type PageMetadata = {
  metadataAttributes: Record<string, string>;
};

/**
 * Bedrock S3 metadata sidecar の `metadataAttributes` を、citation / filter に必要な最小 key で組む。
 * 詳細な出典・加工情報は ingestion 対象外の manifest と Markdown 末尾の出典ブロックに逃がす。
 */
export function buildPageMetadata(input: {
  plan: PagePlan;
  ocrEngine: string;
  ocrLang: string;
  generatedAt: string;
}): PageMetadata {
  const { plan, ocrEngine, ocrLang, generatedAt } = input;
  return {
    metadataAttributes: {
      corpus_id: CORPUS_ID,
      source_title: SOURCE_TITLE,
      section: plan.section,
      chapter: plan.chapter,
      chapter_title: plan.chapterTitle,
      source_file: plan.sourceFile,
      source_page: String(plan.sourcePage),
      output_page: String(plan.outputPage),
      ocr_engine: ocrEngine,
      ocr_lang: ocrLang,
      generated_at: generatedAt,
    },
  };
}

/** metadata sidecar を JSON 文字列化したときの UTF-8 byte size（実ファイルと一致）。 */
export function metadataByteSize(metadata: PageMetadata): number {
  return Buffer.byteLength(toJson(metadata), "utf8");
}

// --- CLI / I/O ---
type CliArgs = {
  inputDir: string;
  lang: string;
  dpi: number;
  /** tesseract の Page Segmentation Mode（未指定なら tesseract 既定の 3=auto）。 */
  psm: number | undefined;
  /** tesseract の language data ディレクトリ（未指定なら system 既定。tessdata_best 利用時に指定）。 */
  tessdataDir: string | undefined;
  allowEmptyPages: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
  let inputDir = DEFAULT_INPUT_DIR;
  let lang = DEFAULT_OCR_LANG;
  let dpi = DEFAULT_DPI;
  let psm: number | undefined;
  let tessdataDir: string | undefined;
  let allowEmptyPages = false;
  for (const arg of argv) {
    if (arg.startsWith("--input-dir=")) {
      inputDir = arg.slice("--input-dir=".length).trim();
    } else if (arg.startsWith("--lang=")) {
      lang = arg.slice("--lang=".length).trim();
    } else if (arg.startsWith("--dpi=")) {
      const parsed = Number(arg.slice("--dpi=".length).trim());
      if (Number.isInteger(parsed) && parsed > 0) {
        dpi = parsed;
      }
    } else if (arg.startsWith("--psm=")) {
      const parsed = Number(arg.slice("--psm=".length).trim());
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 13) {
        psm = parsed;
      }
    } else if (arg.startsWith("--tessdata-dir=")) {
      tessdataDir = arg.slice("--tessdata-dir=".length).trim() || undefined;
    } else if (arg === "--allow-empty-pages") {
      allowEmptyPages = true;
    }
  }
  return { inputDir, lang, dpi, psm, tessdataDir, allowEmptyPages };
}

/** tesseract に渡す共通オプション（tessdata ディレクトリ指定があれば付与）。 */
export function tesseractBaseArgs(tessdataDir: string | undefined): string[] {
  return tessdataDir ? ["--tessdata-dir", tessdataDir] : [];
}

function repoRoot(): string {
  // tools/medical-care-law-rag/<file> → repo root は 2 つ上。
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** 外部コマンドを同期実行し、stdout を返す（失敗時は stderr を含めて throw）。 */
function runCommand(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args]);
  if (!result.success) {
    const stderr = result.stderr.toString().trim();
    throw new Error(
      `コマンド失敗: ${command} ${args.join(" ")}\n${stderr || `exit ${result.exitCode}`}`,
    );
  }
  return result.stdout.toString();
}

/** pdfinfo でページ数を取得する。 */
function pdfPageCount(pdfPath: string): number {
  const out = runCommand("pdfinfo", [pdfPath]);
  const match = /^Pages:\s*(\d+)/m.exec(out);
  if (!match) {
    throw new Error(`pdfinfo の出力からページ数を取得できません: ${pdfPath}`);
  }
  return Number(match[1]);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const { inputDir, lang, dpi, psm, tessdataDir, allowEmptyPages } =
    parseCliArgs(Bun.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const root = repoRoot();
  const absInputDir = join(root, inputDir);
  const absTessdataDir = tessdataDir
    ? isAbsolute(tessdataDir)
      ? tessdataDir
      : join(root, tessdataDir)
    : undefined;

  // 1. 章分割 manifest を読み、形状を検証する。
  const manifestPath = join(absInputDir, MANIFEST_FILE);
  const manifestText = await readFile(manifestPath, "utf8");
  const parsed = parseChapterManifest(manifestText);
  assertManifestShape(parsed);
  console.log(
    `[OK] manifest: ${parsed.entries.length} PDFs / ${EXPECTED_TOTAL_PAGES} pages`,
  );

  // 2. tesseract の language data を corpus 生成前に検証（fail-fast）。
  const langs = parseTesseractLangs(
    runCommand("tesseract", [
      ...tesseractBaseArgs(absTessdataDir),
      "--list-langs",
    ]),
  );
  assertOcrLangsAvailable(langs, lang);
  console.log(
    `[OK] tesseract languages OK for "${lang}"${absTessdataDir ? ` (tessdata: ${absTessdataDir})` : ""}`,
  );

  // 3. 各 PDF のページ数を pdfinfo で検証しつつ hash を取る。
  const pdfRecords: Array<{
    file: string;
    title: string;
    section: Section;
    chapter_number?: number;
    source_ranges: string;
    pages: number;
    sha256: string;
  }> = [];
  for (const entry of parsed.entries) {
    const pdfPath = join(absInputDir, entry.pdfFile);
    const bytes = await readFile(pdfPath);
    const actualPages = pdfPageCount(pdfPath);
    if (actualPages !== entry.pages) {
      throw new Error(
        `PDF のページ数が manifest と異なります: ${entry.pdfFile}（manifest ${entry.pages}, pdfinfo ${actualPages}）。`,
      );
    }
    pdfRecords.push({
      file: entry.pdfFile,
      title: entry.title,
      section: entry.section,
      ...(entry.chapterNumber !== undefined
        ? { chapter_number: entry.chapterNumber }
        : {}),
      source_ranges: entry.sourceRanges,
      pages: entry.pages,
      sha256: sha256(bytes),
    });
  }
  console.log(
    `[OK] verified page counts + hashes for ${pdfRecords.length} PDFs`,
  );

  // 4. 出力 / 中間 directory を作り直す（決定論的な再生成のため）。
  const corpusDir = join(
    root,
    "terraform/aws/agentcore/data/medical-care-law/basic-law-textbook",
    CORPUS_VERSION,
  );
  const manifestDir = join(
    root,
    "terraform/aws/agentcore/data/medical-care-law-manifests/basic-law-textbook",
    CORPUS_VERSION,
  );
  const tmpDir = join(root, "tmp", "medical-care-law-rag");
  await rm(corpusDir, { recursive: true, force: true });
  await rm(manifestDir, { recursive: true, force: true });
  // 中間画像/OCR ファイルの tmp も作り直し、前回の中断実行で残った成果物を持ち越さない。
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(corpusDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  // 5. 全ページの出力計画を立て、ページ単位に OCR して Markdown + metadata を書く。
  const plans = planPages(parsed.entries);
  const pageRecords: Array<{
    output_page: number;
    file: string;
    section: Section;
    chapter: string;
    chapter_title: string;
    source_file: string;
    source_page: number;
    char_count: number;
    avg_confidence: number | null;
    empty: boolean;
    low_text: boolean;
    low_confidence: boolean;
  }> = [];
  const emptyPages: number[] = [];
  const lowTextPages: number[] = [];
  const lowConfidencePages: number[] = [];
  let maxMetadataBytes = 0;

  for (const plan of plans) {
    const pdfPath = join(absInputDir, plan.sourceFile);
    const imageBase = join(tmpDir, plan.fileBase);
    // 1 ページを単一画像に変換する（-singlefile で page suffix を付けない）。
    runCommand("pdftoppm", [
      "-png",
      "-r",
      String(dpi),
      "-f",
      String(plan.sourcePage),
      "-l",
      String(plan.sourcePage),
      "-singlefile",
      pdfPath,
      imageBase,
    ]);
    const imagePath = `${imageBase}.png`;
    const tsvBase = join(tmpDir, `${plan.fileBase}-ocr`);
    // txt と tsv を 1 回の OCR で出力する。日本語では字間に余計な空白が入りやすいため
    // preserve_interword_spaces=1 で原画像の字間を尊重する。
    runCommand("tesseract", [
      imagePath,
      tsvBase,
      "-l",
      lang,
      ...(psm !== undefined ? ["--psm", String(psm)] : []),
      "-c",
      "preserve_interword_spaces=1",
      ...tesseractBaseArgs(absTessdataDir),
      "txt",
      "tsv",
    ]);
    const ocrText = (await readFile(`${tsvBase}.txt`, "utf8")).trim();
    const tsv = await readFile(`${tsvBase}.tsv`, "utf8");
    // 読み終えた中間ファイルは即削除し、260ページ分の PNG/TSV/TXT を tmp に溜めない
    // （後段で throw しても、ここまでの中間ファイルは残らない）。
    await rm(imagePath, { force: true });
    await rm(`${tsvBase}.txt`, { force: true });
    await rm(`${tsvBase}.tsv`, { force: true });
    const avgConfidence = averageConfidenceFromTsv(tsv);
    const charCount = ocrText.replace(/\s/g, "").length;
    const quality = classifyPageQuality(charCount, avgConfidence);

    if (quality.empty) {
      emptyPages.push(plan.outputPage);
      if (!allowEmptyPages) {
        throw new Error(
          `OCR 結果が空のページがあります（出力ページ ${plan.outputPage}, ${plan.sourceFile} p.${plan.sourcePage}）。` +
            `内容を確認し、意図的に許容する場合は --allow-empty-pages を付けて再実行してください。`,
        );
      }
    }
    if (quality.lowText) {
      lowTextPages.push(plan.outputPage);
    }
    if (quality.lowConfidence) {
      lowConfidencePages.push(plan.outputPage);
    }

    const mdName = `${plan.fileBase}.md`;
    await writeFile(
      join(corpusDir, mdName),
      renderPageMarkdown({
        plan,
        ocrText,
        ocrEngine: OCR_ENGINE,
        ocrLang: lang,
        generatedAt,
      }),
      "utf8",
    );
    const metadata = buildPageMetadata({
      plan,
      ocrEngine: OCR_ENGINE,
      ocrLang: lang,
      generatedAt,
    });
    const bytes = metadataByteSize(metadata);
    maxMetadataBytes = Math.max(maxMetadataBytes, bytes);
    if (bytes >= MAX_METADATA_BYTES) {
      throw new Error(
        `metadata sidecar が Bedrock 上限 (${MAX_METADATA_BYTES} bytes) 以上です: ` +
          `${mdName}.metadata.json = ${bytes} bytes。metadata を削減してください。`,
      );
    }
    await writeFile(
      join(corpusDir, `${mdName}.metadata.json`),
      toJson(metadata),
      "utf8",
    );

    pageRecords.push({
      output_page: plan.outputPage,
      file: mdName,
      section: plan.section,
      chapter: plan.chapter,
      chapter_title: plan.chapterTitle,
      source_file: plan.sourceFile,
      source_page: plan.sourcePage,
      char_count: charCount,
      avg_confidence: avgConfidence ?? null,
      empty: quality.empty,
      low_text: quality.lowText,
      low_confidence: quality.lowConfidence,
    });
  }

  // 6. OCR review manifest を ingestion 対象外の prefix に書く。
  const manualReview = Array.from(
    new Set([...emptyPages, ...lowTextPages, ...lowConfidencePages]),
  ).sort((a, b) => a - b);
  const manifest = {
    generator: GENERATOR,
    processor: PROCESSOR,
    corpus_id: CORPUS_ID,
    source_title: SOURCE_TITLE,
    corpus_version: CORPUS_VERSION,
    disclaimer: DISCLAIMER,
    generated_at: generatedAt,
    ocr: {
      engine: OCR_ENGINE,
      lang,
      dpi,
      psm: psm ?? null,
      tessdata_dir: tessdataDir ?? null,
      preserve_interword_spaces: true,
    },
    input: {
      dir: inputDir,
      manifest_file: MANIFEST_FILE,
      expected_pdf_count: EXPECTED_PDF_COUNT,
      total_output_pages: EXPECTED_TOTAL_PAGES,
    },
    pdfs: pdfRecords,
    pages: pageRecords,
    low_quality: {
      empty_pages: emptyPages,
      low_text_pages: lowTextPages,
      low_confidence_pages: lowConfidencePages,
      manual_review: manualReview,
    },
  };
  await writeFile(join(manifestDir, "manifest.json"), toJson(manifest), "utf8");

  console.log(
    `[OK] wrote ${pageRecords.length} Markdown pages + metadata to ${corpusDir}`,
  );
  console.log(
    `[OK] max metadata sidecar size = ${maxMetadataBytes} bytes (limit ${MAX_METADATA_BYTES})`,
  );
  console.log(
    `[INFO] manual-review pages: ${manualReview.length} (empty ${emptyPages.length}, low-text ${lowTextPages.length}, low-confidence ${lowConfidencePages.length})`,
  );
  console.log(`[OK] wrote manifest to ${join(manifestDir, "manifest.json")}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      `[NG] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
