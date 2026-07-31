import { describe, expect, test } from "bun:test";

import { handleTrainingDataClusterRequest } from "./handle-training-data-cluster-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-user-123",
  userId: "user-123",
};

describe("handleTrainingDataClusterRequest", () => {
  test("GET /api/training-data-cluster は現在の status を返す", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "GET",
        path: "/api/training-data-cluster",
      },
      {
        authContext: AUTH_CONTEXT,
        getClusterStatus: async () => "stopped",
        startCluster: async () => {
          throw new Error("must not be called");
        },
        trainingDataConfigured: true,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "stopped" });
  });

  test("POST /api/training-data-cluster/start は起動後の status を返す", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "POST",
        path: "/api/training-data-cluster/start",
      },
      {
        authContext: AUTH_CONTEXT,
        getClusterStatus: async () => {
          throw new Error("must not be called");
        },
        startCluster: async () => "starting",
        trainingDataConfigured: true,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "starting" });
  });

  test("training data store 未設定なら 503", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "GET",
        path: "/api/training-data-cluster",
      },
      {
        authContext: AUTH_CONTEXT,
        getClusterStatus: async () => {
          throw new Error("must not be called");
        },
        startCluster: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "training data store is not configured",
    });
  });

  test("認証コンテキストがなければ 401", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "GET",
        path: "/api/training-data-cluster",
      },
      {
        getClusterStatus: async () => {
          throw new Error("must not be called");
        },
        startCluster: async () => {
          throw new Error("must not be called");
        },
        trainingDataConfigured: true,
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("AWS error を 502 にする", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "POST",
        path: "/api/training-data-cluster/start",
      },
      {
        authContext: AUTH_CONTEXT,
        getClusterStatus: async () => {
          throw new Error("must not be called");
        },
        logError: () => undefined,
        startCluster: async () => {
          throw new Error("AccessDeniedException");
        },
        trainingDataConfigured: true,
      },
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "training data cluster request failed",
      message: "AccessDeniedException",
    });
  });

  test("未知の path は 404", async () => {
    const response = await handleTrainingDataClusterRequest(
      {
        method: "GET",
        path: "/api/training-data-cluster/unknown",
      },
      {
        authContext: AUTH_CONTEXT,
        getClusterStatus: async () => {
          throw new Error("must not be called");
        },
        startCluster: async () => {
          throw new Error("must not be called");
        },
        trainingDataConfigured: true,
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
