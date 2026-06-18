import type { Model } from "@strands-agents/sdk";

import type { Config } from "../infra/config.ts";
import type { RetrieveClient } from "../infra/knowledge-base.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { StructuredDataProvider } from "../infra/structured-data.ts";

/** agent 組み立ての依存。テストでは kbClient / supportActivityProvider / modelFor を注入する。 */
export type AgentDeps = {
  config: Config;
  /** KB tool に注入する retrieve client（テスト用）。 */
  kbClient?: RetrieveClient;
  /** support_activity structured-data provider（テスト用）。 */
  supportActivityProvider?: StructuredDataProvider;
  /** role（"supervisor" または専門 agent の key）ごとの model を返す。省略時は BedrockModel。 */
  modelFor?: (role: string) => Model;
};

export function modelFor(deps: AgentDeps, role: string): Model {
  return deps.modelFor?.(role) ?? makeBedrockModel(deps.config);
}
