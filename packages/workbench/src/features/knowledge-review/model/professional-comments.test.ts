import { describe, expect, test } from "bun:test";

import {
  createComment,
  filterCommentsByVersion,
  type ProfessionalComment,
} from "./professional-comments.ts";

describe("createComment", () => {
  test("id と createdAt を採番して付与する", () => {
    const comment = createComment({
      authorName: "author-a",
      authorRole: "nurse",
      body: "body text",
      commentType: "review",
      targetRecordId: "record-1",
      targetRecordVersionId: "record-1-v1",
    });

    expect(typeof comment.id).toBe("string");
    expect(comment.id.length).toBeGreaterThan(0);
    expect(typeof comment.createdAt).toBe("string");
    expect(comment.body).toBe("body text");
  });

  test("投稿時点の authorRole をそのまま保持する（後からロールが変わっても影響しない）", () => {
    const comment = createComment({
      authorName: "author-a",
      authorRole: "reviewer",
      body: "body text",
      commentType: "instruction_note",
      targetRecordId: "record-1",
      targetRecordVersionId: "record-1-v1",
    });

    expect(comment.authorRole).toBe("reviewer");
  });
});

describe("filterCommentsByVersion", () => {
  const comments: ProfessionalComment[] = [
    createComment({
      authorName: "a",
      authorRole: "nurse",
      body: "1",
      commentType: "review",
      targetRecordId: "record-1",
      targetRecordVersionId: "record-1-v1",
    }),
    createComment({
      authorName: "b",
      authorRole: "nurse",
      body: "2",
      commentType: "review",
      targetRecordId: "record-1",
      targetRecordVersionId: "record-1-v2",
    }),
  ];

  test("指定した版のコメントだけを返す", () => {
    const result = filterCommentsByVersion(comments, "record-1-v1");
    expect(result).toHaveLength(1);
    expect(result[0]?.body).toBe("1");
  });

  test("該当する版が無ければ空配列を返す", () => {
    expect(filterCommentsByVersion(comments, "record-1-v3")).toHaveLength(0);
  });
});
