import { describe, expect, test } from "bun:test";

import {
  buildReflectionSelections,
  toggleReflectionSelection,
} from "./reflection-selections.ts";

describe("buildReflectionSelections", () => {
  test("推薦された記録種別だけを true にする", () => {
    expect(buildReflectionSelections(["support_activity", "summary"])).toEqual({
      support_activity: true,
      general_record: false,
      meeting: false,
      summary: true,
    });
  });

  test("推薦が空なら全て false", () => {
    expect(buildReflectionSelections([])).toEqual({
      support_activity: false,
      general_record: false,
      meeting: false,
      summary: false,
    });
  });
});

describe("toggleReflectionSelection", () => {
  test("指定した記録種別だけを反転し、他は変えない", () => {
    const initial = buildReflectionSelections(["support_activity"]);

    const toggledOff = toggleReflectionSelection(initial, "support_activity");
    expect(toggledOff.support_activity).toBe(false);

    const toggledOn = toggleReflectionSelection(toggledOff, "meeting");
    expect(toggledOn.meeting).toBe(true);
    expect(toggledOn.support_activity).toBe(false);
    expect(toggledOn.general_record).toBe(false);
    expect(toggledOn.summary).toBe(false);
  });
});
