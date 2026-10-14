/**
 * Worker entry point: the game core. Runs as a SharedWorker (one instance shared by
 * every open tab) or, where SharedWorker is unavailable, as a dedicated Worker for a
 * single tab. Tabs talk to it only through the typed protocol in src/common/rpc.ts.
 */
import type { UiEvents, WorkerApi, WorkerKind } from "../common/api";
import { createRpcHost } from "../common/rpc";
import { createHandlers } from "./api";

declare const self: SharedWorkerGlobalScope | DedicatedWorkerGlobalScope;

const kind: WorkerKind = "onconnect" in self ? "shared" : "dedicated";

const host = createRpcHost<WorkerApi, UiEvents>();
host.setHandlers(createHandlers(host, kind, new Date().toISOString()));
host.onEndpointsChanged((connectedTabs) => host.broadcast("tabsChanged", { connectedTabs }));

if (kind === "shared") {
  (self as SharedWorkerGlobalScope).onconnect = (event) => {
    const port = event.ports[0];
    if (port) host.addEndpoint(port);
  };
} else {
  host.addEndpoint(self as DedicatedWorkerGlobalScope);
}
