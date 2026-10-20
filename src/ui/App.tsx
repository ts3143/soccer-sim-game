/**
 * The game UI (M5): starts the game worker, then shows the page for the URL (src/ui/router):
 * Manage Leagues, New league, a league page inside the app shell, or the developer pages.
 */
import { useEffect, useState } from "react";
import { BoxScorePage } from "./pages/BoxScorePage";
import { Cups } from "./pages/Cups";
import { Dashboard } from "./pages/Dashboard";
import { Academy } from "./pages/Academy";
import { ClubFinances } from "./pages/ClubFinances";
import { Finances } from "./pages/Finances";
import { Fired } from "./pages/Fired";
import { FreeAgents } from "./pages/FreeAgents";
import { GameLog } from "./pages/GameLog";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { Inbox } from "./pages/Inbox";
import { Injuries } from "./pages/Injuries";
import { LeagueLeaders } from "./pages/LeagueLeaders";
import { Live } from "./pages/Live";
import { NewLeague } from "./pages/NewLeague";
import { Placeholder } from "./pages/Placeholder";
import { Player } from "./pages/Player";
import { PlayerRatings } from "./pages/PlayerRatings";
import { PlayerStats } from "./pages/PlayerStats";
import { PowerRankings } from "./pages/PowerRankings";
import { Schedule } from "./pages/Schedule";
import { Settings } from "./pages/Settings";
import { Squad } from "./pages/Squad";
import { Standings } from "./pages/Standings";
import { Tactics } from "./pages/Tactics";
import { TeamHistory } from "./pages/TeamHistory";
import { TeamStats } from "./pages/TeamStats";
import { Transactions } from "./pages/Transactions";
import { TransferMarket } from "./pages/TransferMarket";
import { Link, parseRoute, usePath } from "./router";
import { Shell } from "./shell/Shell";
import { connectWorker, type Connection } from "./workerClient";

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

  if (error) {
    return (
      <main className="container py-4">
        <div className="alert alert-danger">Could not start the game worker: {error}</div>
      </main>
    );
  }
  if (!connection) return <p className="container py-4">Starting the game…</p>;
  if (connection.status === "blocked") {
    return (
      <main className="container py-4">
        <div className="alert alert-warning">
          The game is already open in another tab. Close that tab, then reload this one.
        </div>
      </main>
    );
  }
  return <Routes />;
}

function Routes() {
  const route = parseRoute(usePath());
  switch (route.kind) {
    case "home":
      return <Home />;
    case "new":
      return <NewLeague />;
    case "league":
      return (
        <Shell key={route.lid} lid={route.lid}>
          <LeaguePage page={route.page} params={route.params} />
        </Shell>
      );
    default:
      return (
        <main className="container py-4">
          <p>There's nothing here.</p>
          <Link to="/">Back to your leagues</Link>
        </main>
      );
  }
}

/** The league page for the URL; an unknown page says so. */
function LeaguePage({ page, params }: { page: string; params: string[] }) {
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "inbox":
      return <Inbox />;
    case "standings":
      return <Standings params={params} />;
    case "cups":
      return <Cups params={params} />;
    case "schedule":
      return <Schedule params={params} />;
    case "squad":
      return <Squad params={params} />;
    case "player":
      return <Player params={params} />;
    case "box-score":
      return <BoxScorePage params={params} />;
    case "game-log":
      return <GameLog params={params} />;
    case "league-leaders":
      return <LeagueLeaders params={params} />;
    case "player-ratings":
      return <PlayerRatings />;
    case "player-stats":
      return <PlayerStats params={params} />;
    case "team-stats":
      return <TeamStats params={params} />;
    case "injuries":
      return <Injuries />;
    case "tactics":
      return <Tactics params={params} />;
    case "live":
      return <Live />;
    case "free-agents":
      return <FreeAgents />;
    case "transfer-market":
      return <TransferMarket params={params} />;
    case "academy":
      return <Academy />;
    case "club-finances":
      return <ClubFinances />;
    case "fired":
      return <Fired />;
    case "settings":
      return <Settings />;
    case "history":
      return <History />;
    case "team-history":
      return <TeamHistory params={params} />;
    case "transactions":
      return <Transactions params={params} />;
    case "power-rankings":
      return <PowerRankings />;
    case "finances":
      return <Finances params={params} />;
    default:
      return <Placeholder page={page} params={params} />;
  }
}
