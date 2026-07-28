import { describe, expect, test } from "bun:test";

import { isPollingPhase, isSettledPhase } from "./recording-phase.ts";

describe("isSettledPhase", () => {
  test("succeeded / failed だけ true にする", () => {
    expect(isSettledPhase("succeeded")).toBe(true);
    expect(isSettledPhase("failed")).toBe(true);
    expect(isSettledPhase("queued")).toBe(false);
    expect(isSettledPhase("running")).toBe(false);
    expect(isSettledPhase("idle")).toBe(false);
  });
});

describe("isPollingPhase", () => {
  test("queued / running だけ true にする", () => {
    expect(isPollingPhase("queued")).toBe(true);
    expect(isPollingPhase("running")).toBe(true);
    expect(isPollingPhase("succeeded")).toBe(false);
    expect(isPollingPhase("failed")).toBe(false);
    expect(isPollingPhase("recording")).toBe(false);
  });
});
