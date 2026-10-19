/**
 * The game UI's frame for an open league (M5, mirroring ZenGM): a top bar with the Play
 * menu, the date, phase and window, a sidebar of sections, and the page. Pages read the
 * league's names, clubs and game state from ShellContext, and refresh on `gameChanged`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LeagueShell, PlayOption, PlayReport } from "../../common/api";
import { crestUrl } from "../crests";
import { formatDate } from "../format";
import { leaguePath, Link, usePath } from "../router";
import { onWorkerEvent, toWorker } from "../workerClient";
import { PAGES, SECTIONS } from "./pages";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const PLAY_LABELS: Record<PlayOption, string> = {
  untilNextMatch: "Until next match",
  oneWeek: "One week",
  untilWindowCloses: "Until the window closes",
  untilEndOfSeason: "Until the end of the season",
  proceedToPromotionRelegation: "Proceed to promotion and relegation",
  advanceToPreseason: "Advance to preseason",
};
const PHASE_LABELS: Record<string, string> = {
  preseason: "Preseason",
  regularSeason: "Regular season",
  endOfSeason: "End of season",
};
export const seasonLabel = (season: number) =>
  `${season}/${String((season + 1) % 100).padStart(2, "0")}`;

interface ShellValue {
  shell: LeagueShell;
  /** Bumped after every Play action and game change: pages reload their data on it. */
  version: number;
  reload: () => void;
}
const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell outside the Shell");
  return value;
}

function PlayMenu() {
  const { shell } = useShell();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PlayOption | null>(null);
  const [last, setLast] = useState<PlayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = shell.state.options;
  // Close the menu on a click anywhere outside it.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const play = async (option: PlayOption) => {
    setOpen(false);
    setBusy(option);
    setError(null);
    try {
      setLast(await toWorker("playGame", shell.lid, option));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="d-flex align-items-center gap-2 position-relative">
      <div className="btn-group" ref={ref}>
        <button
          type="button"
          className="btn btn-success fw-semibold"
          data-testid="play-button"
          disabled={busy !== null || options.length === 0}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {busy ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              Playing…
            </>
          ) : (
            "Play ▾"
          )}
        </button>
        {open && (
          <ul className="dropdown-menu show" data-testid="play-menu" style={{ top: "100%" }}>
            {options.map((option) => (
              <li key={option}>
                <button type="button" className="dropdown-item" onClick={() => void play(option)}>
                  {PLAY_LABELS[option]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {last && !busy && (
        <span className="small text-white-50 d-none d-xl-inline" data-testid="play-result">
          {last.matchesPlayed} match{last.matchesPlayed === 1 ? "" : "es"} played
        </span>
      )}
      {error && <span className="small text-warning">{error}</span>}
    </div>
  );
}

function TopBar() {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const { state } = shell;
  return (
    <nav
      className="navbar navbar-dark bg-dark sticky-top px-3 gap-3 flex-nowrap"
      style={{ borderBottom: `4px solid ${user?.colors.primary ?? "#198754"}` }}
      data-testid="top-bar"
    >
      <Link to="/" className="navbar-brand fw-bold me-0">
        Soccer Sim
      </Link>
      <PlayMenu />
      <div
        className="text-white small d-flex flex-wrap gap-2 align-items-center"
        data-testid="game-date"
      >
        <span className="fw-semibold">{formatDate(state.date)}</span>
        <span className="text-white-50">
          {seasonLabel(state.season)} · {PHASE_LABELS[state.phase] ?? state.phase}
        </span>
        {state.window && (
          <span className="badge text-bg-success">
            {state.window.id === "summer" ? "Summer" : "Winter"} window until{" "}
            {formatDate(state.window.closes)}
          </span>
        )}
      </div>
      <div className="ms-auto d-flex align-items-center gap-2 text-white small text-nowrap">
        <span className="text-white-50 d-none d-md-inline">{shell.name}</span>
        {user && (
          <Link
            to={leaguePath(shell.lid, "squad", user.cid)}
            className="d-flex align-items-center gap-2 text-white text-decoration-none fw-semibold"
          >
            <img src={crestUrl(user.code)} alt="" width={22} height={25} />
            <span className="d-none d-sm-inline">{user.name}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { shell } = useShell();
  const path = usePath();
  const current = path.split("/")[3] ?? "dashboard";
  return (
    <aside
      className={`app-sidebar border-end bg-body-tertiary ${open ? "open" : ""}`}
      data-testid="sidebar"
    >
      {SECTIONS.map((section) => (
        <div key={section} className="mb-3">
          <div className="text-uppercase small fw-semibold text-body-secondary px-3 mb-1">
            {section}
          </div>
          <ul className="nav flex-column">
            {PAGES.filter((p) => p.section === section && !p.hidden).map((p) => {
              const to = p.team
                ? leaguePath(shell.lid, p.key, shell.userCid)
                : leaguePath(shell.lid, p.key);
              return (
                <li key={p.key} className="nav-item">
                  {p.m6 ? (
                    <span className="nav-link py-1 text-body-tertiary">
                      {p.title} <span className="badge text-bg-light">M6</span>
                    </span>
                  ) : (
                    <Link
                      to={to}
                      onClick={onNavigate}
                      className={`nav-link py-1 ${current === p.key ? "active fw-semibold" : ""}`}
                    >
                      {p.title}
                      {p.key === "inbox" && shell.unread > 0 && (
                        <span
                          className="badge rounded-pill text-bg-primary ms-2"
                          data-testid="unread"
                        >
                          {shell.unread}
                        </span>
                      )}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mb-3">
        <div className="text-uppercase small fw-semibold text-body-secondary px-3 mb-1">Tools</div>
        <ul className="nav flex-column">
          <li className="nav-item">
            <Link to="/" onClick={onNavigate} className="nav-link py-1">
              Manage Leagues
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/dev" onClick={onNavigate} className="nav-link py-1 text-body-secondary">
              Developer pages
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}

/** The sacked user picks one of his job offers (the full "You're fired" screen is M6). */
function FiredBanner() {
  const { shell } = useShell();
  const [error, setError] = useState<string | null>(null);
  const fired = shell.state.fired;
  if (!fired) return null;
  return (
    <div className="alert alert-danger" data-testid="fired-banner">
      <strong>You have been sacked</strong> ({formatDate(fired.date)}). Take a job to carry on:
      <div className="d-flex flex-wrap gap-2 mt-2">
        {fired.offers.map((o) => (
          <button
            key={o.cid}
            className="btn btn-sm btn-light"
            onClick={() =>
              void toWorker("acceptJobOffer", shell.lid, o.cid).catch((e: unknown) =>
                setError(errorText(e)),
              )
            }
          >
            {o.name}
          </button>
        ))}
      </div>
      {error && <div className="small mt-2">{error}</div>}
    </div>
  );
}

export function Shell({ lid, children }: { lid: number; children: ReactNode }) {
  const [shell, setShell] = useState<LeagueShell | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(() => {
    toWorker("getLeagueShell", lid)
      .then((s) => {
        setShell(s);
        setVersion((v) => v + 1);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [lid]);

  useEffect(() => {
    reload();
    return onWorkerEvent("gameChanged", (event) => {
      if (event.lid === lid) reload();
    });
  }, [lid, reload]);

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">
          Could not open this league: {error}. <Link to="/">Back to your leagues</Link>
        </div>
      </div>
    );
  }
  if (!shell) return <p className="container py-4">Opening the league…</p>;
  return (
    <ShellContext.Provider value={{ shell, version, reload }}>
      <TopBar />
      <div className="d-flex">
        <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <main className="app-main px-3 px-lg-4 py-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-lg-none mb-3"
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
          <FiredBanner />
          {children}
        </main>
      </div>
    </ShellContext.Provider>
  );
}
