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
import { formatDate, formatDayMonth } from "../format";
import { leaguePath, Link, navigate, usePath } from "../router";
import { onWorkerEvent, toWorker } from "../workerClient";
import { inWorld, pageTitle, PAGES, SECTIONS } from "./pages";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { LEAGUE_CLOSED } from "../../common/errors";
import { errorText } from "../errors";

export const PLAY_LABELS: Record<PlayOption, string> = {
  untilNextMatch: "Until next match",
  watchNextMatch: "Watch your next match",
  oneWeek: "One week",
  untilWindowCloses: "Until the window closes",
  untilEndOfSeason: "Until the end of the season",
  proceedToPromotionRelegation: "Proceed to promotion and relegation",
  untilDraftLottery: "Until the draft lottery",
  untilDraft: "Until the draft",
  untilYourPick: "Until your pick",
  untilEndOfDraft: "To the end of the draft",
  untilResigning: "Until the re-signing period",
  advanceToPreseason: "Advance to preseason",
};
const TO_DRAFT = new Set<PlayOption>(["untilDraftLottery", "untilDraft", "untilYourPick"]);
const PHASE_LABELS: Record<string, string> = {
  preseason: "Preseason",
  regularSeason: "Regular season",
  endOfSeason: "End of season",
  draftLottery: "Draft lottery",
  draft: "Draft",
  resigning: "Re-signing period",
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
      const report = await toWorker("playGame", shell.lid, option);
      setLast(report);
      if (report.live) navigate(leaguePath(shell.lid, "live"));
      // The lottery's draw and the draft itself are on the Draft page (ZenGM).
      else if (TO_DRAFT.has(option)) navigate(leaguePath(shell.lid, "draft"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="d-flex align-items-center gap-2 position-relative flex-shrink-0">
      <div className="btn-group" ref={ref}>
        <button
          type="button"
          className="btn btn-success fw-semibold"
          data-testid="play-button"
          disabled={busy !== null || shell.state.playing !== null || options.length === 0}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {busy || shell.state.playing ? (
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
        <span className="small text-white-50 d-none d-xxl-inline" data-testid="play-result">
          {last.matchesPlayed} match{last.matchesPlayed === 1 ? "" : "es"} played
        </span>
      )}
      {error && <span className="small text-warning">{error}</span>}
    </div>
  );
}

/**
 * One row at every width: below 1200 px the window badge is shorter, below 992 px the
 * sidebar's Menu button takes the title's place, and the league name gives way first.
 */
function TopBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const { state } = shell;
  const windowText =
    state.window &&
    `${state.window.id === "summer" ? "Summer" : "Winter"} window until ${formatDate(state.window.closes)}`;
  // A world with trades (SPEC §17.8): "Trades open until <date>", or closed to the play-offs' end.
  const trades = state.trades;
  const tradesText = trades
    ? trades.open && trades.until
      ? `Trades open until ${formatDate(trades.until)}`
      : "Trades closed until the play-offs end"
    : null;
  return (
    <nav
      className="navbar navbar-dark bg-dark sticky-top px-3 gap-3 flex-nowrap"
      style={{ borderBottom: `4px solid ${user?.colors.primary ?? "#198754"}` }}
      data-testid="top-bar"
    >
      <button
        type="button"
        className="navbar-toggler d-lg-none flex-shrink-0"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onClick={onMenu}
        data-testid="menu-button"
      >
        <span className="navbar-toggler-icon" />
      </button>
      <Link to="/" className="navbar-brand fw-bold me-0 d-none d-lg-block flex-shrink-0">
        Soccer Sim
      </Link>
      <PlayMenu />
      {state.live && (
        <Link
          to={leaguePath(shell.lid, "live")}
          className="btn btn-danger btn-sm fw-semibold text-nowrap flex-shrink-0"
          data-testid="live-link"
        >
          ● Live match
        </Link>
      )}
      <div
        className="text-white small d-flex gap-2 align-items-center text-nowrap flex-shrink-0"
        data-testid="game-date"
      >
        <span className="fw-semibold">{formatDate(state.date)}</span>
        <span className="text-white-50">
          {seasonLabel(state.season)} · {PHASE_LABELS[state.phase] ?? state.phase}
        </span>
        {state.window && (
          <span className="badge text-bg-success" title={windowText ?? undefined}>
            <span className="d-none d-xl-inline">{windowText}</span>
            <span className="d-xl-none">Window until {formatDayMonth(state.window.closes)}</span>
          </span>
        )}
        {trades && (
          <span
            className={`badge ${trades.open ? "text-bg-success" : "text-bg-secondary"}`}
            title={tradesText ?? undefined}
            data-testid="trades-badge"
          >
            <span className="d-none d-xl-inline">{tradesText}</span>
            <span className="d-xl-none">
              {trades.open && trades.until
                ? `Trades until ${formatDayMonth(trades.until)}`
                : "Trades closed"}
            </span>
          </span>
        )}
      </div>
      <div
        className="ms-auto d-flex align-items-center gap-2 text-white small text-nowrap"
        style={{ minWidth: 0 }}
      >
        <span
          className="text-white-50 d-none d-md-inline text-truncate"
          style={{ maxWidth: "16rem" }}
          title={shell.name}
          data-testid="league-name"
        >
          {shell.name}
        </span>
        {user && (
          <Link
            to={leaguePath(shell.lid, "squad", user.cid)}
            className="d-flex align-items-center gap-2 text-white text-decoration-none fw-semibold flex-shrink-0"
            data-testid="user-club"
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
            {PAGES.filter(
              (p) => p.section === section && !p.hidden && inWorld(p, shell.world.switches),
            ).map((p) => {
              const to = p.team
                ? leaguePath(shell.lid, p.key, shell.userCid)
                : leaguePath(shell.lid, p.key);
              return (
                <li key={p.key} className="nav-item">
                  <Link
                    to={to}
                    onClick={onNavigate}
                    className={`nav-link py-1 ${current === p.key ? "active fw-semibold" : ""}`}
                  >
                    {pageTitle(p, shell.world)}
                    {p.key === "dashboard" && shell.unread > 0 && (
                      <span
                        className="badge rounded-pill text-bg-primary ms-2"
                        data-testid="unread"
                      >
                        {shell.unread}
                      </span>
                    )}
                  </Link>
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
            <Link
              to={leaguePath(shell.lid, "settings")}
              onClick={onNavigate}
              className={`nav-link py-1 ${current === "settings" ? "active fw-semibold" : ""}`}
            >
              Settings
            </Link>
          </li>
          <li className="nav-item">
            <Link
              to={leaguePath(shell.lid, "how-to-play")}
              onClick={onNavigate}
              className={`nav-link py-1 ${current === "how-to-play" ? "active fw-semibold" : ""}`}
            >
              How to play
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/" onClick={onNavigate} className="nav-link py-1">
              Manage Leagues
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}

/** While the user is sacked: a reminder that play waits for him to take a job. */
function FiredBanner() {
  const { shell } = useShell();
  const fired = shell.state.fired;
  if (!fired) return null;
  return (
    <div
      className="alert alert-danger d-flex flex-wrap gap-2 align-items-center"
      data-testid="fired-banner"
    >
      <strong>You have been sacked</strong> ({formatDate(fired.date)}). Play resumes once you take a
      job.
      <Link to={leaguePath(shell.lid, "fired")} className="btn btn-sm btn-light">
        See your job offers
      </Link>
    </div>
  );
}

/** While Play waits for the user to trim his squad (SPEC §17.4): why, and his squad. */
function BlockedBanner() {
  const { shell } = useShell();
  const blocked = shell.state.blocked;
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  if (!blocked || !user) return null;
  return (
    <div
      className="alert alert-warning d-flex flex-wrap gap-2 align-items-center"
      data-testid="blocked-banner"
    >
      {blocked}
      <Link to={leaguePath(shell.lid, "squad", user.cid)} className="btn btn-sm btn-light">
        Your squad
      </Link>
    </div>
  );
}

/** When the board sacks the user, the "You're fired" screen comes up (once per sacking). */
function FiredRedirect() {
  const { shell } = useShell();
  const date = shell.state.fired?.date ?? null;
  const seen = useRef<string | null>(date);
  useEffect(() => {
    if (date !== null && date !== seen.current) navigate(leaguePath(shell.lid, "fired"));
    seen.current = date;
  }, [date, shell.lid]);
  return null;
}

export function Shell({ lid, children }: { lid: number; children: ReactNode }) {
  const [shell, setShell] = useState<LeagueShell | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const path = usePath();
  // The worker keeps one league open: another tab opened a different one, or deleted this.
  const [elsewhere, setElsewhere] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // While stopped, this tab makes no calls: any call would reopen its league and stop the other.
  const stopped = useRef(false);

  const reload = useCallback(() => {
    toWorker("getLeagueShell", lid)
      .then((s) => {
        setShell(s);
        setVersion((v) => v + 1);
      })
      .catch((e: unknown) => {
        // Refused because another tab opened a different league: this tab stops.
        if (e instanceof Error && e.message === LEAGUE_CLOSED) {
          stopped.current = true;
          setElsewhere(true);
        } else {
          setError(errorText(e));
        }
      });
  }, [lid]);

  /** Opens this league in the worker on purpose: tabs showing another one stop. */
  const claim = useCallback(() => {
    toWorker("openLeague", lid)
      .then(reload)
      .catch((e: unknown) => setError(errorText(e)));
  }, [lid, reload]);
  const openHere = () => {
    stopped.current = false;
    setElsewhere(false);
    setError(null);
    claim();
  };

  useEffect(() => {
    claim();
    const stops = [
      onWorkerEvent("gameChanged", (event) => {
        if (event.lid !== lid || stopped.current) return;
        // The new state at once (a Play started in another tab shows as "Playing…"),
        // then the rest of the shell.
        setShell((s) => (s ? { ...s, state: event.state } : s));
        reload();
      }),
      onWorkerEvent("leagueOpened", (event) => {
        const away = event.lid !== lid;
        // Another tab opened this league again: carry on, with fresh data.
        if (!away && stopped.current) reload();
        stopped.current = away;
        setElsewhere(away);
      }),
      onWorkerEvent("leaguesChanged", (event) => {
        if (event.leagues.some((l) => l.lid === lid)) return;
        stopped.current = true;
        setDeleted(true);
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [lid, reload, claim]);

  if (deleted) {
    return (
      <div className="container py-4">
        <div className="alert alert-secondary" data-testid="league-deleted">
          This league was deleted. <Link to="/">Back to your leagues</Link>
        </div>
      </div>
    );
  }
  if (elsewhere) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning" data-testid="league-elsewhere">
          <p>
            Another tab opened a different league. The game keeps one league open at a time, so this
            tab has stopped.
          </p>
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <button type="button" className="btn btn-primary btn-sm" onClick={openHere}>
              Open this league here
            </button>
            <Link to="/">Back to your leagues</Link>
          </div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">
          Could not open this league. {error} <Link to="/">Back to your leagues</Link>
        </div>
      </div>
    );
  }
  if (!shell) return <p className="container py-4">Opening the league…</p>;
  return (
    <ShellContext.Provider value={{ shell, version, reload }}>
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} />
      <div className="d-flex">
        <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <main className="app-main px-3 px-lg-4 py-3">
          <FiredRedirect />
          <FiredBanner />
          <BlockedBanner />
          <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>
        </main>
      </div>
    </ShellContext.Provider>
  );
}
