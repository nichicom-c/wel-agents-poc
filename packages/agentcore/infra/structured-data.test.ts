import { describe, expect, test } from "bun:test";

import {
  makeStructuredDataTool,
  NO_STRUCTURED_DATA_MESSAGE,
  type StructuredDataProvider,
} from "./structured-data.ts";

describe("makeStructuredDataTool", () => {
  test("model-visible input は query だけで provider に委譲する", async () => {
    const calls: string[] = [];
    const provider: StructuredDataProvider = {
      async query({ query }) {
        calls.push(query);
        return "structured result";
      },
    };

    const tool = makeStructuredDataTool(provider);
    expect(tool.name).toBe("query_structured_data");
    await expect(tool.invoke({ query: "open cases" })).resolves.toBe(
      "structured result",
    );
    expect(calls).toEqual(["open cases"]);
  });

  test("空 query は provider を呼ばず readable message を返す", async () => {
    const provider: StructuredDataProvider = {
      async query() {
        throw new Error("must not be called");
      },
    };

    const tool = makeStructuredDataTool(provider);
    await expect(tool.invoke({ query: "   " })).resolves.toBe(
      NO_STRUCTURED_DATA_MESSAGE,
    );
  });
});
