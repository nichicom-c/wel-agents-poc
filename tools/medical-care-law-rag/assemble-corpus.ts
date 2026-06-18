/**
 * cleanup-corpus.workflow.mjs の結果から corpus を決定的に組み立てる。
 *
 * - 見出し(H1)と脚注ブロック("---" 以降)は RAW(raw best-OCR)を正本として全ページ採用（整合保証）。
 * - 本文は workflow が返した final_body。final_body が null のページ(raw-fallback)は RAW 本文を採用。
 * - 各 metadata.json に content_type を付与。
 * - 全ページで脚注整合を検証（不一致は失敗）。
 *
 * 使い方:
 *   bun run tools/medical-care-law-rag/assemble-corpus.ts \
 *     --results=tmp/cleanup-results.json \
 *     [--raw=tmp/medical-care-law-rag/raw-audit] \
 *     [--corpus=terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/2026-06-16]
 *
 * --results は workflow 出力の `.result.results`（[{file, content_type, final_body|null, stage}] の配列）を
 * 抽出した JSON ファイル。手順は SKILL.md / README.md を参照。
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_RAW = "tmp/medical-care-law-rag/raw-audit";
const DEFAULT_CORPUS =
  "terraform/aws/agentcore/data/medical-care-law/basic-law-textbook/2026-06-16";

const FOOTER_RE = /\n---\n\n> 出典:/;

type CleanupResult = {
  file: string;
  content_type: string;
  final_body: string | null;
  stage?: string;
};

function parseArgs(argv: string[]): {
  results: string;
  raw: string;
  corpus: string;
} {
  let results = "";
  let raw = DEFAULT_RAW;
  let corpus = DEFAULT_CORPUS;
  for (const arg of argv) {
    if (arg.startsWith("--results=")) {
      results = arg.slice("--results=".length).trim();
    } else if (arg.startsWith("--raw=")) {
      raw = arg.slice("--raw=".length).trim();
    } else if (arg.startsWith("--corpus=")) {
      corpus = arg.slice("--corpus=".length).trim();
    }
  }
  if (!results) {
    throw new Error("--results=<workflow results json> が必要です");
  }
  return { results, raw, corpus };
}

function abs(p: string): string {
  return isAbsolute(p) ? p : join(REPO_ROOT, p);
}

/** ファイルを heading(1行目) / body / footer("---" 以降) に分割する。 */
function split(content: string): {
  heading: string;
  body: string;
  footer: string;
} {
  const m = FOOTER_RE.exec(content);
  if (!m) {
    throw new Error("脚注ブロック(--- + 出典)が見つかりません");
  }
  const footer = content.slice(m.index + 1);
  const head = content.slice(0, m.index);
  const nl = head.indexOf("\n");
  return {
    heading: head.slice(0, nl),
    body: head.slice(nl + 1).trim(),
    footer,
  };
}

async function main(): Promise<void> {
  const { results, raw, corpus } = parseArgs(Bun.argv.slice(2));
  const rawDir = abs(raw);
  const corpusDir = abs(corpus);

  const cleanup: CleanupResult[] = JSON.parse(
    await readFile(abs(results), "utf8"),
  );

  let rawFallback = 0;
  const byType: Record<string, number> = {};
  const footerMismatch: string[] = [];

  for (const r of cleanup) {
    const rawParts = split(await readFile(join(rawDir, r.file), "utf8"));
    const body = r.final_body ?? rawParts.body; // raw-fallback は RAW 本文
    if (r.final_body === null) {
      rawFallback++;
    }
    byType[r.content_type] = (byType[r.content_type] ?? 0) + 1;

    // 見出し + 本文 + 脚注(RAW 正本) で組み立てる。
    const assembled = `${rawParts.heading}\n\n${body.trim()}\n\n${rawParts.footer}`;
    await writeFile(join(corpusDir, r.file), assembled, "utf8");

    // 脚注整合
    const check = split(await readFile(join(corpusDir, r.file), "utf8"));
    if (check.footer.trimEnd() !== rawParts.footer.trimEnd()) {
      footerMismatch.push(r.file);
    }

    // metadata content_type 付与
    const metaPath = join(corpusDir, `${r.file}.metadata.json`);
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    meta.metadataAttributes.content_type = r.content_type;
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }

  console.log(
    `[OK] assembled ${cleanup.length} pages (raw-fallback ${rawFallback})`,
  );
  console.log(`[OK] content_type: ${JSON.stringify(byType)}`);
  if (footerMismatch.length > 0) {
    console.log(`[NG] footer 不一致: ${footerMismatch.join(", ")}`);
    process.exit(1);
  }
  console.log("[OK] 全ページ脚注整合 + metadata content_type 付与");
}

main().catch((e: unknown) => {
  console.error(`[NG] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
