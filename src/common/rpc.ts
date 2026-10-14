/**
 * Request/response and broadcast protocol between UI tabs and the worker
 * (the ZenGM toWorker/toUI idea, written fresh).
 *
 * Transport-agnostic: an Endpoint is anything with postMessage + a "message" event,
 * i.e. a SharedWorker MessagePort, a dedicated Worker (or its global scope), or a
 * MessageChannel port in tests. No DOM or worker globals are used here.
 */

export interface Endpoint {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  /** MessagePorts must be started before they deliver messages. */
  start?(): void;
}

export type ApiArgs<Api, K extends keyof Api> = Api[K] extends (...args: infer A) => unknown
  ? A
  : never;
export type ApiResult<Api, K extends keyof Api> = Api[K] extends (...args: never[]) => infer R
  ? Awaited<R>
  : never;
/** What the worker must implement for an API: same names and types, sync or async. */
export type ApiHandlers<Api> = {
  [K in keyof Api]: (...args: ApiArgs<Api, K>) => ApiResult<Api, K> | Promise<ApiResult<Api, K>>;
};

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

type CallMessage = { kind: "call"; id: number; name: string; args: unknown[] };
type ByeMessage = { kind: "bye" };
type ResultMessage =
  | { kind: "result"; id: number; ok: true; value: unknown }
  | { kind: "result"; id: number; ok: false; error: SerializedError };
type EventMessage = { kind: "event"; name: string; payload: unknown };

function hasKind<K extends string>(data: unknown, kind: K): data is { kind: K } {
  return typeof data === "object" && data !== null && (data as { kind?: unknown }).kind === kind;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return error.stack === undefined
      ? { name: error.name, message: error.message }
      : { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Error", message: String(error) };
}

/** An error thrown inside the worker, re-raised in the tab that made the call. */
export class WorkerError extends Error {
  readonly workerStack: string | undefined;

  constructor(serialized: SerializedError) {
    super(serialized.message);
    this.name = serialized.name;
    this.workerStack = serialized.stack;
  }
}

// ---------------------------------------------------------------------------
// Worker side

export interface RpcHost<Api, Events> {
  /** Install the API implementation. Calls that arrive before this are rejected. */
  setHandlers(handlers: ApiHandlers<Api>): void;
  /** Serve calls from a newly connected tab. */
  addEndpoint(endpoint: Endpoint): void;
  /** Push an event to every connected tab. */
  broadcast<E extends keyof Events & string>(name: E, payload: Events[E]): void;
  onEndpointsChanged(listener: (count: number) => void): void;
  readonly endpointCount: number;
}

export function createRpcHost<Api, Events>(): RpcHost<Api, Events> {
  let handlers: ApiHandlers<Api> | undefined;
  const endpoints = new Set<Endpoint>();
  const endpointListeners: ((count: number) => void)[] = [];

  const notifyEndpointsChanged = () => {
    for (const listener of endpointListeners) listener(endpoints.size);
  };

  const post = (endpoint: Endpoint, message: ResultMessage | EventMessage) => {
    try {
      endpoint.postMessage(message);
    } catch (error) {
      // Typically a DataCloneError: the result was not plain data.
      if (message.kind === "result") {
        endpoint.postMessage({
          kind: "result",
          id: message.id,
          ok: false,
          error: serializeError(error),
        });
      } else {
        throw error;
      }
    }
  };

  const handleCall = async (endpoint: Endpoint, call: CallMessage) => {
    try {
      if (!handlers) throw new Error("Worker is still starting");
      if (!Object.hasOwn(handlers, call.name))
        throw new Error(`Unknown worker function: ${call.name}`);
      const handler = handlers[call.name as keyof Api] as (...args: unknown[]) => unknown;
      const value = await handler(...call.args);
      post(endpoint, { kind: "result", id: call.id, ok: true, value });
    } catch (error) {
      post(endpoint, { kind: "result", id: call.id, ok: false, error: serializeError(error) });
    }
  };

  return {
    setHandlers(next) {
      handlers = next;
    },
    addEndpoint(endpoint) {
      endpoints.add(endpoint);
      endpoint.addEventListener("message", (event) => {
        const data = event.data;
        if (hasKind(data, "call")) {
          void handleCall(endpoint, data as CallMessage);
        } else if (hasKind(data, "bye") && endpoints.delete(endpoint)) {
          notifyEndpointsChanged();
        }
      });
      endpoint.start?.();
      notifyEndpointsChanged();
    },
    broadcast(name, payload) {
      const message: EventMessage = { kind: "event", name, payload };
      for (const endpoint of endpoints) post(endpoint, message);
    },
    onEndpointsChanged(listener) {
      endpointListeners.push(listener);
    },
    get endpointCount() {
      return endpoints.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Tab side

export interface RpcClient<Api, Events> {
  call<K extends keyof Api & string>(name: K, ...args: ApiArgs<Api, K>): Promise<ApiResult<Api, K>>;
  /** Listen for a worker event; returns an unsubscribe function. */
  on<E extends keyof Events & string>(name: E, listener: (payload: Events[E]) => void): () => void;
  /** Tell the worker this tab is going away. */
  close(): void;
}

export function createRpcClient<Api, Events>(endpoint: Endpoint): RpcClient<Api, Events> {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  const listeners = new Map<string, Set<(payload: never) => void>>();

  endpoint.addEventListener("message", (event) => {
    const data = event.data;
    if (hasKind(data, "result")) {
      const result = data as ResultMessage;
      const waiting = pending.get(result.id);
      if (!waiting) return;
      pending.delete(result.id);
      if (result.ok) waiting.resolve(result.value);
      else waiting.reject(new WorkerError(result.error));
    } else if (hasKind(data, "event")) {
      const { name, payload } = data as EventMessage;
      for (const listener of listeners.get(name) ?? []) listener(payload as never);
    }
  });
  endpoint.start?.();

  return {
    call(name, ...args) {
      const id = nextId++;
      const message: CallMessage = { kind: "call", id, name, args };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        endpoint.postMessage(message);
      });
    },
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      const entry = listener as (payload: never) => void;
      set.add(entry);
      return () => {
        set.delete(entry);
      };
    },
    close() {
      const message: ByeMessage = { kind: "bye" };
      endpoint.postMessage(message);
    },
  };
}
