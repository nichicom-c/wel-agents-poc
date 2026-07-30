import { describe, expect, test } from "bun:test";

import { canViewAdmin } from "./roles.ts";

describe("canViewAdmin", () => {
  test("admin だけが管理画面を参照できる", () => {
    expect(canViewAdmin("admin")).toBe(true);
    expect(canViewAdmin("nurse")).toBe(false);
    expect(canViewAdmin("reviewer")).toBe(false);
    expect(canViewAdmin("trainee")).toBe(false);
    expect(canViewAdmin("guest")).toBe(false);
  });
});
