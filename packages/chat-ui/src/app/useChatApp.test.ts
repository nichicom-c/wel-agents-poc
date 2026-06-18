import { describe, expect, test } from "bun:test";

import { mainViewFromHash } from "./useChatApp.ts";

describe("mainViewFromHash", () => {
  test("Knowledge Base domain hash を detail view にする", () => {
    expect(mainViewFromHash("#knowledge-bases/medical_care_law")).toEqual({
      domain: "medical_care_law",
      type: "knowledge-base",
    });
  });

  test("未知 domain と不正 encoding は chat view に戻す", () => {
    expect(mainViewFromHash("#knowledge-bases/unknown")).toEqual({
      type: "chat",
    });
    expect(mainViewFromHash("#knowledge-bases/%")).toEqual({
      type: "chat",
    });
  });
});
