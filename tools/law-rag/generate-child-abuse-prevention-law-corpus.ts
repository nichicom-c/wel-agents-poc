/**
 * 児童虐待防止法 RAG PoC 用 corpus generator（API-backed one-shot）。
 *
 * e-Gov 法令 API v2 の `/law_data/{law_id}`（`json_format=full`）から
 * 「児童虐待の防止等に関する法律」の 2025-04-01 時点版を取得し、条単位の Markdown chunk と
 * Bedrock Knowledge Base 用 metadata sidecar（`<source>.md.metadata.json`）を生成する。
 *
 * source of truth は固定された `law_id` / `asof` とこの generator。raw API response は ingestion
 * 対象 prefix（`data/law/`）には置かず、audit 用に `tmp/law-rag/` へ保存する。manifest は ingestion
 * 対象外の `data/law-manifests/` 配下に置く（`law/` prefix で取り込まれない）。
 *
 * 使い方:
 *   bun run tools/law-rag/generate-child-abuse-prevention-law-corpus.ts
 *   bun run tools/law-rag/generate-child-abuse-prevention-law-corpus.ts --asof=2025-04-01
 *   bun run tools/law-rag/generate-child-abuse-prevention-law-corpus.ts --allow-revision-change
 *
 * 出典: デジタル庁 e-Gov 法令検索（https://laws.e-gov.go.jp/）。本データは e-Gov 法令データを
 * 加工した内部参照用であり、法的助言ではない。
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- 固定対象（PoC scope）---
export const LAW_ID = "412AC1000000082";
export const OCCASION_DATE = "20250401";
export const DEFAULT_ASOF = "2025-04-01";
export const EXPECTED_REVISION_ID = "412AC1000000082_20240401_504AC0000000104";
export const API_BASE = "https://laws.e-gov.go.jp/api/2";
export const LAW_PAGE_BASE = "https://laws.e-gov.go.jp/law";
export const PROCESSED_BY =
  "wel-agents-poc/tools/law-rag/generate-child-abuse-prevention-law-corpus.ts";
export const PROCESSING =
  "e-Gov 法令 API v2 (law_data, json_format=full) の JSON 階層構造を条単位の Markdown に整形（加工）";
export const ATTRIBUTION = "デジタル庁 e-Gov 法令検索";
export const PROCESSOR = "WEL Agents PoC";
export const DISCLAIMER =
  "本データは e-Gov 法令データ（出典: デジタル庁 e-Gov 法令検索）を加工した内部参照用であり、法的助言ではない。";

/**
 * Bedrock Knowledge Base の metadata sidecar 1 ファイルの byte 上限。
 * これを超えると ingestion が対象文書を無視するため、生成時に厳格に守る。
 */
export const MAX_METADATA_BYTES = 1024;

/** 設計の事前 API 確認で固定した期待件数（`omit_amendment_suppl_provision=true`）。 */
export const EXPECTED_COUNTS = {
  article: 41,
  paragraph: 90,
  sentence: 111,
  supplProvision: 1,
} as const;

// --- e-Gov 法令 JSON の最小型（tag/attr/children の階層構造）---
export type LawElement = {
  tag: string;
  attr?: Record<string, string>;
  children?: LawNode[];
};
export type LawNode = string | LawElement;

export type LawDataResponse = {
  law_info: {
    law_id: string;
    law_num: string;
    promulgation_date: string;
  };
  revision_info: {
    law_revision_id: string;
    law_title: string;
    law_title_kana: string | null;
    abbrev: string | null;
    category: string | null;
    amendment_enforcement_date: string | null;
    current_revision_status: string | null;
  };
  law_full_text: LawElement;
};

export type ArticleSection = "main" | "suppl";

export type RenderedArticle = {
  /** Article@Num（例: "1", "8_2"）。 */
  num: string;
  /** ArticleTitle のテキスト（例: "第一条"）。 */
  articleTitle: string;
  /** ArticleCaption のテキスト（例: "（目的）"。無ければ空文字）。 */
  caption: string;
  section: ArticleSection;
  /** suppl の場合の SupplProvisionLabel（例: "附則"）。 */
  supplLabel?: string;
  /** ingestion 対象のファイル名（拡張子なし base、例: "article-001"）。 */
  fileBase: string;
  markdown: string;
};

// --- 木構造ヘルパ ---
export function isElement(node: LawNode): node is LawElement {
  return typeof node !== "string";
}

/** subtree 内の全テキスト（文字列の葉）を連結する。 */
export function rawText(node: LawNode): string {
  if (typeof node === "string") {
    return node;
  }
  return (node.children ?? []).map(rawText).join("");
}

/** 直下の子のうち指定 tag のものを返す。 */
export function childrenByTag(node: LawElement, tag: string): LawElement[] {
  return (node.children ?? []).filter(
    (child): child is LawElement => isElement(child) && child.tag === tag,
  );
}

/** 直下の子のうち指定 tag の最初のものを返す。 */
export function firstByTag(
  node: LawElement,
  tag: string,
): LawElement | undefined {
  return childrenByTag(node, tag)[0];
}

/** subtree を深さ優先で走査し指定 tag の要素をすべて集める。 */
export function collectByTag(node: LawNode, tag: string): LawElement[] {
  const out: LawElement[] = [];
  const walk = (current: LawNode): void => {
    if (typeof current === "string") {
      return;
    }
    if (current.tag === tag) {
      out.push(current);
    }
    for (const child of current.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return out;
}

// --- 入力正規化 / 検証 ---
/** `occasion_date=YYYYMMDD` を API 用の `asof=YYYY-MM-DD` に正規化する。 */
export function normalizeOccasionDate(occasionDate: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(occasionDate.trim());
  if (!match) {
    throw new Error(
      `occasion_date は YYYYMMDD 形式である必要があります: "${occasionDate}"`,
    );
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * 取得した law_revision_id が期待値と一致するか検証する。
 * 一致しない場合は明確なメッセージで失敗する（意図的更新時は allowChange=true）。
 */
export function assertRevision(
  actual: string,
  expected: string = EXPECTED_REVISION_ID,
  allowChange = false,
): void {
  if (actual === expected) {
    return;
  }
  if (allowChange) {
    return;
  }
  throw new Error(
    `law_revision_id が期待値と異なります。\n` +
      `  expected: ${expected}\n` +
      `  actual:   ${actual}\n` +
      `対象時点版が変わった可能性があります。意図的に更新する場合は EXPECTED_REVISION_ID を更新し、` +
      `--allow-revision-change を付けて再実行してください。`,
  );
}

/**
 * API レスポンスが期待する最小 shape を持つか検証する。
 *
 * e-Gov の law_data JSON は試行版で仕様変更の可能性があるため、cast に頼らず取得直後に
 * 必須フィールド（law_info.law_id / revision_info.law_revision_id・law_title / law_full_text.tag）を
 * 検証し、形状が崩れたら fail-fast で明確に失敗させる（plan Context の shape validation 要件）。
 */
export function assertLawDataShape(
  value: unknown,
): asserts value is LawDataResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("e-Gov API レスポンスが object ではありません。");
  }
  const record = value as Record<string, unknown>;
  const lawInfo = record.law_info as Record<string, unknown> | undefined;
  if (!lawInfo || typeof lawInfo.law_id !== "string") {
    throw new Error("e-Gov API レスポンスに law_info.law_id がありません。");
  }
  const revisionInfo = record.revision_info as
    | Record<string, unknown>
    | undefined;
  if (
    !revisionInfo ||
    typeof revisionInfo.law_revision_id !== "string" ||
    typeof revisionInfo.law_title !== "string"
  ) {
    throw new Error(
      "e-Gov API レスポンスに revision_info.law_revision_id / law_title がありません。",
    );
  }
  const fullText = record.law_full_text as Record<string, unknown> | undefined;
  if (!fullText || typeof fullText.tag !== "string") {
    throw new Error(
      "e-Gov API レスポンスに law_full_text（tag を持つ要素）がありません。",
    );
  }
}

/** e-Gov 法令 API v2 の law_data URL を組み立てる（json_format=full・改正附則除外）。 */
export function buildApiUrl(lawId: string, asof: string): string {
  const params = new URLSearchParams({
    asof,
    response_format: "json",
    law_full_text_format: "json",
    json_format: "full",
    omit_amendment_suppl_provision: "true",
  });
  return `${API_BASE}/law_data/${lawId}?${params.toString()}`;
}

/** e-Gov 法令ページの出典 URL を組み立てる。 */
export function buildSourceUrl(lawId: string, occasionDate: string): string {
  return `${LAW_PAGE_BASE}/${lawId}?occasion_date=${occasionDate}`;
}

// --- 条文 → Markdown レンダリング ---
/** Sentence / Column を含むコンテナのテキストを連結する。 */
function renderSentenceContainer(container: LawElement): string {
  const parts: string[] = [];
  for (const child of container.children ?? []) {
    if (!isElement(child)) {
      parts.push(child);
      continue;
    }
    if (child.tag === "Column") {
      // Column は表組み的に並ぶため全角スペースで連結する。
      parts.push(rawText(child));
      parts.push("　");
      continue;
    }
    parts.push(rawText(child));
  }
  return parts.join("").trim();
}

/** 号（Item）を `一　…` 形式で描画する。 */
function renderItem(item: LawElement): string {
  const titleEl = firstByTag(item, "ItemTitle");
  const title = titleEl ? rawText(titleEl).trim() : "";
  const sentenceEl = firstByTag(item, "ItemSentence");
  const body = sentenceEl
    ? renderSentenceContainer(sentenceEl)
    : rawText(item).trim();
  return title ? `${title}　${body}` : body;
}

/** 項（Paragraph）を描画する。第1項は条名を、第2項以降は項番号を前置する。 */
function renderParagraph(
  paragraph: LawElement,
  articleTitle: string,
  isFirst: boolean,
): string {
  const numEl = firstByTag(paragraph, "ParagraphNum");
  const paragraphNum = numEl ? rawText(numEl).trim() : "";
  const sentenceEl = firstByTag(paragraph, "ParagraphSentence");
  const body = sentenceEl
    ? renderSentenceContainer(sentenceEl)
    : rawText(paragraph).trim();

  const prefix = isFirst
    ? `${articleTitle}　`
    : paragraphNum
      ? `${paragraphNum}　`
      : "";

  const lines = [`${prefix}${body}`];
  for (const item of childrenByTag(paragraph, "Item")) {
    lines.push(`　${renderItem(item)}`);
  }
  return lines.join("\n");
}

/** 各 Markdown chunk 末尾に付ける短い出典・加工脚注（e-Gov 利用規約の出典 / 加工 / 主体表示）。 */
export function sourceNote(asof: string): string {
  return `> 出典: ${ATTRIBUTION}の法令データを ${PROCESSOR} が加工（asof=${asof}）。内部参照用であり法的助言ではない。`;
}

/**
 * 1 つの Article を Markdown chunk に整形する。
 *
 * PoC では条単位の chunk のみを生成し、項単位の分割は行わない（本法令の最長条は第四条で約 1.6K 文字と
 * 短く、分割不要だったため）。より長い法令で再利用する際は項単位 fallback の追加を検討する。
 * 出典・加工・主体・disclaimer は chunk 末尾の脚注として残す（metadata sidecar は 1KB 制約のため最小化）。
 */
export function renderArticle(
  article: LawElement,
  lawTitle: string,
  section: ArticleSection = "main",
  supplLabel?: string,
  asof: string = DEFAULT_ASOF,
): Omit<RenderedArticle, "fileBase"> {
  const num = article.attr?.Num ?? "";
  const titleEl = firstByTag(article, "ArticleTitle");
  const articleTitle = titleEl ? rawText(titleEl).trim() : `第${num}条`;
  const captionEl = firstByTag(article, "ArticleCaption");
  const caption = captionEl ? rawText(captionEl).trim() : "";

  const paragraphs = childrenByTag(article, "Paragraph");
  const blocks =
    paragraphs.length > 0
      ? paragraphs.map((paragraph, index) =>
          renderParagraph(paragraph, articleTitle, index === 0),
        )
      : [rawText(article).trim()];
  const body = blocks.join("\n\n");

  const headingParts = [lawTitle];
  if (section === "suppl" && supplLabel) {
    headingParts.push(supplLabel);
  }
  headingParts.push(caption ? `${articleTitle}${caption}` : articleTitle);
  const heading = `# ${headingParts.join(" ")}`;

  return {
    num,
    articleTitle,
    caption,
    section,
    ...(supplLabel ? { supplLabel } : {}),
    markdown: `${heading}\n\n${body}\n\n---\n\n${sourceNote(asof)}\n`,
  };
}

/** Article@Num から ingestion 用のファイル名 base を作る（例: "8_2" → "article-008-2"）。 */
export function articleFileBase(num: string, prefix: string): string {
  const segments = num.split("_");
  const head = segments[0] ?? num;
  const tail = segments.slice(1);
  const padded = head.padStart(3, "0");
  const suffix = tail.length > 0 ? `-${tail.join("-")}` : "";
  return `${prefix}${padded}${suffix}`;
}

export type CorpusMetadataInput = {
  rendered: Pick<RenderedArticle, "articleTitle" | "num" | "section">;
  response: LawDataResponse;
  asof: string;
  sourceUrl: string;
};

/**
 * Bedrock S3 metadata sidecar の `metadataAttributes` を組み立てる。
 *
 * Bedrock KB は metadata sidecar 1 ファイルを 1024 bytes までしか許容せず、超過すると ingestion が
 * その文書を無視する（{@link MAX_METADATA_BYTES}）。そこで filtering / citation に必須の最小キーだけを
 * 残す。詳細な出典 (api_url)・加工内容 (processing)・加工主体 (processed_by)・法令名 / 読み / 法令番号
 * などは ingestion 対象外の manifest と各 Markdown 末尾の出典脚注 ({@link sourceNote}) に逃がす。
 */
export function buildArticleMetadata(input: CorpusMetadataInput): {
  metadataAttributes: Record<string, string>;
} {
  const { rendered, response, asof, sourceUrl } = input;
  const attributes: Record<string, string> = {
    law_id: response.law_info.law_id,
    law_revision_id: response.revision_info.law_revision_id,
    asof,
    section: rendered.section,
    article: rendered.articleTitle,
    article_num: rendered.num,
    source_url: sourceUrl,
  };
  return { metadataAttributes: attributes };
}

/** metadata sidecar を JSON 文字列化したときの UTF-8 byte size（実ファイルと一致）。 */
export function metadataByteSize(metadata: {
  metadataAttributes: Record<string, string>;
}): number {
  return Buffer.byteLength(toJson(metadata), "utf8");
}

/**
 * law_full_text から main / suppl の全 Article を取り出し Markdown chunk 化する。
 * SupplProvision に Article が無く Paragraph だけの場合は、その附則を 1 chunk として描画する。
 */
export function buildCorpus(
  response: LawDataResponse,
  asof: string = DEFAULT_ASOF,
): RenderedArticle[] {
  const lawBody = collectByTag(response.law_full_text, "LawBody")[0];
  if (!lawBody) {
    throw new Error("law_full_text に LawBody が見つかりません。");
  }
  const lawTitle = response.revision_info.law_title;
  const corpus: RenderedArticle[] = [];

  const mainProvision = collectByTag(lawBody, "MainProvision")[0];
  if (!mainProvision) {
    throw new Error("law_full_text に MainProvision が見つかりません。");
  }
  for (const article of collectByTag(mainProvision, "Article")) {
    const rendered = renderArticle(article, lawTitle, "main", undefined, asof);
    corpus.push({
      ...rendered,
      fileBase: articleFileBase(rendered.num, "article-"),
    });
  }

  for (const suppl of collectByTag(lawBody, "SupplProvision")) {
    const labelEl = firstByTag(suppl, "SupplProvisionLabel");
    const supplLabel = labelEl ? rawText(labelEl).trim() : "附則";
    const supplArticles = collectByTag(suppl, "Article");
    if (supplArticles.length > 0) {
      for (const article of supplArticles) {
        const rendered = renderArticle(
          article,
          lawTitle,
          "suppl",
          supplLabel,
          asof,
        );
        corpus.push({
          ...rendered,
          fileBase: articleFileBase(rendered.num, "suppl-article-"),
        });
      }
      continue;
    }
    // Article を持たない附則（Paragraph 直下）は 1 chunk として描画する。
    const rendered = renderArticle(suppl, lawTitle, "suppl", supplLabel, asof);
    corpus.push({ ...rendered, fileBase: "suppl" });
  }

  return corpus;
}

export function countNodes(response: LawDataResponse): {
  article: number;
  paragraph: number;
  sentence: number;
  supplProvision: number;
} {
  return {
    article: collectByTag(response.law_full_text, "Article").length,
    paragraph: collectByTag(response.law_full_text, "Paragraph").length,
    sentence: collectByTag(response.law_full_text, "Sentence").length,
    supplProvision: collectByTag(response.law_full_text, "SupplProvision")
      .length,
  };
}

// --- CLI / I/O ---
type CliArgs = {
  asof: string;
  allowRevisionChange: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
  let asof = DEFAULT_ASOF;
  let allowRevisionChange = false;
  for (const arg of argv) {
    if (arg.startsWith("--asof=")) {
      asof = arg.slice("--asof=".length).trim();
    } else if (arg === "--allow-revision-change") {
      allowRevisionChange = true;
    }
  }
  return { asof, allowRevisionChange };
}

function repoRoot(): string {
  // tools/law-rag/<file> → repo root は 2 つ上。
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const { asof, allowRevisionChange } = parseCliArgs(Bun.argv.slice(2));
  const apiUrl = buildApiUrl(LAW_ID, asof);
  const sourceUrl = buildSourceUrl(LAW_ID, OCCASION_DATE);
  const fetchedAt = new Date().toISOString();

  console.log(`[INFO] GET ${apiUrl}`);
  const response = await fetch(apiUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`e-Gov API request failed: HTTP ${response.status}`);
  }
  const raw: unknown = await response.json();

  const root = repoRoot();
  const rawDir = join(root, "tmp", "law-rag");
  await mkdir(rawDir, { recursive: true });
  // 検証前に raw を保存し、shape が崩れた場合でも audit できるようにする。
  await writeFile(
    join(rawDir, `law-data-${LAW_ID}-${asof}.json`),
    toJson(raw),
    "utf8",
  );

  assertLawDataShape(raw);
  const data = raw;

  assertRevision(
    data.revision_info.law_revision_id,
    EXPECTED_REVISION_ID,
    allowRevisionChange,
  );
  console.log(
    `[OK] law_revision_id = ${data.revision_info.law_revision_id} / ${data.revision_info.law_title}`,
  );

  const corpus = buildCorpus(data, asof);
  const counts = countNodes(data);
  console.log(
    `[INFO] counts: article=${counts.article} paragraph=${counts.paragraph} sentence=${counts.sentence} supplProvision=${counts.supplProvision}`,
  );
  if (
    asof === DEFAULT_ASOF &&
    (counts.article !== EXPECTED_COUNTS.article ||
      counts.paragraph !== EXPECTED_COUNTS.paragraph ||
      counts.sentence !== EXPECTED_COUNTS.sentence ||
      counts.supplProvision !== EXPECTED_COUNTS.supplProvision)
  ) {
    console.warn(
      `[WARNING] 件数が期待値と異なります（expected ${JSON.stringify(EXPECTED_COUNTS)}）。レスポンス形状が変わった可能性があります。`,
    );
  }

  const corpusDir = join(
    root,
    "terraform/aws/agentcore/data/law/child-abuse-prevention",
    asof,
  );
  const manifestDir = join(
    root,
    "terraform/aws/agentcore/data/law-manifests/child-abuse-prevention",
    asof,
  );
  // 決定論的な再生成のため、対象 asof のディレクトリを作り直す。
  await rm(corpusDir, { recursive: true, force: true });
  await rm(manifestDir, { recursive: true, force: true });
  await mkdir(corpusDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });

  const files: Array<{
    file: string;
    article: string;
    section: ArticleSection;
  }> = [];
  let maxMetadataBytes = 0;
  for (const rendered of corpus) {
    const mdName = `${rendered.fileBase}.md`;
    await writeFile(join(corpusDir, mdName), rendered.markdown, "utf8");
    const metadata = buildArticleMetadata({
      rendered,
      response: data,
      asof,
      sourceUrl,
    });
    const serialized = toJson(metadata);
    const bytes = Buffer.byteLength(serialized, "utf8");
    maxMetadataBytes = Math.max(maxMetadataBytes, bytes);
    // Bedrock の 1024 bytes 上限を超えると ingestion が文書を無視するため、生成時に fail-fast する。
    if (bytes >= MAX_METADATA_BYTES) {
      throw new Error(
        `metadata sidecar が Bedrock 上限 (${MAX_METADATA_BYTES} bytes) 以上です: ` +
          `${mdName}.metadata.json = ${bytes} bytes。metadata を削減してください。`,
      );
    }
    await writeFile(
      join(corpusDir, `${mdName}.metadata.json`),
      serialized,
      "utf8",
    );
    files.push({
      file: mdName,
      article: rendered.articleTitle,
      section: rendered.section,
    });
  }

  const manifest = {
    generator: PROCESSED_BY,
    processor: PROCESSOR,
    processing: PROCESSING,
    attribution: ATTRIBUTION,
    disclaimer: DISCLAIMER,
    // 各 chunk の metadata sidecar は Bedrock の 1024 bytes 上限のため最小化し、詳細な出典 /
    // 加工情報はこの manifest と各 Markdown 末尾の出典脚注に残す。
    metadata_note: `metadata sidecar は law_id / law_revision_id / asof / section / article / article_num / source_url のみ（< ${MAX_METADATA_BYTES} bytes）。詳細出典・加工情報は本 manifest と各 Markdown 末尾の出典脚注に保持。`,
    fetched_at: fetchedAt,
    law: {
      law_id: data.law_info.law_id,
      law_num: data.law_info.law_num,
      promulgation_date: data.law_info.promulgation_date,
      law_title: data.revision_info.law_title,
      law_title_kana: data.revision_info.law_title_kana,
      law_abbrev: data.revision_info.abbrev,
      category: data.revision_info.category,
    },
    revision: {
      law_revision_id: data.revision_info.law_revision_id,
      amendment_enforcement_date: data.revision_info.amendment_enforcement_date,
      current_revision_status: data.revision_info.current_revision_status,
    },
    request: {
      occasion_date: OCCASION_DATE,
      asof,
      source_url: sourceUrl,
      api_url: apiUrl,
      response_format: "json",
      law_full_text_format: "json",
      json_format: "full",
      omit_amendment_suppl_provision: true,
    },
    counts,
    expected_counts: EXPECTED_COUNTS,
    files,
  };
  await writeFile(join(manifestDir, "manifest.json"), toJson(manifest), "utf8");

  console.log(
    `[OK] wrote ${files.length} Markdown chunks + metadata to ${corpusDir}`,
  );
  console.log(
    `[OK] max metadata sidecar size = ${maxMetadataBytes} bytes (limit ${MAX_METADATA_BYTES})`,
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
