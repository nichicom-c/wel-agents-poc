import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4175;

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export type WorkbenchDevConfig = {
  host: string;
  port: number;
};

export function resolveWorkbenchDevConfig(
  env: Record<string, string | undefined> = process.env,
): WorkbenchDevConfig {
  return {
    host: clean(env.WORKBENCH_HOST) || DEFAULT_HOST,
    port: positiveInt(env.WORKBENCH_PORT) || DEFAULT_PORT,
  };
}

export function buildWorkbenchViteConfig(
  config = resolveWorkbenchDevConfig(),
): UserConfig {
  return {
    root: rootDir,
    envDir: rootDir,
    plugins: [react()],
    publicDir: "public",
    server: {
      host: config.host,
      port: config.port,
      strictPort: true,
    },
    preview: {
      host: config.host,
      port: config.port,
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

function positiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  return buildWorkbenchViteConfig(resolveWorkbenchDevConfig(env));
});
