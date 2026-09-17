import { describe, expect, test } from "bun:test";

import type { Masters } from "../contracts/masters.ts";
import {
  type HandleMastersOptions,
  handleMastersRequest,
} from "./handle-masters-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const EMPTY: Masters = {
  difficultyLevels: [],
  learningThemes: [],
  rejectionReasonCodes: [],
  specialties: [],
};

function baseOptions(
  overrides: Partial<HandleMastersOptions> = {},
): HandleMastersOptions {
  return {
    authContext: AUTH_CONTEXT,
    getMasters: async () => EMPTY,
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleMastersRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "OPTIONS", path: "/api/masters" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("GET 以外は 404 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "POST", path: "/api/masters" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "GET", path: "/api/masters" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "GET", path: "/api/masters" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  test("4種のマスタをそのまま返す", async () => {
    const response = await handleMastersRequest(
      { method: "GET", path: "/api/masters" },
      baseOptions({
        getMasters: async () => ({
          difficultyLevels: [{ id: "beginner", label: "初級" }],
          learningThemes: [{ id: "documentation", label: "記録表現" }],
          rejectionReasonCodes: [{ code: "other", label: "その他" }],
          specialties: [{ id: "maternal-child", label: "母子保健" }],
        }),
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      difficultyLevels: [{ id: "beginner", label: "初級" }],
      learningThemes: [{ id: "documentation", label: "記録表現" }],
      rejectionReasonCodes: [{ code: "other", label: "その他" }],
      specialties: [{ id: "maternal-child", label: "母子保健" }],
    });
  });

  test("getMasters が例外を投げたら 502 を返す", async () => {
    const response = await handleMastersRequest(
      { method: "GET", path: "/api/masters" },
      baseOptions({
        getMasters: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(response.statusCode).toBe(502);
  });
});
