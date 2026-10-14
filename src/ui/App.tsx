/**
 * M0 plumbing check page. Temporary: the real game UI replaces it in M5.
 * Each card exercises one M0 acceptance check through the worker.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { WorkerStatus } from "../common/api";
import { connectWorker, onWorkerEvent, toWorker, type Connection } from "./workerClient";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    connectWorker()
      .then(setConnection)
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  return (
    <main className="container py-4" style={{ maxWidth: 980 }}>
      <header className="mb-4">
        <h1 className="h3 mb-1">Soccer Sim Game</h1>
        <p className="text-body-secondary mb-0">
          M0 plumbing check. This page is temporary; the game UI replaces it in M5.
        </p>
      </header>

      {error && <div className="alert alert-danger">Could not start the game worker: {error}</div>}
      {!connection && !error && <p>Starting the game worker…</p>}
      {connection?.status === "blocked" && (
        <div className="alert alert-warning">
          The game is already open in another tab. Close that tab, then reload this one.
        </div>
      )}
      {connection?.status === "ready" && <Checks />}
    </main>
  );
}

function Checks() {
  return (
    <>
      <ol className="mb-4">
        <li>Click +1 a few times, then reload the page: the number stays.</li>
        <li>
          Open this page in a second tab: both show 2 tabs connected, and +1 in one tab updates the
          other straight away.
        </li>
        <li>The rolls for a seed are the same in every tab and after a reload.</li>
        <li>Open the deep link: the page still loads.</li>
      </ol>
      <div className="row g-3">
        <WorkerCard />
        <CounterCard />
        <RngCard />
        <StorageAndRoutingCard />
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="col-md-6">
      <section className="card h-100">
        <div className="card-body">
          <h2 className="h6 card-title text-uppercase text-body-secondary">{title}</h2>
          {children}
        </div>
      </section>
    </div>
  );
}

function WorkerCard() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);

  useEffect(() => {
    const off = onWorkerEvent("tabsChanged", ({ connectedTabs }) =>
      setStatus((s) => (s ? { ...s, connectedTabs } : s)),
    );
    toWorker("getStatus")
      .then(setStatus)
      .catch(() => setStatus(null));
    return off;
  }, []);

  if (!status) return <Card title="1 · Game worker">Connecting…</Card>;
  return (
    <Card title="1 · Game worker">
      <p className="mb-2">
        {status.kind === "shared" ? (
          <span className="badge text-bg-success">Shared worker</span>
        ) : (
          <span className="badge text-bg-warning">Dedicated worker (fallback)</span>
        )}
      </p>
      <dl className="row mb-0">
        <dt className="col-6">Tabs connected</dt>
        <dd className="col-6">{status.connectedTabs}</dd>
        <dt className="col-6">Worker started</dt>
        <dd className="col-6">{new Date(status.startedAt).toLocaleTimeString("en-GB")}</dd>
      </dl>
      {status.kind === "dedicated" && (
        <p className="small text-body-secondary mt-2 mb-0">
          This browser runs the game in one tab at a time.
        </p>
      )}
    </Card>
  );
}

function CounterCard() {
  const [value, setValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = onWorkerEvent("demoCounterChanged", (event) => setValue(event.value));
    toWorker("getDemoCounter")
      .then(setValue)
      .catch((e: unknown) => setError(errorText(e)));
    return off;
  }, []);

  const increment = async () => {
    setBusy(true);
    setError(null);
    try {
      setValue(await toWorker("incrementDemoCounter", 1));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="2 · Saved counter (IndexedDB)">
      <div className="d-flex align-items-center gap-3">
        <span className="display-6 font-monospace">{value ?? "…"}</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || value === null}
          onClick={() => void increment()}
        >
          +1
        </button>
      </div>
      <p className="small text-body-secondary mt-2 mb-0">
        Stored by the worker through the in-memory cache, then flushed to IndexedDB.
      </p>
      {error && <div className="alert alert-danger mt-2 mb-0">{error}</div>}
    </Card>
  );
}

function RngCard() {
  const [seed, setSeed] = useState("soccer-sim-game");
  const [rolls, setRolls] = useState<number[] | null>(null);

  useEffect(() => {
    let current = true;
    toWorker("rngPreview", seed, 8)
      .then((result) => {
        if (current) setRolls(result);
      })
      .catch(() => {
        if (current) setRolls(null);
      });
    return () => {
      current = false;
    };
  }, [seed]);

  return (
    <Card title="3 · Seeded randomness">
      <label className="form-label small" htmlFor="seed">
        Seed
      </label>
      <input
        id="seed"
        className="form-control mb-2"
        value={seed}
        onChange={(event) => setSeed(event.target.value)}
      />
      <p className="font-monospace mb-1">{rolls ? rolls.join(" · ") : "…"}</p>
      <p className="small text-body-secondary mb-0">
        First 8 rolls (1–100). Same seed, same rolls: in every tab and after a reload.
      </p>
    </Card>
  );
}

function StorageAndRoutingCard() {
  const supported = "storage" in navigator;
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.storage
      .persisted()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, [supported]);

  const request = () => {
    navigator.storage
      .persist()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  };

  const onDeepLink = location.pathname !== "/";

  return (
    <Card title="4 · Storage and routing">
      <dl className="row mb-2">
        <dt className="col-6">Persistent storage</dt>
        <dd className="col-6">
          {!supported
            ? "not available"
            : persisted === null
              ? "…"
              : persisted
                ? "granted"
                : "not yet"}
        </dd>
        <dt className="col-6">Current path</dt>
        <dd className="col-6 font-monospace text-break">{location.pathname}</dd>
      </dl>
      {supported && persisted === false && (
        <button type="button" className="btn btn-outline-secondary btn-sm me-2" onClick={request}>
          Request persistent storage
        </button>
      )}
      {onDeepLink ? (
        <a className="btn btn-outline-secondary btn-sm" href="/">
          Back to /
        </a>
      ) : (
        <a className="btn btn-outline-secondary btn-sm" href="/m0/deep/link">
          Open a deep link
        </a>
      )}
      <p className="small text-body-secondary mt-2 mb-0">
        {onDeepLink
          ? "Loaded from a deep link: the host served the app for an unknown path."
          : "Persistent storage asks the browser not to clear saves when disk space runs low."}
      </p>
    </Card>
  );
}
