/**
 * SOAP Studio の「SOAP 下書き生成」画面が呼ぶ組み立てロジック。
 *
 * chat（supervisor）とは独立した単発の分類パスなので、KB id 等を要求する共有の
 * `missingConfig()` は使わず、この機能が実際に必要とする `modelId` だけを確認する。
 * Memory も使わない（stateless な一回限りの分類のため）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import type { SoapDraftOutput } from "../contracts/soap-draft.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { getSoapDraftText } from "../domain/soap-draft.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildSoapDraftAgent } from "./soap-draft-agent.ts";

const EMPTY_OUTPUT: SoapDraftOutput = {
  candidates: [],
  recommendedRecordTypes: [],
};

/** SOAP 下書き agent を実行して候補配列 + 入力全体の反映候補を返す seam（テストで fake を注入）。 */
export type SoapDraftRunner = (message: string) => Promise<SoapDraftOutput>;

export type SoapDraftDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** SOAP 下書き agent 実行（省略時は config から本物の agent を生成）。 */
  soapDraftRunner?: SoapDraftRunner;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の SOAP 下書き agent を生成し、構造化出力をそのまま返す runner。 */
function defaultSoapDraftRunner(config: Config): SoapDraftRunner {
  const deps: AgentDeps = { config };
  const agent = buildSoapDraftAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    // AgentResult.structuredOutput は SDK 側で z.output<z.ZodType> としか型付けされておらず
    // （Agent は schema でジェネリック化されていない）、渡した soapDraftOutputSchema には
    // 静的には紐付かない。SDK が呼び出し時に同じ schema で validate 済みなのでここで cast する。
    const structuredOutput = result.structuredOutput as
      | SoapDraftOutput
      | undefined;
    return structuredOutput ?? EMPTY_OUTPUT;
  };
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → text 必須チェック → 記録種別を前置きしたメッセージ組み立て →
 * SOAP 下書き agent 実行（StructuredOutputError は error 応答に変換）→ 応答整形。
 */
export async function buildSoapDraftResponse(
  payload: RuntimeRequest,
  deps: SoapDraftDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const text = getSoapDraftText(payload);
  if (text === undefined) {
    return { status: "error", error: "Missing required field: text" };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const message = `入力テキスト:\n${text}`;

  const runSoapDraft = deps.soapDraftRunner ?? defaultSoapDraftRunner(config);

  let output: SoapDraftOutput;
  try {
    output = await runSoapDraft(message);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return {
        status: "error",
        error: `SOAP classification did not converge to a valid structure: ${stringifyError(error)}`,
      };
    }
    throw error;
  }

  return {
    status: "success",
    type: "soap_draft",
    candidates: output.candidates,
    recommendedRecordTypes: output.recommendedRecordTypes,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
