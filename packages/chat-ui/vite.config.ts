import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const DEFAULT_BFF_URL = "http://localhost:4174";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export type ChatUiDevConfig = {
  bffUrl: string;
  host: string;
  port: number;
};

export function resolveChatUiDevConfig(
  env: Record<string, string | undefined> = process.env,
): ChatUiDevConfig {
  return {
    bffUrl: normalizeBffUrl(clean(env.BFF_URL) || DEFAULT_BFF_URL),
    host: clean(env.CHAT_UI_HOST) || DEFAULT_HOST,
    port: positiveInt(env.CHAT_UI_PORT) || DEFAULT_PORT,
  };
}

export function buildChatUiViteConfig(
  config = resolveChatUiDevConfig(),
): UserConfig {
  const proxy = {
    "/api/chat": {
      changeOrigin: true,
      target: config.bffUrl,
    },
    "/api/dev-info": {
      changeOrigin: true,
      target: config.bffUrl,
    },
    "/api/sessions": {
      changeOrigin: true,
      target: config.bffUrl,
    },
    "/api/ws-url": {
      changeOrigin: true,
      target: config.bffUrl,
    },
  };

  return {
    root: rootDir,
    envDir: rootDir,
    plugins: [react(), pingPlugin()],
    publicDir: "public",
    server: {
      host: config.host,
      port: config.port,
      proxy,
      strictPort: true,
    },
    preview: {
      host: config.host,
      port: config.port,
      proxy,
      strictPort: true,
    },
    build: {
      emptyOutDir: true,
      outDir: "../../dist/chat-ui",
    },
  };
}

function pingPlugin(): Plugin {
  return {
    name: "chat-ui-ping",
    configureServer(server) {
      server.middlewares.use(pingMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(pingMiddleware);
    },
  };
}

function pingMiddleware(
  request: { method?: string; url?: string },
  response: {
    end: (body: string) => void;
    setHeader: (name: string, value: string) => void;
    statusCode: number;
  },
  next: () => void,
) {
  const pathname = request.url?.split("?")[0];

  if (request.method === "GET" && pathname === "/ping") {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        status: "healthy",
        time_of_last_update: Math.floor(Date.now() / 1000),
      }),
    );
    return;
  }

  next();
}

function clean(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function normalizeBffUrl(value: string) {
  return value
    .replace(/\/api\/(?:chat|dev-info|sessions|ws-url)\/?$/, "")
    .replace(/\/+$/, "");
}

function positiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default defineConfig(({ mode }) => {
  // Chat UI が env の所有者。envDir（rootDir）配下の `.env*` を読み、空 prefix なので
  // shell-export された process.env が `.env` 値を上書きする。VITE_* の browser 注入とは別に、
  // proxy target / host / port のような config-time 値をここで明示的に解決する。
  const env = loadEnv(mode, rootDir, "");
  return buildChatUiViteConfig(resolveChatUiDevConfig(env));
});
