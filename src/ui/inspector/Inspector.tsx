/**
 * Developer pages (M1–M4 inspector), at /dev through M6 (T, 2026-10-19): create, open and
 * delete saves, the generated world, the Match, Season and Club labs.
 */
import { useEffect, useState } from "react";
import type { WorkerStatus } from "../../common/api";
import type { LeagueSummary } from "../../common/schema";
import { Link } from "../router";
import { onWorkerEvent, toWorker } from "../workerClient";
import { LeagueManager } from "./LeagueManager";
import { LeagueView } from "./LeagueView";

export function Inspector() {
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

  return (
    <main className="container-xl py-4">
      <header className="mb-4">
        <h1 className="h3 mb-1">Soccer Sim Game</h1>
        <p className="text-body-secondary mb-0">
          Developer inspector: M1 generation, M2 match lab, M3 season lab and M4 club lab. Kept for
          testing through M6; the game is at <Link to="/">the home page</Link>.
        </p>
      </header>
      {!leagues ? (
        <p>Loading saves…</p>
      ) : (
        <>
          <LeagueManager leagues={leagues} selected={selected} onSelect={setSelected} />
          {selected !== null && <LeagueView key={selected} lid={selected} />}
          <WorkerFooter />
        </>
      )}
    </main>
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
