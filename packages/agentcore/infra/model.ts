/**
 * Config / env から Amazon Bedrock の {@link BedrockModel} を生成する factory。
 *
 * model ID と region は {@link Config}（= env / Terraform variables / IAM role 由来）から供給し、
 * source には hardcode しない。
 */

import { BedrockModel } from "@strands-agents/sdk";

import type { Config } from "./config.ts";

/**
 * Config から BedrockModel を生成する。modelId / region は空なら渡さず SDK 既定へ委ねる。
 */
export function makeBedrockModel(config: Config): BedrockModel {
  return new BedrockModel({
    ...(config.modelId ? { modelId: config.modelId } : {}),
    ...(config.region ? { region: config.region } : {}),
  });
}
