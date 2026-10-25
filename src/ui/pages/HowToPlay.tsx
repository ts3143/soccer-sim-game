/**
 * How to play (M7, design doc #59): a short guide for new managers. It opens inside a league
 * from the sidebar's Tools (`/l/:lid/how-to-play`) and on its own from Manage Leagues
 * (`/how-to-play`).
 */
import type { ReactNode } from "react";
import { Link } from "../router";
import { PageHeader } from "../shell/PageHeader";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="h5">{title}</h2>
      {children}
    </section>
  );
}

function Guide() {
  return (
    <div style={{ maxWidth: "48rem" }} data-testid="how-to-play">
      <p className="lead">
        You manage a football club for as many seasons as you like: pick the team, buy and sell
        players, bring through your academy and keep the board happy.
      </p>
      <Part title="Starting">
        <ul>
          <li>
            On <b>Manage Leagues</b>, start a <b>New league</b> and pick any of 62 clubs in three
            leagues: the English top flight, the English second tier and the German top flight.
          </li>
          <li>
            Each club&apos;s card shows its strength and revenue. A strong club is expected to win
            things; a small one to survive.
          </li>
          <li>The seed is optional: the same seed and club give the same starting world.</li>
        </ul>
      </Part>
      <Part title="Playing through a season">
        <ul>
          <li>
            A season runs from 1 July to 30 June. The top bar shows the date, the phase and any open
            transfer window.
          </li>
          <li>
            <b>Play</b> moves the game on: until your next match, a week, until the window closes,
            or to the end of the season. When the season ends,{" "}
            <b>Proceed to promotion and relegation</b>, then <b>Advance to preseason</b>.
          </li>
          <li>
            Matches you don&apos;t watch are simulated. In those, the AI picks your line-up and
            makes your substitutions, as it does for every club.
          </li>
          <li>
            The <b>Inbox</b>, on the Dashboard, collects the board&apos;s messages, bids for your
            players, injuries and deadline reminders. Open a bid to accept or reject it there.
          </li>
        </ul>
      </Part>
      <Part title="Your squad and tactics">
        <ul>
          <li>
            Small tags beside names describe key skills. Hover or focus a tag for its meaning,
            cutoffs and current ratings. They are cosmetic: crossing a cutoff never changes
            gameplay. Pc: pace; St: strength; Ae: aerial threat; Dr: dribbling; Fi: finishing; Pa:
            smart passing; Sp: set pieces; Cr: crossing; Bw: ball winning; En: endurance/work rate;
            Rf: goalkeeper reflexes; Ha: goalkeeper handling.
          </li>
          <li>
            <b>OVR</b> is how good a player is now, in his position. <b>POT</b> is a forecast of how
            good he may become.
          </li>
          <li>
            <b>Tactics</b> holds your formation, who plays where, and three sliders: mentality,
            pressing and directness. The pitch and table show the same line-up: drag between slots,
            or select a player and then a destination to swap. Player profiles also map OVR at every
            position. Your lineup and sliders apply to the matches you watch.
          </li>
          <li>
            Players tire. Condition drops with every match and recovers with rest; below about 75%
            the injury risk climbs fast, so rotate.
          </li>
          <li>You can have up to 25 senior players. Academy players don&apos;t count.</li>
          <li>
            A second yellow means a one-match suspension; a straight red means three; every fifth
            yellow card in a season means one. Bans are served in domestic league and cup fixtures,
            even while injured.
          </li>
        </ul>
      </Part>
      <Part title="Watching a match live">
        <ul>
          <li>
            <b>Play → Watch your next match</b>. Before kick-off you can change the line-up for this
            match only; your saved tactics stay as they are.
          </li>
          <li>
            Pause at any time to make substitutions, or change the formation or sliders. You have 5
            substitutions, made in at most 3 stops; changes at half-time don&apos;t use one. The
            match also stops by itself at half-time, for injuries and red cards, and before extra
            time.
          </li>
          <li>
            The speed slider sets the pace; <b>To full time</b> plays the rest at once. A match is
            saved as it goes: close the game and it carries on where you left it.
          </li>
          <li>
            The commentary tells how each chance came about. Switch it to <b>Key moments</b> for
            just the goals, cards, substitutions and big chances.
          </li>
        </ul>
      </Part>
      <Part title="Transfers, loans and contracts">
        <ul>
          <li>
            There are two transfer windows: summer (1 July to 31 August) and winter (January). Buy,
            sell and loan on the <b>Transfer Market</b>. Free agents can be signed at any time.
          </li>
          <li>
            A transfer takes two steps: agree a fee with the club, then a contract with the player.
            Wages are per year. Your transfer budget and wage room show on every transfer and
            contract screen.
          </li>
          <li>
            List a player with an asking price, and clubs that need his position will bid in the
            windows. Bids arrive in your Inbox, where you answer them.
          </li>
          <li>
            Contracts end on 30 June. Renewals happen only in the windows, so a player in his last
            year must be renewed by 31 January or he leaves for free on 1 July. The Squad page marks
            these players.
          </li>
          <li>
            A released player leaves at once, but you keep paying his wages until his contract would
            have ended.
          </li>
        </ul>
      </Part>
      <Part title="Youth academy">
        <ul>
          <li>
            Every preseason brings 3–6 youngsters aged 15–16. At 17 or 18, promote them (a first
            contract of three seasons) or release them; to loan one out, promote him first.
            Undecided players aged 18 or over are decided for you on 1 July.
          </li>
          <li>
            Young players grow by playing: minutes at the right level matter most, up to about 23. A
            prospect who hardly plays may never reach his POT.
          </li>
        </ul>
      </Part>
      <Part title="Money and the board">
        <ul>
          <li>
            Money comes from tickets, TV, prize money, sponsors and player sales. On{" "}
            <b>Finances &amp; Facilities</b> you set the budget dials (coaching, youth academy,
            medical, facilities) and, before your first home match, the season&apos;s ticket price.
          </li>
          <li>
            Financial fair play: wages plus transfer fees (spread over the contracts) must stay
            within 70% of revenue, checked on 30 June. One season over brings a warning; a second in
            a row bans all signings for the next window.
          </li>
          <li>
            If your cash goes below zero, you can&apos;t pay transfer fees until it recovers. Free
            agents can still be signed.
          </li>
          <li>
            The board sets a target each preseason. Its confidence follows your results against the
            target, your finances and the fans&apos; mood. If it falls too low you&apos;re sacked:
            take a job at another club, or start a new league.
          </li>
        </ul>
      </Part>
      <Part title="Saves">
        <ul>
          <li>
            Your saves stay in this browser on this device. Clearing the site&apos;s data deletes
            them.
          </li>
          <li>
            One league is open at a time. Open it in several tabs and they stay in step; open a
            different league and the other tabs stop.
          </li>
        </ul>
      </Part>
    </div>
  );
}

/** Inside a league, from the sidebar's Tools. */
export function HowToPlay() {
  return (
    <>
      <PageHeader title="How to play" />
      <Guide />
    </>
  );
}

/** On its own, from Manage Leagues. */
export function HowToPlayPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 960 }}>
      <div className="d-flex align-items-center gap-3 mb-4">
        <h1 className="h3 mb-0">How to play</h1>
        <Link to="/" className="ms-auto">
          Back to your leagues
        </Link>
      </div>
      <Guide />
    </main>
  );
}
