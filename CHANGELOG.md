# Changelog

## 0.3.0 (2026-10-29)

### Added
- **The Super League,** a second world to pick at New game beside Classic: 48 fictional clubs in three tiers of 16 (Star, Gold and Blue), run like the big North American leagues.
  - **Up and down:** three clubs go up and three go down between tiers each season, the top two and the winner of a play-off between 3rd and 6th. In Star the top eight play off for the title. There are no cups.
  - **No transfer market, loans or academies.** Players move by trades, the draft and free agency.
  - **Trades:** players and draft picks, on the Trade page. Ask the other club **What would make this work?**, put players and picks on the **Trading Block** for offers, and answer AI clubs' offers in your inbox. Trades close at the roster deadline in February and reopen after the play-offs.
  - **The draft:** two rounds in June, with a lottery among the weakest clubs for the first four picks (the odds are on Standings). Picks are assets: each club holds its picks for the next three drafts and can trade them. Pick on the **Draft** page, or let your scouts do it; **Draft Picks** shows what each club holds.
  - **Re-signing** once a year, after the draft, on **Re-sign Players**. A red E✕ on your squad marks a player who won't re-sign as things stand.
  - **A salary cap** by tier (€180m, €144m and €117m) with a minimum wage, a luxury tax shared among the clubs under the cap, salary matching in trades over the cap, and a grace season for relegated clubs. There is no financial fair play.
  - **A squad limit of 25** from the first league match.
  - **How to play** has a section on it.
- **Your own club names:** at New game, load a file that renames any club (name, short name, abbreviation), in either world. **Download a template** gives you the file to edit.
- **Man of the match:** the highest-rated player in every match, shown in the box score and at full time of a match you watch. Each player's count is on Player Stats, League Leaders and his profile. Saves from 0.2.0 get it for the matches they still hold.
- **Yellow-card bans:** every fifth yellow card of a season brings a one-match ban. Saves from 0.2.0 count from their next yellow.
- **Live commentary that tells the story:** how each chance came about (a cross from the wing, a set piece, a ball won high up, a rebound) and who stopped it. A **Key moments** switch keeps only goals, cards, substitutions, injuries, penalties and big chances.
- **A match preview** before a match you watch: both sides' last five results this season, their last meeting, and a derby badge for clubs from the same city.
- **More on the player profile:** his **Form** (his last five matches this season), his **Honours** (titles, promotions and awards, also as badges in his career table), his **Birthplace** and his **Injury history**. About half of a club's home-grown academy players are born in its city.
- **A Top assists award** in every league each season, on History.

### Changed
- **The inbox is on the Dashboard,** in full (the Inbox page is gone). Accept or reject a bid in its message.
- **Your tactics are yours.** The Tactics page always shows your saved tactics, and only you change them. Simulated matches start from them, and nothing the AI does in a match changes them. A match you watch starts from them as saved; if a player in them can't play, kick-off waits until you swap him out or press Auto.
- **Before a match you watch,** injured and suspended players show greyed out under Not in the squad.
- **Easier-to-read ratings,** in the ratings card and on the profile: grouped like FM into Technical, Mental and Physical, plus Set pieces and Goalkeeping, with full names. The ratings that matter most for the player's position are highlighted (on Tactics, the position of the slot he's in), and only the number is coloured red to green.
- **New names for 14 Classic clubs,** the ones also in the Super League, with new abbreviations and crest initials (Merseyside Reds are now Liverpool Reds, for example). Everything else about them is the same.

### Fixed
- Each live commentary line showed its minute twice, and first-half added time read 46' instead of 45+1'.

### Saves from 0.2.0
- They open as Classic leagues and play on. They get the AI's pick saved as your tactics if you never saved any, the city birthplaces for academy players, and injury histories from the day they're first opened.
- They keep the 14 clubs' old names, while those clubs' crests show the new initials.

## 0.2.0 (2026-10-21)

### Added
- **A full tactics board when you pause a live match** (and at half-time): the pitch and tables from before kick-off, with each player's energy and his rating so far. Drag a substitute onto a player to bring him on, or move players between positions; the team ratings show what your changes would do before you make them.
- **Moving players between positions is free** during a match, including into a sent-off player's empty slot.
- **See where a player fits** while you drag or pick him on Tactics or before a match: green marks the places that suit him, darker for his natural positions and lighter where he can cover.

### Changed
- **Match ratings** average about 6.9 (was 6.6) and spread wider: standout games rate higher and the worst lower, while a 10 stays rare. Tackles, interceptions and key passes count for more, so a midfielder can reach 8 without scoring.
- **Keepers are rated on goals prevented:** the saves they make against the quality of the shots they face. They average about 6.8: a clean sheet is usually around 7.5; conceding four after a decent game is about 6; mistakes cost more, but a keeper rarely drops below 4.5.
- Saves from 0.1.0 have their ratings converted when first opened.

## 0.1.0 (2026-10-21)

The first release. Play it at https://soccer-sim-game.pages.dev; the in-game **How to play** page explains the basics.

### What you can do
- **Manage any of 62 fictional clubs** in three leagues (the English top flight, the English second tier and the German top flight), for as many seasons as you like.
- **Play through real seasons** from July to June: league rounds on real dates, a domestic cup in each country with extra time and penalties, the English second tier's play-offs, then promotion and relegation.
- **Watch your matches live,** or simulate them. Before kick-off, change the line-up for that match; during it, pause to make substitutions or change the formation and tactics. A match is saved as it goes, so closing the game resumes it.
- **Set your tactics:** five formations with a positional pitch view, who plays where, and three sliders (mentality, pressing, directness), with live team ratings.
- **Build your squad:**
  - two transfer windows, with bids, the transfer list and incoming offers;
  - loans, free agents and contract talks;
  - renewals in the windows (a player in his last year must be renewed by 31 January);
  - releasing players.
- **Dismissals carry suspensions:** one domestic match for a second yellow, three for a straight red.
- **Bring through your academy:** a new intake every summer; promote or release your prospects.
- **Run the club's money:**
  - ticket price and budget dials (coaching, youth academy, medical, facilities);
  - a budget split between transfer fees and wages;
  - financial fair play: a warning, then a one-window transfer ban.
- **Keep the board happy.** It sets a target each preseason and can sack you; then you can take a job offer from another club.
- **Follow the world:** standings, cups, schedule, power rankings, every club's finances, history, awards, transactions, player profiles with a ratings radar and full ratings-history tables, league leaders, player and team stats, injuries and an inbox.
- **Read players at a glance:** inline ratings cards, flat nationality flags, cosmetic skill and status tags, season-to-season OVR/POT changes, full ratings-history tables and positional OVR maps. Hover injury badges for recovery time; follow player links directly from inbox messages.
- **Scan results and tables:** alternating row shades and full green, yellow or red result rows. Search the transfer market by nationality, age, OVR, POT, value, wage and expiring contracts.
- **Players grow and age:** they develop with minutes and coaching, peak in their late twenties, decline and retire.

Runs entirely in your browser; saves stay on your device. A full season plays in 4–5 seconds on a recent Mac.

### Known limits
- **One small world:** three leagues, no European competitions, no clubs outside them, and no German second tier, so nobody is relegated from the German top flight or the English second tier.
- **Saves live in one browser.** There is no export or import yet, and clearing the site's data deletes them.
- **Built for laptop and desktop screens,** down to windows about 960 px wide. Phones aren't supported.
- **Tested in Chrome and Safari.** Firefox hasn't been tested yet.
- **Not in this version:**
  - bans for a build-up of yellow cards (only sendings-off bring suspensions; saves from before 0.1.0 start with none);
  - scouting (ratings are shown exactly);
  - pre-contracts and release clauses;
  - loan recalls and options to buy;
  - fines or points deductions for overspending;
  - dark mode.
