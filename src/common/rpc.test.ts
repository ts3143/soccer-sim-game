import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient, createRpcHost, WorkerError, type RpcClient, type RpcHost } from "./rpc";

interface TestApi {
  add(a: number, b: number): number;
  echoLater(text: string): string;
  fail(): void;
  returnFunction(): unknown;
}

interface TestEvents {
  tick: { n: number };
}

const openPorts: MessagePort[] = [];

/** A host plus `tabs` connected clients, each over its own MessageChannel (like SharedWorker ports). */
function setup(tabs: number): {
  host: RpcHost<TestApi, TestEvents>;
  clients: RpcClient<TestApi, TestEvents>[];
} {
  const host = createRpcHost<TestApi, TestEvents>();
  host.setHandlers({
    add: (a, b) => a + b,
    echoLater: async (text) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return text;
    },
    fail: () => {
      throw new RangeError("boom");
    },
    returnFunction: () => () => 1,
  });
  const clients = Array.from({ length: tabs }, () => {
    const channel = new MessageChannel();
    openPorts.push(channel.port1, channel.port2);
    host.addEndpoint(channel.port1);
    return createRpcClient<TestApi, TestEvents>(channel.port2);
  });
  return { host, clients };
}

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  for (const port of openPorts.splice(0)) port.close();
});

describe("rpc", () => {
  it("returns results from sync and async handlers", async () => {
    const [client] = setup(1).clients;
    expect(await client?.call("add", 2, 3)).toBe(5);
    expect(await client?.call("echoLater", "hello")).toBe("hello");
  });

  it("keeps concurrent calls apart", async () => {
    const [client] = setup(1).clients;
    const results = await Promise.all([
      client?.call("echoLater", "a"),
      client?.call("add", 1, 1),
      client?.call("echoLater", "b"),
    ]);
    expect(results).toEqual(["a", 2, "b"]);
  });

  it("re-raises worker errors in the calling tab", async () => {
    const [client] = setup(1).clients;
    const error = await client?.call("fail").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkerError);
    expect(error).toMatchObject({ name: "RangeError", message: "boom" });
  });

  it("rejects unknown functions and non-cloneable results", async () => {
    const [client] = setup(1).clients;
    const untyped = client as unknown as RpcClient<{ nope(): void }, TestEvents>;
    await expect(untyped.call("nope")).rejects.toThrow("Unknown worker function: nope");
    await expect(client?.call("returnFunction")).rejects.toBeInstanceOf(WorkerError);
  });

  it("broadcasts events to every connected tab, and unsubscribing stops them", async () => {
    const { host, clients } = setup(2);
    const seen: string[] = [];
    clients[0]?.on("tick", ({ n }) => seen.push(`tab0:${n}`));
    const off = clients[1]?.on("tick", ({ n }) => seen.push(`tab1:${n}`));
    host.broadcast("tick", { n: 1 });
    await nextTurn();
    off?.();
    host.broadcast("tick", { n: 2 });
    await nextTurn();
    expect(seen.sort()).toEqual(["tab0:1", "tab0:2", "tab1:1"]);
  });

  it("tracks connected tabs and drops a tab that says goodbye", async () => {
    const counts: number[] = [];
    const { host, clients } = setup(0);
    host.onEndpointsChanged((count) => counts.push(count));
    const channel = new MessageChannel();
    openPorts.push(channel.port1, channel.port2);
    host.addEndpoint(channel.port1);
    expect(host.endpointCount).toBe(1);
    createRpcClient<TestApi, TestEvents>(channel.port2).close();
    await nextTurn();
    expect(host.endpointCount).toBe(0);
    expect(counts).toEqual([1, 0]);
    expect(clients).toHaveLength(0);
  });
});
