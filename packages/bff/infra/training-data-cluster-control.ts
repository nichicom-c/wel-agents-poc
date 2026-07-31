import {
  DescribeDBClustersCommand,
  type DescribeDBClustersCommandOutput,
  RDSClient,
  StartDBClusterCommand,
} from "@aws-sdk/client-rds";

export interface RdsControlPlaneClient {
  send(command: StartDBClusterCommand): Promise<unknown>;
  send(
    command: DescribeDBClustersCommand,
  ): Promise<DescribeDBClustersCommandOutput>;
}

export type TrainingDataClusterConfig = {
  clusterArn: string;
};

export type TrainingDataClusterControl = {
  getStatus: (config: TrainingDataClusterConfig) => Promise<string>;
  start: (config: TrainingDataClusterConfig) => Promise<string>;
};

export type MakeTrainingDataClusterControlOptions = {
  client?: RdsControlPlaneClient;
  region?: string;
};

export function makeTrainingDataClusterControl({
  client,
  region,
}: MakeTrainingDataClusterControlOptions = {}): TrainingDataClusterControl {
  const rdsClient = client ?? new RDSClient(region ? { region } : {});

  return {
    getStatus: (config) => getClusterStatus(rdsClient, config),
    start: (config) => startCluster(rdsClient, config),
  };
}

async function getClusterStatus(
  client: RdsControlPlaneClient,
  { clusterArn }: TrainingDataClusterConfig,
): Promise<string> {
  const result = await client.send(
    new DescribeDBClustersCommand({ DBClusterIdentifier: clusterArn }),
  );
  return result.DBClusters?.[0]?.Status ?? "unknown";
}

/**
 * scale-to-zero の自動 pause と違い、手動 stop された cluster は Data API 呼び出しでは
 * 復帰しない（`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）ため、
 * 明示的に `StartDBCluster` を呼ぶ。既に available / starting 等の場合 AWS は
 * `InvalidDBClusterStateFault` を返すが、これは失敗ではなく現在の status を返せば十分。
 */
async function startCluster(
  client: RdsControlPlaneClient,
  config: TrainingDataClusterConfig,
): Promise<string> {
  try {
    await client.send(
      new StartDBClusterCommand({ DBClusterIdentifier: config.clusterArn }),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.name !== "InvalidDBClusterStateFault"
    ) {
      throw error;
    }
  }

  return getClusterStatus(client, config);
}
