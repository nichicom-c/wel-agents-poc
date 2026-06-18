/**
 * Support activity structured-data RAG sample generator.
 *
 * Generates fully synthetic resident-ledger-like support activity data for the
 * `support_activity` SQL Knowledge Base PoC. The generator is the source of truth:
 * CSV mirror files are for review, while Parquet files are the Redshift Spectrum
 * query target.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_OUTPUT_ROOT = join(
  SCRIPT_DIR,
  "../../terraform/aws/agentcore/data/structured-data/support-activity",
);

export const TABLE_NAMES = [
  "resident_basic_ledger",
  "households",
  "support_cases",
  "support_activity_logs",
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export const EXPECTED_COUNTS = {
  residents: 24,
  households: 12,
  cases: 32,
  activityLogs: 120,
} as const;

export type CsvValue = string | number | boolean | null;
type Row = Record<string, CsvValue>;

export type ResidentBasicLedgerRow = {
  resident_id: string;
  household_id: string;
  age_band: string;
  district_code: string;
  household_role: string;
  registered_on: string;
  welfare_flag: boolean;
  disability_flag: boolean;
  long_term_care_level: number;
  synthetic_marker: "synthetic_only";
};

export type HouseholdRow = {
  household_id: string;
  household_type: string;
  district_code: string;
  member_count: number;
  has_minor: boolean;
  income_band: string;
  created_on: string;
  synthetic_marker: "synthetic_only";
};

export type SupportCaseRow = {
  case_id: string;
  resident_id: string;
  case_type: string;
  priority: string;
  status: string;
  opened_on: string;
  closed_on: string | null;
  assigned_team: string;
  next_action_due_on: string | null;
  synthetic_marker: "synthetic_only";
};

export type SupportActivityLogRow = {
  activity_id: string;
  case_id: string;
  activity_on: string;
  activity_type: string;
  channel: string;
  outcome_code: string;
  minutes_spent: number;
  follow_up_required: boolean;
  synthetic_marker: "synthetic_only";
};

export type SupportActivityDataset = {
  resident_basic_ledger: ResidentBasicLedgerRow[];
  households: HouseholdRow[];
  support_cases: SupportCaseRow[];
  support_activity_logs: SupportActivityLogRow[];
};

export type RowCounts = Record<TableName, number>;

const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  resident_basic_ledger: [
    "resident_id",
    "household_id",
    "age_band",
    "district_code",
    "household_role",
    "registered_on",
    "welfare_flag",
    "disability_flag",
    "long_term_care_level",
    "synthetic_marker",
  ],
  households: [
    "household_id",
    "household_type",
    "district_code",
    "member_count",
    "has_minor",
    "income_band",
    "created_on",
    "synthetic_marker",
  ],
  support_cases: [
    "case_id",
    "resident_id",
    "case_type",
    "priority",
    "status",
    "opened_on",
    "closed_on",
    "assigned_team",
    "next_action_due_on",
    "synthetic_marker",
  ],
  support_activity_logs: [
    "activity_id",
    "case_id",
    "activity_on",
    "activity_type",
    "channel",
    "outcome_code",
    "minutes_spent",
    "follow_up_required",
    "synthetic_marker",
  ],
};

const DISTRICTS = ["district_a", "district_b", "district_c", "district_d"];
const HOUSEHOLD_TYPES = [
  "single_elderly",
  "elderly_couple",
  "single_parent",
  "multigenerational",
  "working_age_single",
  "other",
];
const AGE_BANDS = ["0_17", "18_39", "40_64", "65_74", "75_plus"];
const CASE_TYPES = [
  "regular_visit",
  "benefit_review",
  "child_support",
  "elderly_watch",
  "care_coordination",
  "housing_support",
];
const PRIORITIES = ["low", "medium", "high"];
const STATUSES = ["open", "monitoring", "waiting", "closed"];
const TEAMS = ["team_north", "team_central", "team_south", "team_child"];
const ACTIVITY_TYPES = [
  "visit",
  "phone_check",
  "counter_consultation",
  "document_review",
  "case_conference",
];
const CHANNELS = ["home_visit", "phone", "counter", "backoffice", "online"];
const OUTCOME_CODES = [
  "completed",
  "no_contact",
  "escalated",
  "scheduled",
  "information_provided",
];

const FORBIDDEN_CONTENT = [
  "name",
  "address",
  "phone_number",
  "telephone",
  "my_number",
  "individual_number",
  "note",
  "memo",
  "wel-mother",
] as const;

export function makeSupportActivitySample(): SupportActivityDataset {
  const households: HouseholdRow[] = Array.from(
    { length: EXPECTED_COUNTS.households },
    (_, index) => {
      const ordinal = index + 1;
      return {
        household_id: `hh-${pad(ordinal, 3)}`,
        household_type: pick(HOUSEHOLD_TYPES, index),
        district_code: pick(DISTRICTS, index),
        member_count: 1 + (index % 4),
        has_minor: index % 3 === 0,
        income_band: pick(["low", "middle", "unknown"], index),
        created_on: dateAfter("2025-01-01", index * 3),
        synthetic_marker: "synthetic_only",
      };
    },
  );

  const residents: ResidentBasicLedgerRow[] = Array.from(
    { length: EXPECTED_COUNTS.residents },
    (_, index) => {
      const household = at(households, Math.floor(index / 2), "household");
      return {
        resident_id: `res-${pad(index + 1, 4)}`,
        household_id: household.household_id,
        age_band: pick(AGE_BANDS, index),
        district_code: household.district_code,
        household_role: pick(["head", "spouse", "child", "relative"], index),
        registered_on: dateAfter("2025-04-01", index),
        welfare_flag: index % 5 === 0,
        disability_flag: index % 7 === 0,
        long_term_care_level: index % 6,
        synthetic_marker: "synthetic_only",
      };
    },
  );

  const supportCases: SupportCaseRow[] = Array.from(
    { length: EXPECTED_COUNTS.cases },
    (_, index) => {
      const status = pick(STATUSES, index);
      return {
        case_id: `case-${pad(index + 1, 4)}`,
        resident_id: pick(residents, index).resident_id,
        case_type: pick(CASE_TYPES, index),
        priority: pick(PRIORITIES, index),
        status,
        opened_on: dateAfter("2026-01-05", index * 2),
        closed_on:
          status === "closed" ? dateAfter("2026-02-01", index * 2) : null,
        assigned_team: pick(TEAMS, index),
        next_action_due_on:
          status === "closed" ? null : dateAfter("2026-03-01", index),
        synthetic_marker: "synthetic_only",
      };
    },
  );

  const activityLogs: SupportActivityLogRow[] = Array.from(
    { length: EXPECTED_COUNTS.activityLogs },
    (_, index) => ({
      activity_id: `act-${pad(index + 1, 4)}`,
      case_id: pick(supportCases, index).case_id,
      activity_on: dateAfter("2026-01-06", index),
      activity_type: pick(ACTIVITY_TYPES, index),
      channel: pick(CHANNELS, index),
      outcome_code: pick(OUTCOME_CODES, index),
      minutes_spent: 15 + (index % 6) * 10,
      follow_up_required: index % 4 === 0,
      synthetic_marker: "synthetic_only",
    }),
  );

  const dataset = {
    resident_basic_ledger: residents,
    households,
    support_cases: supportCases,
    support_activity_logs: activityLogs,
  };
  assertSyntheticDataset(dataset);
  return dataset;
}

export function assertSyntheticDataset(dataset: SupportActivityDataset): void {
  expectCount(
    "resident_basic_ledger",
    dataset.resident_basic_ledger,
    EXPECTED_COUNTS.residents,
  );
  expectCount("households", dataset.households, EXPECTED_COUNTS.households);
  expectCount("support_cases", dataset.support_cases, EXPECTED_COUNTS.cases);
  expectCount(
    "support_activity_logs",
    dataset.support_activity_logs,
    EXPECTED_COUNTS.activityLogs,
  );

  const householdIds = uniqueIds(dataset.households, "household_id");
  const residentIds = uniqueIds(dataset.resident_basic_ledger, "resident_id");
  const caseIds = uniqueIds(dataset.support_cases, "case_id");
  uniqueIds(dataset.support_activity_logs, "activity_id");

  for (const resident of dataset.resident_basic_ledger) {
    if (!householdIds.has(resident.household_id)) {
      throw new Error(`unknown household_id: ${resident.household_id}`);
    }
  }
  for (const supportCase of dataset.support_cases) {
    if (!residentIds.has(supportCase.resident_id)) {
      throw new Error(`unknown resident_id: ${supportCase.resident_id}`);
    }
  }
  for (const activity of dataset.support_activity_logs) {
    if (!caseIds.has(activity.case_id)) {
      throw new Error(`unknown case_id: ${activity.case_id}`);
    }
  }

  const serialized = JSON.stringify(dataset).toLowerCase();
  for (const forbidden of FORBIDDEN_CONTENT) {
    if (serialized.includes(forbidden)) {
      throw new Error(
        `synthetic dataset contains forbidden content: ${forbidden}`,
      );
    }
  }
}

export function csvForTable(
  tableName: TableName,
  rows: readonly Row[],
): string {
  const columns = TABLE_COLUMNS[tableName];
  return `${[
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          const value = row[column];
          if (value === undefined) {
            throw new Error(`${tableName}.${column} is missing`);
          }
          return csvCell(value);
        })
        .join(","),
    ),
  ].join("\n")}\n`;
}

export async function writeSupportActivitySample({
  outputRoot = DEFAULT_OUTPUT_ROOT,
}: {
  outputRoot?: string;
} = {}): Promise<{ outputRoot: string; tables: readonly TableName[] }> {
  const dataset = makeSupportActivitySample();
  const csvRoot = join(outputRoot, "csv");
  const parquetRoot = join(outputRoot, "parquet");
  await rm(csvRoot, { recursive: true, force: true });
  await rm(parquetRoot, { recursive: true, force: true });
  await mkdir(csvRoot, { recursive: true });
  await mkdir(parquetRoot, { recursive: true });

  for (const tableName of TABLE_NAMES) {
    await writeFile(
      join(csvRoot, `${tableName}.csv`),
      csvForTable(tableName, dataset[tableName]),
    );
  }

  await writeParquetFiles(outputRoot);
  await verifyWrittenSample(outputRoot);
  return { outputRoot, tables: TABLE_NAMES };
}

export async function verifyWrittenSample(
  outputRoot: string = DEFAULT_OUTPUT_ROOT,
): Promise<RowCounts> {
  const { connection, close } = await duckDbConnection();
  try {
    const counts = {} as RowCounts;
    for (const tableName of TABLE_NAMES) {
      const parquetPath = join(
        outputRoot,
        "parquet",
        tableName,
        "part-000.parquet",
      );
      const reader = await connection.runAndReadAll(
        `SELECT count(*)::INTEGER AS count FROM read_parquet(${sqlString(parquetPath)})`,
      );
      const row = reader.getRowObjectsJson()[0] as { count?: number };
      counts[tableName] = row.count ?? 0;
    }
    return counts;
  } finally {
    close();
  }
}

async function writeParquetFiles(outputRoot: string): Promise<void> {
  const { connection, close } = await duckDbConnection();
  try {
    for (const tableName of TABLE_NAMES) {
      const csvPath = join(outputRoot, "csv", `${tableName}.csv`);
      const parquetDir = join(outputRoot, "parquet", tableName);
      const parquetPath = join(parquetDir, "part-000.parquet");
      await mkdir(parquetDir, { recursive: true });
      await connection.run(
        `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto(${sqlString(csvPath)}, header = true)`,
      );
      await connection.run(
        `COPY ${tableName} TO ${sqlString(parquetPath)} (FORMAT parquet)`,
      );
    }
  } finally {
    close();
  }
}

async function duckDbConnection(): Promise<{
  connection: Awaited<
    ReturnType<InstanceType<typeof DuckDBInstance>["connect"]>
  >;
  close: () => void;
}> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  return { connection, close: () => connection.closeSync() };
}

function uniqueIds<T extends Row>(
  rows: readonly T[],
  key: keyof T,
): Set<string> {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || value === "") {
      throw new Error(`${String(key)} must be a non-empty string`);
    }
    if (values.has(value)) {
      throw new Error(`duplicate ${String(key)}: ${value}`);
    }
    values.add(value);
  }
  return values;
}

function expectCount(
  name: string,
  rows: readonly Row[],
  expected: number,
): void {
  if (rows.length !== expected) {
    throw new Error(
      `${name} row count mismatch: expected ${expected}, got ${rows.length}`,
    );
  }
}

function csvCell(value: CsvValue): string {
  if (value === null) {
    return "";
  }
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dateAfter(start: string, offsetDays: number): string {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function pick<T>(values: readonly T[], index: number): T {
  return at(values, index % values.length, "value");
}

function at<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`${label} not found at index ${index}`);
  }
  return value;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseArgs(args: string[]): { outputRoot?: string } {
  const parsed: { outputRoot?: string } = {};
  for (const arg of args) {
    if (arg.startsWith("--output-root=")) {
      parsed.outputRoot = arg.slice("--output-root=".length);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await writeSupportActivitySample(options);
  const counts = await verifyWrittenSample(result.outputRoot);
  console.log(`[OK] support activity sample generated: ${result.outputRoot}`);
  for (const tableName of TABLE_NAMES) {
    console.log(`[OK] ${tableName}: ${counts[tableName]} rows`);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
