import { describe, expect, test } from "bun:test";

import {
  buildChatUiViteConfig,
  resolveChatUiDevConfig,
} from "./vite.config.ts";

describe("resolveChatUiDevConfig", () => {
  test("既定値を返す", () => {
    expect(resolveChatUiDevConfig({})).toEqual({
      bffUrl: "http://localhost:4174",
      host: "127.0.0.1",
      port: 4173,
    });
  });

  test("Chat UI 用 env を trim して読み取る", () => {
    expect(
      resolveChatUiDevConfig({
        BFF_URL: " https://example.com/api/dev-info/ ",
        CHAT_UI_HOST: " 0.0.0.0 ",
        CHAT_UI_PORT: "5173",
      }),
    ).toEqual({
      bffUrl: "https://example.com",
      host: "0.0.0.0",
      port: 5173,
    });
  });
});

describe("buildChatUiViteConfig", () => {
  test("packages/chat-ui を root にして dist/chat-ui へ build する", () => {
    const config = buildChatUiViteConfig({
      bffUrl: "https://example.com",
      host: "127.0.0.1",
      port: 4173,
    });

    expect(config.root).toEndWith("/packages/chat-ui/");
    // env 所有権は packages/chat-ui 側。envDir は root（packages/chat-ui）と一致する。
    expect(config.envDir).toBe(config.root);
    expect(config.build?.outDir).toBe("../../dist/chat-ui");
    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/api/chat": {
          changeOrigin: true,
          target: "https://example.com",
        },
        "/api/dev-info": {
          changeOrigin: true,
          target: "https://example.com",
        },
        "/api/ws-url": {
          changeOrigin: true,
          target: "https://example.com",
        },
      },
      strictPort: true,
    });
    expect(config.preview).toMatchObject({
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/api/chat": {
          changeOrigin: true,
          target: "https://example.com",
        },
        "/api/dev-info": {
          changeOrigin: true,
          target: "https://example.com",
        },
        "/api/ws-url": {
          changeOrigin: true,
          target: "https://example.com",
        },
      },
      strictPort: true,
    });
  });

  test("読み込んだ Chat UI env が proxy target / host / port を駆動する", () => {
    const config = buildChatUiViteConfig(
      resolveChatUiDevConfig({
        BFF_URL: "https://bff.example.com",
        CHAT_UI_HOST: "0.0.0.0",
        CHAT_UI_PORT: "5180",
      }),
    );

    expect(config.server).toMatchObject({
      host: "0.0.0.0",
      port: 5180,
      proxy: {
        "/api/chat": { target: "https://bff.example.com" },
        "/api/ws-url": { target: "https://bff.example.com" },
      },
    });
    expect(config.preview).toMatchObject({
      host: "0.0.0.0",
      port: 5180,
      proxy: {
        "/api/chat": { target: "https://bff.example.com" },
        "/api/ws-url": { target: "https://bff.example.com" },
      },
    });
  });
});
