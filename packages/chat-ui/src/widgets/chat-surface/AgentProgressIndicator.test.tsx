import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentProgressIndicator } from "./AgentProgressIndicator.tsx";

describe("AgentProgressIndicator", () => {
  test("progress label を polite status として描画する", () => {
    const html = renderToStaticMarkup(
      <AgentProgressIndicator
        progress={{ label: "データベース確認中", tone: "active" }}
      />,
    );

    expect(html).toContain('class="agent-progress"');
    expect(html).toContain('data-tone="active"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("データベース確認中");
  });
});
