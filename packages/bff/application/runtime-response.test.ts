import { describe, expect, test } from "bun:test";

import { parseRuntimeBody } from "./runtime-response.ts";

describe("parseRuntimeBody", () => {
  test("event stream の data 行を response にまとめる", () => {
    expect(
      parseRuntimeBody(
        "event: chunk\ndata: hello\n\ndata: world\n\ndata: [DONE]\n",
        "text/event-stream",
      ),
    ).toEqual({
      contentType: "text/event-stream",
      response: "hello\nworld",
    });
  });
});
