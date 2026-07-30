import { describe, expect, test } from "bun:test";

import {
  canAttemptExercise,
  canReviewAsInstructor,
  canViewTraining,
} from "./roles.ts";

describe("canViewTraining", () => {
  test("trainee / instructor / admin は参照できる", () => {
    expect(canViewTraining("trainee")).toBe(true);
    expect(canViewTraining("instructor")).toBe(true);
    expect(canViewTraining("admin")).toBe(true);
  });

  test("nurse / reviewer / guest は参照できない", () => {
    expect(canViewTraining("nurse")).toBe(false);
    expect(canViewTraining("reviewer")).toBe(false);
    expect(canViewTraining("guest")).toBe(false);
  });
});

describe("canAttemptExercise", () => {
  test("trainee だけが演習に回答できる", () => {
    expect(canAttemptExercise("trainee")).toBe(true);
    expect(canAttemptExercise("instructor")).toBe(false);
    expect(canAttemptExercise("admin")).toBe(false);
  });
});

describe("canReviewAsInstructor", () => {
  test("instructor / admin だけが指導者ビューを見られる", () => {
    expect(canReviewAsInstructor("instructor")).toBe(true);
    expect(canReviewAsInstructor("admin")).toBe(true);
    expect(canReviewAsInstructor("trainee")).toBe(false);
  });
});
