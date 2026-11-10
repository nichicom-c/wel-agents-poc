/**
 * 「こう書けばわかる！保健師記録」の Markdown から hokenshi_kiroku RAG corpus を決定的に組み立てる。
 *
 * 入力は PDF から変換済みの結合 Markdown 1 本（`<!-- pdf-page: N -->` でページ境界が入っている）。
 * 出力は medical-care-law corpus と同じ形、すなわち
 *
 *   - 1 ページ = 1 Markdown ファイル（見出し + 本文 + 脚注ブロック）
 *   - 同名の `.metadata.json`（Bedrock Knowledge Base の metadataAttributes）
 *   - ingestion prefix の外側に置く review 用 manifest.json
 *
 * 画像は S3 に上げないため、`![alt](images/...)` は alt text を残した `（図: alt）` に畳む
 * （図版の説明文は検索対象として残したいが、解決できない path を corpus に残さない）。
 *
 * 使い方:
 *   bun run tools/hokenshi-kiroku-rag/assemble-corpus.ts \
 *     [--source=tmp/hokenshi-kiroku/こう書けばわかる保健師記録.md] \
 *     [--pdf=tmp/hokenshi-kiroku/こう書けばわかる保健師記録.pdf] \
 *     [--version=2026-11-10] \
 *     [--generated-at=2026-11-10T00:00:00.000Z]
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CORPUS_ID = "hokenshi-kiroku-record-guide";
export const SOURCE_TITLE = "こう書けばわかる！保健師記録";
export const SOURCE_FILE = "こう書けばわかる保健師記録.pdf";
export const CONVERSION = "pdf-markdown";
export const DISCLAIMER =
  "本データは書籍 PDF を Markdown 化した内部参照用であり、保健師記録の実務判断・法令解釈・行政手続の最終判断ではない。";

const DEFAULT_SOURCE = "tmp/hokenshi-kiroku/こう書けばわかる保健師記録.md";
const DEFAULT_PDF = "tmp/hokenshi-kiroku/こう書けばわかる保健師記録.pdf";
const DEFAULT_VERSION = "2026-11-10";
const CORPUS_ROOT = "terraform/aws/agentcore/data/hokenshi-kiroku/record-guide";
const MANIFEST_ROOT =
  "terraform/aws/agentcore/data/hokenshi-kiroku-manifests/record-guide";

/** 画像参照（`![alt](path)`）。alt を残して path を落とす。 */
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
/** ページ境界コメント。 */
const PAGE_RE = /<!-- pdf-page: (\d+) -->\n/;

export type Section = {
  /** metadata の `section`（slug）。ファイル名の接頭辞にも使う。 */
  readonly slug: string;
  /** metadata の `section_title`（書籍上の呼び名）。 */
  readonly title: string;
};

export type Unit = {
  readonly section: Section;
  /** 編の中の通し番号（扉・前付・索引など番号を持たないものは null）。 */
  readonly number: number | null;
  /** 単元名（番号を持たないものは null）。 */
  readonly title: string | null;
  /** 先頭ページ（PDF の出力ページ番号）。 */
  readonly from: number;
  /** 末尾ページ（含む）。 */
  readonly to: number;
  /** 本文を持たない区分（扉・目次・索引など）に与える固定 content_type。 */
  readonly contentType?: string;
};

const FRONT_MATTER: Section = { slug: "front-matter", title: "前付" };
const KISO: Section = { slug: "kiso", title: "基礎編" };
const JISSEN: Section = { slug: "jissen", title: "実践編" };
const TENKAI: Section = { slug: "tenkai", title: "展開編" };
const APPENDIX: Section = { slug: "appendix", title: "付録" };
const AFTERWORD: Section = { slug: "afterword", title: "あとがき" };
const INDEX: Section = { slug: "index", title: "索引" };

/**
 * 書籍の目次（5-8 ページ）と本文の見出し位置から起こした単元表。
 * 出力ページ（PDF の通しページ）で範囲を持ち、全 172 ページを隙間なく覆う。
 */
export const UNITS: readonly Unit[] = [
  {
    section: FRONT_MATTER,
    number: null,
    title: null,
    from: 1,
    to: 4,
    contentType: "front_matter",
  },
  {
    section: FRONT_MATTER,
    number: null,
    title: "目次",
    from: 5,
    to: 8,
    contentType: "toc",
  },
  {
    section: KISO,
    number: null,
    title: null,
    from: 9,
    to: 9,
    contentType: "section_divider",
  },
  {
    section: KISO,
    number: 1,
    title: "記録の開示経緯と基本的な考え方",
    from: 10,
    to: 17,
  },
  {
    section: KISO,
    number: 2,
    title: "保健師記録のガイドライン",
    from: 18,
    to: 31,
  },
  {
    section: JISSEN,
    number: null,
    title: null,
    from: 32,
    to: 32,
    contentType: "section_divider",
  },
  {
    section: JISSEN,
    number: 1,
    title: "保健師の思考過程を Plan/Do/See で書く",
    from: 33,
    to: 39,
  },
  {
    section: JISSEN,
    number: 2,
    title: "良い記録を書くための条件",
    from: 40,
    to: 50,
  },
  {
    section: JISSEN,
    number: 3,
    title: "精神障害者のインテーク面接の記録",
    from: 51,
    to: 65,
  },
  {
    section: JISSEN,
    number: 4,
    title: "虐待を疑う母子の訪問記録",
    from: 66,
    to: 76,
  },
  {
    section: JISSEN,
    number: 5,
    title: "連携・協働を促進するツールとしての記録",
    from: 77,
    to: 92,
  },
  {
    section: JISSEN,
    number: 6,
    title: "地域の多様なグループを記録する",
    from: 93,
    to: 98,
  },
  {
    section: JISSEN,
    number: 7,
    title: "グループとしての成長をねらった支援記録",
    from: 99,
    to: 107,
  },
  {
    section: JISSEN,
    number: 8,
    title: "グループ療法を活用した支援記録",
    from: 108,
    to: 119,
  },
  {
    section: TENKAI,
    number: null,
    title: null,
    from: 120,
    to: 120,
    contentType: "section_divider",
  },
  {
    section: TENKAI,
    number: 1,
    title: "情報公開法と個人情報保護制度の基本的な考え方",
    from: 121,
    to: 126,
  },
  { section: TENKAI, number: 2, title: "記録の管理", from: 127, to: 131 },
  {
    section: TENKAI,
    number: 3,
    title: "行政評価に日々の実践記録を役立てるために",
    from: 132,
    to: 137,
  },
  {
    section: TENKAI,
    number: 4,
    title: "記録の改善へのステップ",
    from: 138,
    to: 144,
  },
  {
    section: APPENDIX,
    number: 1,
    title: "保健師記録を現場で共有しよう",
    from: 145,
    to: 154,
  },
  {
    section: APPENDIX,
    number: 2,
    title: "記録様式のフォーマット例",
    from: 155,
    to: 169,
  },
  {
    section: AFTERWORD,
    number: null,
    title: null,
    from: 170,
    to: 170,
    contentType: "afterword",
  },
  {
    section: INDEX,
    number: null,
    title: null,
    from: 171,
    to: 172,
    contentType: "index",
  },
];

export const TOTAL_PAGES = 172;

/** 出力ページ番号から単元を引く。 */
export function unitFor(page: number): Unit {
  const unit = UNITS.find((u) => page >= u.from && page <= u.to);
  if (!unit) {
    throw new Error(`単元表に含まれないページです: ${page}`);
  }
  return unit;
}

/** 見出し・脚注・metadata で使う単元のラベル（「実践編3 精神障害者の…」）。 */
export function unitLabel(unit: Unit): string {
  if (unit.number === null) {
    return unit.title
      ? `${unit.section.title} ${unit.title}`
      : unit.section.title;
  }
  return `${unit.section.title}${unit.number} ${unit.title}`;
}

/** corpus のファイル名（`jissen-03-page-051.md`）。 */
export function fileNameFor(page: number, unit: Unit): string {
  const paddedPage = String(page).padStart(3, "0");
  if (unit.number === null) {
    return `${unit.section.slug}-page-${paddedPage}.md`;
  }
  return `${unit.section.slug}-${String(unit.number).padStart(2, "0")}-page-${paddedPage}.md`;
}

/** 画像参照を alt text だけの注記に畳む。 */
export function foldImages(body: string): string {
  return body.replace(IMAGE_RE, (_match, alt: string) => {
    const trimmed = alt.trim();
    return trimmed ? `（図: ${trimmed}）` : "（図）";
  });
}

/**
 * content_type を決める。
 * 単元が固定値を持つならそれを使い、本文が無ければ blank、
 * 画像注記を除くと実質テキストが残らないページは figure_or_form、それ以外は body。
 */
export function classify(
  unit: Unit,
  rawBody: string,
  foldedBody: string,
): string {
  if (unit.contentType) {
    return unit.contentType;
  }
  if (foldedBody.trim() === "") {
    return "blank";
  }
  const hasImage = IMAGE_RE.test(rawBody);
  IMAGE_RE.lastIndex = 0;
  const withoutImages = rawBody.replace(IMAGE_RE, "").replace(/\s/g, "");
  if (hasImage && withoutImages.length < 120) {
    return "figure_or_form";
  }
  return "body";
}

/** 1 ページ分の Markdown（見出し + 本文 + 脚注ブロック）を組み立てる。 */
export function renderPage(
  page: number,
  unit: Unit,
  foldedBody: string,
  generatedAt: string,
): string {
  const label = unitLabel(unit);
  const heading = `# ${SOURCE_TITLE}｜${label}（ページ ${page}）`;
  const body =
    foldedBody.trim() === ""
      ? "このページには本文がありません。"
      : foldedBody.trim();
  const footer =
    `> 出典: ${SOURCE_TITLE}（${label}） / source: ${SOURCE_FILE} p.${page} / ページ ${page} / ` +
    `変換: ${CONVERSION} / 生成: ${generatedAt}\n> ${DISCLAIMER}`;
  return `${heading}\n\n${body}\n\n---\n\n${footer}\n`;
}

/** 1 ページ分の metadataAttributes を組み立てる。 */
export function renderMetadata(
  page: number,
  unit: Unit,
  contentType: string,
  generatedAt: string,
): string {
  const metadata = {
    metadataAttributes: {
      corpus_id: CORPUS_ID,
      source_title: SOURCE_TITLE,
      section: unit.section.slug,
      section_title: unit.section.title,
      unit: unit.number === null ? "" : String(unit.number),
      unit_title: unit.title ?? "",
      source_file: SOURCE_FILE,
      source_page: String(page),
      output_page: String(page),
      conversion: CONVERSION,
      generated_at: generatedAt,
      content_type: contentType,
    },
  };
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

/** 結合 Markdown をページ番号 -> 本文の Map に分解する。 */
export function splitPages(source: string): Map<number, string> {
  const parts = source.split(new RegExp(PAGE_RE.source, "g"));
  if (parts[0]?.trim()) {
    throw new Error("最初の <!-- pdf-page: --> より前に本文があります");
  }
  const pages = new Map<number, string>();
  for (let i = 1; i < parts.length; i += 2) {
    const page = Number(parts[i]);
    const body = parts[i + 1] ?? "";
    if (pages.has(page)) {
      throw new Error(`ページ ${page} が重複しています`);
    }
    pages.set(page, body);
  }
  return pages;
}

function abs(p: string): string {
  return isAbsolute(p) ? p : join(REPO_ROOT, p);
}

function parseArgs(argv: string[]): {
  source: string;
  pdf: string;
  version: string;
  generatedAt: string;
} {
  let source = DEFAULT_SOURCE;
  let pdf = DEFAULT_PDF;
  let version = DEFAULT_VERSION;
  let generatedAt = "";
  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      source = arg.slice("--source=".length).trim();
    } else if (arg.startsWith("--pdf=")) {
      pdf = arg.slice("--pdf=".length).trim();
    } else if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length).trim();
    } else if (arg.startsWith("--generated-at=")) {
      generatedAt = arg.slice("--generated-at=".length).trim();
    }
  }
  return {
    source,
    pdf,
    version,
    generatedAt: generatedAt || new Date().toISOString(),
  };
}

async function sha256OrNull(path: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { source, pdf, version, generatedAt } = parseArgs(Bun.argv.slice(2));
  const corpusDir = abs(join(CORPUS_ROOT, version));
  const manifestDir = abs(join(MANIFEST_ROOT, version));
  await mkdir(corpusDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });

  const pages = splitPages(await readFile(abs(source), "utf8"));
  if (pages.size !== TOTAL_PAGES) {
    throw new Error(`ページ数が ${TOTAL_PAGES} ではありません: ${pages.size}`);
  }

  const byType: Record<string, number> = {};
  const files: { page: number; file: string; content_type: string }[] = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const rawBody = pages.get(page);
    if (rawBody === undefined) {
      throw new Error(`ページ ${page} が結合 Markdown にありません`);
    }
    const unit = unitFor(page);
    const foldedBody = foldImages(rawBody);
    const contentType = classify(unit, rawBody, foldedBody);
    const file = fileNameFor(page, unit);

    await writeFile(
      join(corpusDir, file),
      renderPage(page, unit, foldedBody, generatedAt),
      "utf8",
    );
    await writeFile(
      join(corpusDir, `${file}.metadata.json`),
      renderMetadata(page, unit, contentType, generatedAt),
      "utf8",
    );

    byType[contentType] = (byType[contentType] ?? 0) + 1;
    files.push({ page, file, content_type: contentType });
  }

  const manifest = {
    generator: "wel-agents-poc/tools/hokenshi-kiroku-rag/assemble-corpus.ts",
    processor: "WEL Agents PoC",
    corpus_id: CORPUS_ID,
    source_title: SOURCE_TITLE,
    corpus_version: version,
    disclaimer: DISCLAIMER,
    generated_at: generatedAt,
    conversion: CONVERSION,
    input: {
      source_markdown: source,
      source_pdf: pdf,
      source_pdf_sha256: await sha256OrNull(abs(pdf)),
      total_output_pages: TOTAL_PAGES,
    },
    units: UNITS.map((unit) => ({
      section: unit.section.slug,
      section_title: unit.section.title,
      unit: unit.number,
      unit_title: unit.title,
      from_page: unit.from,
      to_page: unit.to,
    })),
    content_types: byType,
    files,
  };
  await writeFile(
    join(manifestDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(`[OK] assembled ${TOTAL_PAGES} pages -> ${corpusDir}`);
  console.log(`[OK] content_type: ${JSON.stringify(byType)}`);
  console.log(`[OK] manifest -> ${join(manifestDir, "manifest.json")}`);
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`[NG] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
