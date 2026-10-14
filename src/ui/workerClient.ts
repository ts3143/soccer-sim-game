/**
 * The UI's only door into the game core. Tabs never touch IndexedDB or game logic:
 * they call worker functions with toWorker() and listen for pushed events with
 * onWorkerEvent(). Both are typed against src/common/api.ts.
 */
import type { UiEvents, WorkerApi, WorkerKind } from "../common/api";
import { createRpcClient, type ApiArgs, type ApiResult, type RpcClient } from "../common/rpc";

export type Connection = { status: "ready"; kind: WorkerKind } | { status: "blocked" };

let client: RpcClient<WorkerApi, UiEvents> | undefined;
let connecting: Promise<Connection> | undefined;

/** Starts the game worker, or joins the one other tabs already share. Safe to call repeatedly. */
export function connectWorker(): Promise<Connection> {
  connecting ??= connect();
  return connecting;
}

async function connect(): Promise<Connection> {
  // `?worker=dedicated` forces the fallback path, to test it in browsers that have SharedWorker.
  const forceDedicated = new URLSearchParams(location.search).get("worker") === "dedicated";

  if (typeof SharedWorker !== "undefined" && !forceDedicated) {
    const worker = new SharedWorker(new URL("../worker/index.ts", import.meta.url), {
      type: "module",
      name: "soccer-sim-game",
    });
    const shared = createRpcClient<WorkerApi, UiEvents>(worker.port);
    client = shared;
    addEventListener("pagehide", (event) => {
      // A page kept in the back/forward cache may come back, so only leave on a real unload.
      if (!event.persisted) shared.close();
    });
    return { status: "ready", kind: "shared" };
  }

  // Fallback: a dedicated worker belongs to one tab. Two of them would both write the same
  // save, so only the tab holding the lock may run the game.
  if (!(await holdSingleTabLock())) return { status: "blocked" };
  const worker = new Worker(new URL("../worker/index.ts", import.meta.url), {
    type: "module",
    name: "soccer-sim-game",
  });
  client = createRpcClient<WorkerApi, UiEvents>(worker);
  return { status: "ready", kind: "dedicated" };
}

/** Resolves true if this tab now holds the single-tab lock (held until the tab closes). */
function holdSingleTabLock(): Promise<boolean> {
  if (!("locks" in navigator)) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request("soccer-sim-game:active-tab", { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // A promise that never settles keeps the lock for the tab's lifetime.
        return lock === null ? undefined : new Promise<never>(() => {});
      })
      .catch(() => resolve(true));
  });
}

/** Calls a worker function. */
export function toWorker<K extends keyof WorkerApi>(
  name: K,
  ...args: ApiArgs<WorkerApi, K>
): Promise<ApiResult<WorkerApi, K>> {
  if (!client) return Promise.reject(new Error("toWorker() called before connectWorker()"));
  return client.call(name, ...args);
}

/** Listens for an event pushed by the worker; returns an unsubscribe function. */
export function onWorkerEvent<E extends keyof UiEvents>(
  name: E,
  listener: (payload: UiEvents[E]) => void,
): () => void {
  if (!client) throw new Error("onWorkerEvent() called before connectWorker()");
  return client.on(name, listener);
}
