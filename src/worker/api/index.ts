import type { UiEvents, WorkerApi, WorkerKind } from "../../common/api";
import type { ApiHandlers, RpcHost } from "../../common/rpc";
import { Random } from "../core/random";
import { getDemoCounter, incrementDemoCounter } from "./demo";

const MAX_RNG_PREVIEW = 20;

/** The worker's implementation of WorkerApi. The compiler checks it against the contract. */
export function createHandlers(
  host: RpcHost<WorkerApi, UiEvents>,
  kind: WorkerKind,
  startedAt: string,
): ApiHandlers<WorkerApi> {
  return {
    getStatus: () => ({ kind, startedAt, connectedTabs: host.endpointCount }),

    getDemoCounter,

    async incrementDemoCounter(by) {
      const value = await incrementDemoCounter(by);
      host.broadcast("demoCounterChanged", { value });
      return value;
    },

    rngPreview(seed, count) {
      const rng = Random.fromSeed(seed);
      const n = Math.max(0, Math.min(MAX_RNG_PREVIEW, Math.floor(count)));
      return Array.from({ length: n }, () => rng.int(1, 100));
    },
  };
}
