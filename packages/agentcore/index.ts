import { handleRequest, startAgentCoreServer } from "./adapters/http-server.ts";

export type { Responder } from "./contracts/runtime.ts";
export { handleRequest, startAgentCoreServer };

if (import.meta.main) {
  startAgentCoreServer();
}
