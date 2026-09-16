import { describe, expect, test } from "bun:test";

import { canViewTraining } from "./roles.ts";

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
