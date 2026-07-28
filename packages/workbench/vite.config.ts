import { fileURLToPath } from "node:url";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4175;
const DEFAULT_BFF_URL = "http://localhost:4174";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export type WorkbenchDevConfig = {
  bffUrl: string;
  host: string;
  https: boolean;
  port: number;
};

export function resolveWorkbenchDevConfig(
  env: Record<string, string | undefined> = process.env,
): WorkbenchDevConfig {
  return {
    bffUrl: normalizeBffUrl(clean(env.BFF_URL) || DEFAULT_BFF_URL),
    host: clean(env.WORKBENCH_HOST) || DEFAULT_HOST,
    https: isTruthy(env.WORKBENCH_HTTPS),
    port: positiveInt(env.WORKBENCH_PORT) || DEFAULT_PORT,
  };
}

export function buildWorkbenchViteConfig(
  config = resolveWorkbenchDevConfig(),
): UserConfig {
  const proxy = {
    "/api/soap-draft": {
      changeOrigin: true,
      target: config.bffUrl,
    },
    "/api/voice-recordings": {
      changeOrigin: true,
      target: config.bffUrl,
    },
  };

  return {
    root: rootDir,
    envDir: rootDir,
    // basicSsl は自己署名証明書で dev/preview server を https 化する（WORKBENCH_HTTPS=true の時だけ）。
    // マイク録音（getUserMedia）は secure context 必須で、localhost 以外（ネットワークIP経由）から
    // 使う場合はこれが無いと動かない。ブラウザは自己署名証明書の警告を出すので、初回は許可する。
    plugins: config.https ? [react(), basicSsl()] : [react()],
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
      outDir: "../../dist/workbench",
    },
  };
}

function clean(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function isTruthy(value: string | undefined) {
  const cleaned = value?.trim().toLowerCase();
  return cleaned === "true" || cleaned === "1";
}

function normalizeBffUrl(value: string) {
  return value.replace(/\/api\/soap-draft\/?$/, "").replace(/\/+$/, "");
}

function positiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  return buildWorkbenchViteConfig(resolveWorkbenchDevConfig(env));
});
