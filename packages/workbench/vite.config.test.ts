import { describe, expect, test } from "bun:test";

import {
  buildWorkbenchViteConfig,
  resolveWorkbenchDevConfig,
} from "./vite.config.ts";

describe("resolveWorkbenchDevConfig", () => {
  test("既定値を返す", () => {
    expect(resolveWorkbenchDevConfig({})).toEqual({
      host: "127.0.0.1",
      port: 4175,
    });
  });

  test("Workbench 用 env を trim して読み取る", () => {
    expect(
      resolveWorkbenchDevConfig({
        WORKBENCH_HOST: " 0.0.0.0 ",
        WORKBENCH_PORT: "5175",
      }),
    ).toEqual({
      host: "0.0.0.0",
      port: 5175,
    });
  });
});

describe("buildWorkbenchViteConfig", () => {
  test("packages/workbench を root にして dist/workbench へ build する", () => {
    const config = buildWorkbenchViteConfig({
      host: "127.0.0.1",
      port: 4175,
    });

    expect(config.root).toEndWith("/packages/workbench/");
    expect(config.envDir).toBe(config.root);
    expect(config.build?.outDir).toBe("../../dist/workbench");
    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 4175,
      strictPort: true,
    });
    expect(config.preview).toMatchObject({
      host: "127.0.0.1",
      port: 4175,
      strictPort: true,
    });
  });
});
