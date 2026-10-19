/**
 * The game UI (M5): starts the game worker, then shows the page for the URL (src/ui/router):
 * Manage Leagues, New league, a league page inside the app shell, or the developer pages.
 */
import { useEffect, useState } from "react";
import { Inspector } from "./inspector/Inspector";
import { BoxScorePage } from "./pages/BoxScorePage";
import { Cups } from "./pages/Cups";
import { Dashboard } from "./pages/Dashboard";
import { GameLog } from "./pages/GameLog";
import { Home } from "./pages/Home";
import { Inbox } from "./pages/Inbox";
import { NewLeague } from "./pages/NewLeague";
import { Placeholder } from "./pages/Placeholder";
import { Player } from "./pages/Player";
import { Schedule } from "./pages/Schedule";
import { Squad } from "./pages/Squad";
import { Standings } from "./pages/Standings";
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
    case "dev":
      return <Inspector />;
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

/** The league page for the URL; pages not built yet show a placeholder. */
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
    default:
      return <Placeholder page={page} params={params} />;
  }
}
