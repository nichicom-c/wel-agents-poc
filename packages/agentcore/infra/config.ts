/**
 * AgentCore Runtime の実行設定を環境変数から読み取る。
 *
 * AgentCore Runtime には Terraform が environment_variables を渡す（generation model ID、
 * 複数の Knowledge Base ID、AgentCore Memory ID、region）。設定の解決を 1 か所に集約し、
 * 未設定の必須項目を {@link missingConfig} で列挙できるようにすることで、server / runtime 側を
 * 薄く保つ。secret や resource ID は env / IAM role から供給し、source には hardcode しない。
 */

/** 専門 agent の内部識別子。locals.tf の domains / runtime_env のキーと一致させる。 */
export const DOMAIN_KEYS = [
  "database",
  "document",
  "law",
  "medical_care_law",
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

/**
 * 各専門 agent が使う Knowledge Base ID を渡す環境変数名。
 * key は内部の専門 agent 識別子、value は Terraform が runtime に渡す環境変数名。
 */
export const KB_ENV_VARS: Record<DomainKey, string> = {
  database: "DATABASE_KB_ID",
  document: "DOCUMENT_KB_ID",
  law: "LAW_KB_ID",
  medical_care_law: "MEDICAL_CARE_LAW_KB_ID",
};

/** Knowledge Base retrieval で取得するチャンク数の既定値。 */
export const DEFAULT_NUMBER_OF_RESULTS = 5;

/** 環境変数の読み取り元。テストでは任意の object を渡せる（process.env を汚さない）。 */
export type EnvSource = Record<string, string | undefined>;

export type SupportActivityConfig = {
  /** Bedrock SQL Knowledge Base ID used by Retrieve. */
  readonly kbId: string;
  /** Bedrock SQL Knowledge Base ARN used by optional GenerateQuery debug output. */
  readonly kbArn: string;
  /** Include generated SQL in tool output for developer debugging. */
  readonly includeGeneratedSql: boolean;
};

/** 実行時設定。生成後は不変として扱う。 */
export type Config = {
  /** supervisor / 専門 agent が使う Amazon Bedrock generation model ID。 */
  readonly modelId: string;
  /** Bedrock / KB / Memory client の region（未設定なら AWS SDK の既定解決に委ねる）。 */
  readonly region: string | undefined;
  /** ドメインごとの Knowledge Base ID。 */
  readonly kbIds: Readonly<Record<DomainKey, string>>;
  /** AgentCore Memory ID（任意。未設定でも履歴なしで会話は動く）。 */
  readonly memoryId: string | undefined;
  /** Knowledge Base retrieval で取得するチャンク数。 */
  readonly numberOfResults: number;
  /** support_activity structured-data RAG の provider 設定。 */
  readonly supportActivity: SupportActivityConfig;
};

/** trim 後に非空の値だけを返す（空文字・空白のみは未設定扱い）。 */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * retrieval 件数を解析する。正の整数のみ採用し、それ以外（空文字・0・負数・非数）は既定値。
 *
 * `Number("")` は 0 になり Number.isFinite を通過するため、trim 後の非空判定で先に弾く。
 */
function parseNumberOfResults(value: string | undefined): number {
  const raw = nonEmpty(value);
  if (raw === undefined) {
    return DEFAULT_NUMBER_OF_RESULTS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_NUMBER_OF_RESULTS;
  }
  return parsed;
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = nonEmpty(value)?.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * 環境変数（既定では process.env）から設定を組み立てる。
 *
 * region は AgentCore Runtime / AWS SDK の慣例に合わせ AWS_DEFAULT_REGION を優先し、
 * 無ければ AWS_REGION を使う。
 */
export function configFromEnv(env: EnvSource = process.env): Config {
  const kbIds = Object.fromEntries(
    DOMAIN_KEYS.map((key) => [key, nonEmpty(env[KB_ENV_VARS[key]]) ?? ""]),
  ) as Record<DomainKey, string>;

  return {
    modelId: nonEmpty(env.BEDROCK_MODEL_ID) ?? "",
    region: nonEmpty(env.AWS_DEFAULT_REGION) ?? nonEmpty(env.AWS_REGION),
    kbIds,
    memoryId: nonEmpty(env.AGENTCORE_MEMORY_ID),
    numberOfResults: parseNumberOfResults(env.KB_NUMBER_OF_RESULTS),
    supportActivity: {
      kbId: nonEmpty(env.SUPPORT_ACTIVITY_KB_ID) ?? "",
      kbArn: nonEmpty(env.SUPPORT_ACTIVITY_KB_ARN) ?? "",
      includeGeneratedSql: parseBoolean(
        env.SUPPORT_ACTIVITY_INCLUDE_GENERATED_SQL,
      ),
    },
  };
}

/**
 * 必須項目のうち未設定のものを環境変数名で返す（空なら設定は完全）。
 * Memory は任意なので含めない。
 */
export function missingConfig(config: Config): string[] {
  const missing: string[] = [];
  if (!config.modelId) {
    missing.push("BEDROCK_MODEL_ID");
  }
  for (const key of DOMAIN_KEYS) {
    if (!config.kbIds[key]) {
      missing.push(KB_ENV_VARS[key]);
    }
  }
  if (!config.supportActivity.kbId) {
    missing.push("SUPPORT_ACTIVITY_KB_ID");
  }
  if (
    config.supportActivity.includeGeneratedSql &&
    !config.supportActivity.kbArn
  ) {
    missing.push("SUPPORT_ACTIVITY_KB_ARN");
  }
  return missing;
}
