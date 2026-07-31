import { describe, expect, test } from "bun:test";

import {
  makeTrainingDataClusterControl,
  type RdsControlPlaneClient,
} from "./training-data-cluster-control.ts";

const CLUSTER_ARN =
  "arn:aws:rds:ap-northeast-1:328513660901:cluster:wel-agents-bff-training-data";

type RecordedCommand = {
  constructor: { name: string };
  input?: unknown;
};

class FakeRdsClient implements RdsControlPlaneClient {
  readonly calls: RecordedCommand[] = [];
  status = "stopped";
  startError: Error | undefined;

  async send(command: RecordedCommand): Promise<never> {
    this.calls.push(command);
    const name = command.constructor.name;

    if (name === "StartDBClusterCommand") {
      if (this.startError) {
        throw this.startError;
      }
      this.status = "starting";
      return undefined as never;
    }

    if (name === "DescribeDBClustersCommand") {
      return { DBClusters: [{ Status: this.status }] } as never;
    }

    throw new Error(`unexpected command: ${name}`);
  }
}

describe("makeTrainingDataClusterControl", () => {
  test("getStatus は DescribeDBClusters の Status を返す", async () => {
    const client = new FakeRdsClient();
    const control = makeTrainingDataClusterControl({ client });

    const status = await control.getStatus({ clusterArn: CLUSTER_ARN });

    expect(status).toBe("stopped");
    expect(client.calls).toHaveLength(1);
  });

  test("status が見つからなければ unknown を返す", async () => {
    const client = new FakeRdsClient();
    client.status = undefined as unknown as string;
    const control = makeTrainingDataClusterControl({ client });

    const status = await control.getStatus({ clusterArn: CLUSTER_ARN });

    expect(status).toBe("unknown");
  });

  test("start は StartDBCluster を呼んでから最新 status を返す", async () => {
    const client = new FakeRdsClient();
    const control = makeTrainingDataClusterControl({ client });

    const status = await control.start({ clusterArn: CLUSTER_ARN });

    expect(status).toBe("starting");
    expect(client.calls.map((call) => call.constructor.name)).toEqual([
      "StartDBClusterCommand",
      "DescribeDBClustersCommand",
    ]);
  });

  test("既に起動中/起動済みの InvalidDBClusterStateFault は無視して現在の status を返す", async () => {
    const client = new FakeRdsClient();
    client.status = "available";
    const invalidStateError = new Error("cluster is already available");
    invalidStateError.name = "InvalidDBClusterStateFault";
    client.startError = invalidStateError;
    const control = makeTrainingDataClusterControl({ client });

    const status = await control.start({ clusterArn: CLUSTER_ARN });

    expect(status).toBe("available");
  });

  test("InvalidDBClusterStateFault 以外の error は re-throw する", async () => {
    const client = new FakeRdsClient();
    client.startError = new Error("AccessDeniedException");
    const control = makeTrainingDataClusterControl({ client });

    await expect(control.start({ clusterArn: CLUSTER_ARN })).rejects.toThrow(
      "AccessDeniedException",
    );
  });
});
