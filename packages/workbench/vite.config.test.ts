import { describe, expect, test } from "bun:test";

import {
  buildWorkbenchViteConfig,
  resolveWorkbenchDevConfig,
} from "./vite.config.ts";

describe("resolveWorkbenchDevConfig", () => {
  test("既定値を返す", () => {
    expect(resolveWorkbenchDevConfig({})).toEqual({
      bffUrl: "http://localhost:4174",
      host: "127.0.0.1",
      https: false,
      port: 4175,
    });
  });

  test("Workbench 用 env を trim して読み取る", () => {
    expect(
      resolveWorkbenchDevConfig({
        BFF_URL: " https://example.com/api/soap-draft/ ",
        WORKBENCH_HOST: " 0.0.0.0 ",
        WORKBENCH_PORT: "5175",
      }),
    ).toEqual({
      bffUrl: "https://example.com",
      host: "0.0.0.0",
      https: false,
      port: 5175,
    });
  });

  test("WORKBENCH_HTTPS=true を https: true として読み取る", () => {
    expect(
      resolveWorkbenchDevConfig({ WORKBENCH_HTTPS: " true " }),
    ).toMatchObject({
      https: true,
    });
    expect(resolveWorkbenchDevConfig({ WORKBENCH_HTTPS: "1" })).toMatchObject({
      https: true,
    });
    expect(
      resolveWorkbenchDevConfig({ WORKBENCH_HTTPS: "false" }),
    ).toMatchObject({ https: false });
  });
});

describe("buildWorkbenchViteConfig", () => {
  test("packages/workbench を root にして dist/workbench へ build する", () => {
    const config = buildWorkbenchViteConfig({
      bffUrl: "https://example.com",
      host: "127.0.0.1",
      https: false,
      port: 4175,
    });

    expect(config.root).toEndWith("/packages/workbench/");
    expect(config.envDir).toBe(config.root);
    expect(config.plugins).toHaveLength(1);
    expect(config.build?.outDir).toBe("../../dist/workbench");
    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 4175,
      proxy: {
        "/api/soap-draft": {
          changeOrigin: true,
          target: "https://example.com",
        },
      },
      strictPort: true,
    });
    expect(config.preview).toMatchObject({
      host: "127.0.0.1",
      port: 4175,
      proxy: {
        "/api/soap-draft": {
          changeOrigin: true,
          target: "https://example.com",
        },
      },
      strictPort: true,
    });
  });

  test("読み込んだ Workbench env が proxy target / host / port を駆動する", () => {
    const config = buildWorkbenchViteConfig(
      resolveWorkbenchDevConfig({
        BFF_URL: "https://bff.example.com",
        WORKBENCH_HOST: "0.0.0.0",
        WORKBENCH_PORT: "5180",
      }),
    );

    expect(config.server).toMatchObject({
      host: "0.0.0.0",
      port: 5180,
      proxy: { "/api/soap-draft": { target: "https://bff.example.com" } },
    });
    expect(config.preview).toMatchObject({
      host: "0.0.0.0",
      port: 5180,
      proxy: { "/api/soap-draft": { target: "https://bff.example.com" } },
    });
  });

  test("WORKBENCH_HTTPS=true の場合だけ basicSsl plugin を追加する", () => {
    const httpsConfig = buildWorkbenchViteConfig(
      resolveWorkbenchDevConfig({ WORKBENCH_HTTPS: "true" }),
    );
    const httpConfig = buildWorkbenchViteConfig(resolveWorkbenchDevConfig({}));

    expect(httpsConfig.plugins).toHaveLength(2);
    expect(httpConfig.plugins).toHaveLength(1);
  });
});
