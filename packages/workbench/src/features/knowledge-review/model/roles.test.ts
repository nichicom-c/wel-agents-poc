import { describe, expect, test } from "bun:test";

import {
  canDecideCandidateStatus,
  canPostComment,
  canViewKnowledgeReview,
} from "./roles.ts";

describe("canViewKnowledgeReview", () => {
  test("nurse / reviewer / admin は参照できる", () => {
    expect(canViewKnowledgeReview("nurse")).toBe(true);
    expect(canViewKnowledgeReview("reviewer")).toBe(true);
    expect(canViewKnowledgeReview("admin")).toBe(true);
  });

  test("trainee / guest は参照できない（issue #8 の権限のない利用者）", () => {
    expect(canViewKnowledgeReview("trainee")).toBe(false);
    expect(canViewKnowledgeReview("guest")).toBe(false);
  });
});

describe("canPostComment", () => {
  test("参照できるロールと同じ範囲で投稿できる", () => {
    expect(canPostComment("nurse")).toBe(true);
    expect(canPostComment("trainee")).toBe(false);
  });
});

describe("canDecideCandidateStatus", () => {
  test("reviewer / admin だけが承認/却下/要修正を決定できる", () => {
    expect(canDecideCandidateStatus("reviewer")).toBe(true);
    expect(canDecideCandidateStatus("admin")).toBe(true);
    expect(canDecideCandidateStatus("nurse")).toBe(false);
    expect(canDecideCandidateStatus("trainee")).toBe(false);
    expect(canDecideCandidateStatus("guest")).toBe(false);
  });
});
