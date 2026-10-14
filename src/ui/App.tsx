/**
 * M1 generation inspector. Temporary developer page: the game UI replaces it in M5.
 * Create, open and delete league saves, and check what the generator produced.
 */
import { useEffect, useState } from "react";
import type { WorkerStatus } from "../common/api";
import type { LeagueSummary } from "../common/schema";
import { LeagueManager } from "./inspector/LeagueManager";
import { LeagueView } from "./inspector/LeagueView";
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
    <main className="container-xl py-4">
      <header className="mb-4">
        <h1 className="h3 mb-1">Soccer Sim Game</h1>
        <p className="text-body-secondary mb-0">
          M1 generation inspector. A temporary developer page; the game screens arrive in M5.
        </p>
      </header>
      {error && <div className="alert alert-danger">Could not start the game worker: {error}</div>}
      {!connection && !error && <p>Starting the game worker…</p>}
      {connection?.status === "blocked" && (
        <div className="alert alert-warning">
          The game is already open in another tab. Close that tab, then reload this one.
        </div>
      )}
      {connection?.status === "ready" && <Inspector />}
    </main>
  );
}

function Inspector() {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const off = onWorkerEvent("leaguesChanged", ({ leagues: list }) => {
      setLeagues(list);
      setSelected((lid) => (lid !== null && list.some((l) => l.lid === lid) ? lid : null));
    });
    toWorker("listLeagues")
      .then((list) => {
        setLeagues(list);
        setSelected((lid) => lid ?? list[list.length - 1]?.lid ?? null);
      })
      .catch(() => setLeagues([]));
    return off;
  }, []);

  if (!leagues) return <p>Loading saves…</p>;
  return (
    <>
      <LeagueManager leagues={leagues} selected={selected} onSelect={setSelected} />
      {selected !== null && <LeagueView key={selected} lid={selected} />}
      <WorkerFooter />
    </>
  );
}

function WorkerFooter() {
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
  if (!status) return null;
  return (
    <footer className="small text-body-secondary border-top pt-2">
      Game worker: {status.kind === "shared" ? "shared" : "dedicated (single-tab fallback)"} ·{" "}
      {status.connectedTabs} tab{status.connectedTabs === 1 ? "" : "s"} connected
    </footer>
  );
}
