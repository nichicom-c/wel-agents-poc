import { describe, expect, test } from "bun:test";

import {
  createCandidateFromComments,
  decideCandidateStatus,
  listCommentsForVersion,
  listMaterialCandidates,
  listSoapRecords,
  listVersionsForRecord,
  postComment,
} from "./knowledge-review.ts";

const SAMPLE_CANDIDATE = {
  comments: [
    {
      authorId: "11111111-1111-1111-1111-111111111111",
      authorName: "鈴木 reviewer",
      authorRoleAtPost: "reviewer",
      body: "comment body",
      commentType: "review",
      createdAt: "2026-07-30T00:00:00.000Z",
      id: "comment-1",
      soapCategory: "P",
      targetRecordId: "record-1",
      targetRecordVersionId: "version-1",
    },
  ],
  createdAt: "2026-07-19T10:00:00.000Z",
  createdBy: "11111111-1111-1111-1111-111111111111",
  difficultyId: "intermediate",
  id: "candidate-1",
  learningThemeId: "support-planning",
  recordType: "support_activity",
  rejectionReasonCode: null,
  specialtyId: "maternal-child",
  status: "candidate",
  statusHistory: [
    {
      changedAt: "2026-07-19T10:00:00.000Z",
      changedBy: "11111111-1111-1111-1111-111111111111",
      changedByRole: "reviewer",
      fromStatus: null,
      toStatus: "candidate",
    },
  ],
  summary: "summary text",
  title: "title text",
};

describe("listMaterialCandidates", () => {
  test("filters を query string に組み立てて BFF /api/material-candidates を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ candidates: [SAMPLE_CANDIDATE] });
    };

    const result = await listMaterialCandidates(
      { recordType: "support_activity", status: "candidate" },
      fetchFn,
    );

    expect(requestedUrl).toBe(
      "/api/material-candidates?recordType=support_activity&status=candidate",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.comments).toHaveLength(1);
    expect(result[0]?.rejectionReasonCode).toBeUndefined();
  });

  test("filters が空なら query string を付けない", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ candidates: [] });
    };

    await listMaterialCandidates({}, fetchFn);

    expect(requestedUrl).toBe("/api/material-candidates");
  });

  test("response.ok が false ならエラーを投げる", async () => {
    const fetchFn = async () =>
      Response.json({ error: "authentication required" }, { status: 401 });

    await expect(listMaterialCandidates({}, fetchFn)).rejects.toThrow(
      "authentication required",
    );
  });
});

describe("decideCandidateStatus", () => {
  test("id を path に、status/reasonCode/reasonText を body に含めて PATCH する", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchFn = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = input;
      requestedInit = init;
      return Response.json({ ...SAMPLE_CANDIDATE, status: "rejected" });
    };

    const result = await decideCandidateStatus(
      "candidate-1",
      "rejected",
      "reviewer",
      { reasonCode: "duplicate_content", reasonText: "既存教材と重複" },
      fetchFn,
    );

    expect(requestedUrl).toBe("/api/material-candidates/candidate-1/status");
    expect(requestedInit?.method).toBe("PATCH");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      changedByRole: "reviewer",
      reasonCode: "duplicate_content",
      reasonText: "既存教材と重複",
      status: "rejected",
    });
    expect(result.status).toBe("rejected");
  });
});

describe("createCandidateFromComments", () => {
  test("body を JSON で POST し、作成された候補を返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json(SAMPLE_CANDIDATE);
    };

    const result = await createCandidateFromComments(
      {
        commentIds: ["comment-1"],
        createdByRole: "reviewer",
        summary: "summary text",
        title: "title text",
      },
      fetchFn,
    );

    expect(requestedUrl).toBe("/api/material-candidates");
    expect(result.id).toBe("candidate-1");
  });
});

describe("listCommentsForVersion", () => {
  test("targetRecordVersionId を query に含めて BFF /api/professional-comments を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({ comments: [SAMPLE_CANDIDATE.comments[0]] });
    };

    const result = await listCommentsForVersion("version-1", fetchFn);

    expect(requestedUrl).toBe(
      "/api/professional-comments?targetRecordVersionId=version-1",
    );
    expect(result).toHaveLength(1);
  });
});

describe("postComment", () => {
  test("body を JSON で POST し、作成されたコメントを返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json(SAMPLE_CANDIDATE.comments[0]);
    };

    const result = await postComment(
      {
        authorRoleAtPost: "reviewer",
        body: "comment body",
        commentType: "review",
        targetRecordId: "record-1",
        targetRecordVersionId: "version-1",
      },
      fetchFn,
    );

    expect(requestedUrl).toBe("/api/professional-comments");
    expect(result.id).toBe("comment-1");
  });
});

describe("listSoapRecords", () => {
  test("BFF /api/soap-records を呼び、正しい形の record だけを返す", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({
        records: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "record-1",
            recordType: "support_activity",
            status: "finalized",
          },
          // recordType が不正な行は除外される。
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "record-2",
            recordType: "unknown",
            status: "finalized",
          },
        ],
      });
    };

    const result = await listSoapRecords(fetchFn);

    expect(requestedUrl).toBe("/api/soap-records");
    expect(result).toEqual([
      {
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        id: "record-1",
        recordType: "support_activity",
        status: "finalized",
      },
    ]);
  });

  test("response.ok が false ならエラーを投げる", async () => {
    const fetchFn = async () =>
      Response.json(
        { error: "training data store is not configured" },
        { status: 503 },
      );

    await expect(listSoapRecords(fetchFn)).rejects.toThrow(
      "training data store is not configured",
    );
  });
});

describe("listVersionsForRecord", () => {
  test("recordId を path に含めて BFF /api/soap-records/:id/versions を呼ぶ", async () => {
    let requestedUrl: string | URL | Request | undefined;
    const fetchFn = async (input: string | URL | Request) => {
      requestedUrl = input;
      return Response.json({
        versions: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "version-1",
            items: [{ category: "S", text: "s text" }],
            recordId: "record-1",
            source: "soap_draft_ai",
            versionNo: 1,
          },
        ],
      });
    };

    const result = await listVersionsForRecord("record-1", fetchFn);

    expect(requestedUrl).toBe("/api/soap-records/record-1/versions");
    expect(result).toEqual([
      {
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "11111111-1111-1111-1111-111111111111",
        id: "version-1",
        items: [{ category: "S", text: "s text" }],
        recordId: "record-1",
        source: "soap_draft_ai",
        versionNo: 1,
      },
    ]);
  });

  test("items が空、または不正な category を含む version は除外する", async () => {
    const fetchFn = async () =>
      Response.json({
        versions: [
          {
            createdAt: "2026-07-30T00:00:00.000Z",
            createdBy: "11111111-1111-1111-1111-111111111111",
            id: "version-1",
            items: [],
            recordId: "record-1",
            source: "soap_draft_ai",
            versionNo: 1,
          },
        ],
      });

    const result = await listVersionsForRecord("record-1", fetchFn);
    expect(result).toEqual([]);
  });
});
