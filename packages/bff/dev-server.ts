import {
  type BffDevConfig,
  handleBffDevRequest,
  resolveBffDevConfig,
  startBffDevServer,
} from "./adapters/dev-server.ts";

export {
  type BffDevConfig,
  handleBffDevRequest,
  resolveBffDevConfig,
  startBffDevServer,
};

if (import.meta.main) {
  startBffDevServer();
}
