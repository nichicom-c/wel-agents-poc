import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Icon } from "./Icon.tsx";

describe("Icon", () => {
  test("decorative Material Symbols icon を aria-hidden で描画する", () => {
    const html = renderToStaticMarkup(<Icon name="menu" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="app-icon"');
    expect(html).toContain(">menu<");
  });

  test("filled state と追加 class を CSS custom property で表現する", () => {
    const html = renderToStaticMarkup(
      <Icon className="send-button-icon" filled name="arrow_upward" />,
    );

    expect(html).toContain('class="app-icon send-button-icon"');
    expect(html).toContain("--icon-fill:1");
    expect(html).toContain(">arrow_upward<");
  });
});
