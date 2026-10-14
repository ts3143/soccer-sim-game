/**
 * The typed contract between the UI (tabs) and the game core (worker).
 *
 * WorkerApi lists every function the UI may call in the worker; UiEvents lists every
 * event the worker may push to open tabs. The UI calls through toWorker() and the
 * worker implements ApiHandlers<WorkerApi>, so any mismatch is a compile error.
 * Arguments and results must be structured-cloneable (plain data).
 */

export type WorkerKind = "shared" | "dedicated";

export interface WorkerStatus {
  kind: WorkerKind;
  /** ISO date-time when this worker instance started. */
  startedAt: string;
  connectedTabs: number;
}

export interface WorkerApi {
  getStatus(): WorkerStatus;
  /** M0 plumbing demo: a counter persisted in IndexedDB through the cache. */
  getDemoCounter(): number;
  incrementDemoCounter(by: number): number;
  /** M0 plumbing demo: the first `count` rolls (1–100) for a seed. */
  rngPreview(seed: string, count: number): number[];
}

export interface UiEvents {
  demoCounterChanged: { value: number };
  tabsChanged: { connectedTabs: number };
}
