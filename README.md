# Svensk hockey

Swedish ice hockey in Home Assistant: the **SHL** and **Hockeyallsvenskan**
schedules as calendars, your team's next game, the live score while it is
played, the league table, and a dashboard card that opens onto the whole
league.

- **Calendars.** One per followed team with its whole season, and one with
  every game in the league (disabled until you enable it).
- **Next game and the table.** A sensor for each team's next game (opponent,
  venue, TV channels, the last result) and one for its place in the table,
  with the table itself as an attribute.
- **Live score.** While a game is on: the score, period and clock, power
  plays, shots and the match log, read every 20 seconds (configurable) and
  pushed sooner when the league's own live feed has a goal first.
- **Odds.** Svenska Spel's odds on regular time (1X2) for the games it has
  opened betting on - in practice the next round - on the next-game sensor,
  in the services' game lists and in the card.
- **Goal events.** `swedish_hockey_goal` once per goal and
  `swedish_hockey_game_end` at the final whistle, for notifications that do not
  need to poll a sensor.
- **Services** that answer with the league's data: the table, a team's
  schedule and results, a game's summary, a player's season, a squad, the
  league's statistics.
- **A card and a badge.** Live score or next game on the face; behind it a
  dialog with today's games, the table, the schedule, statistics, each club's
  page, each player's, and a preview of every game still to come: where the
  two clubs stand, their form, their meetings this season and in earlier
  ones, how their seasons compare and who to watch.

> This is an unofficial integration. Neither league publishes an API; it reads
> the same endpoints the leagues' own websites use, and it can break when they
> change. It is not affiliated with SHL, Hockeyallsvenskan or Svenska
> Ishockeyförbundet.

## Requirements

- **Home Assistant 2026.3** or newer.

## Installation

### HACS

1. In HACS, open the menu → **Custom repositories**, add
   `https://github.com/thrawnarn/ha-swedish-hockey` with type **Integration**.
2. Install **Svensk hockey** and restart Home Assistant.

### Manual

Copy `custom_components/swedish_hockey` into your Home Assistant
`config/custom_components/` folder and restart.

## Setup

**Settings → Devices & services → Add integration → Svensk hockey.** Pick the
league, then the teams to follow. Each league is one entry; add the other
league as a second entry.

Each followed team becomes a device with:

| Entity | What it is |
|---|---|
| `calendar.<team>` | The team's games, the whole season |
| Next game (`sensor`) | Start time of the next game; opponent, venue, `tv_channels`, `odds`, `recent_results`, `last_result` as attributes |
| League position (`sensor`) | The team's place; `table` (and `live_table` while games are played) as attributes |
| Live score (`sensor`) | The score while a game is on; period, clock, shots, power play, `events` |
| Home goals, Away goals, Period (`sensor`) | The live score as numbers |
| Highlights (`sensor`) | The latest highlight clip |
| Live scoring (`switch`) | Turns the live polling off and on |

The league itself is a device too, with the league-wide calendar.

**Options** (Configure on the entry): the followed teams, how long a game is
assumed to last (for calendar entries), and how often a game in progress is
read.

Teams are identified by their **club code** (LIF, SSK, MODO ...), which the
sensors carry as `team_code`. Services accept the code or any spelling of the
club's name, but the code is the reliable one: the leagues spell the same club
differently from one payload to the next.

## The card

The integration serves its own card and badge, and adds them to your
dashboards' resources by itself: install the integration, restart, and
**Hockey Match** is in the card picker and the badge picker. Or in YAML:

```yaml
type: custom:hockey-match-card
team: LIF
```

```yaml
type: custom:hockey-match-badge
team: LIF
```

Any game still to come opens a preview: tap it in the schedule, among
today's games or on a club's page, tap the middle of the card or its
**Matchinfo** button, or tap the badge while it shows the next game.

`team` is the club code or the team device's name. The card finds the team's
sensors from its device; `live_entity`, `next_entity` and `standings_entity`
override that for hand-written YAML.

| Option | Default | |
|---|---|---|
| `title` | – | A heading above the card |
| `show_clock` | `true` | The game clock while a game is on |
| `show_powerplay` | `true` | The power play line |
| `show_shots` | `true` | Shots on goal under the score |
| `show_tv` | `true` | TV channels |
| `show_events` | `true` | The match log button |
| `show_table` | `true` | The table button and tab |
| `show_results` | `true` | The earlier results button |
| `show_stats` | `true` | The statistics tab and figures |
| `show_odds` | `true` | Svenska Spel's odds on games still to come |
| `result_hours` | `6` | How long a finished result stays on the face (0: straight to the next game) |

### The dashboard resource

At every start the integration makes sure there is exactly one resource for
the card: `/swedish_hockey/frontend/hockey-match-card.js?v=…`, where `v` is a
fingerprint of the card it serves. An update brings a new card and so a new
URL, and browsers load it rather than a cached copy. A resource you added by
hand for an older copy of the card (any URL ending in `hockey-match-card.js`)
is turned into this one, since two copies cannot both load. Removing the
integration removes the resource.

This works for dashboards in storage mode, the default. If your dashboards are
in YAML mode, add the resource yourself:

```yaml
lovelace:
  resources:
    - url: /swedish_hockey/frontend/hockey-match-card.js
      type: module
```

## Services

Every service takes the league's `config_entry_id` and returns data
(`response_variable` in a script or automation). Games still to come in
`get_schedule`, `get_live` and `get_matchup` carry `odds` - `home`, `draw`,
`away` in decimals, the `market` and the `source` - once Svenska Spel has
opened betting on them.

| Service | Returns |
|---|---|
| `get_standings` | The table, counting games in progress unless `live: false` |
| `get_game` | A team's current or next game |
| `get_play_by_play` | The live state and goals of a team's current game |
| `get_highlights` | A team's highlight clips, newest first |
| `get_results` | A team's played games, most recent first |
| `get_recap` | A game's summary: score, goals, shots, figures, where it left the team |
| `get_schedule` | The league's games (or one team's), from `before` games back |
| `get_live` | A day's games with the score as it stands |
| `get_form_table` | The table over each club's last few games |
| `get_player` | A player's season |
| `get_roster` | Everyone who has played for a team this season |
| `get_statistics` | The league's skater, goalkeeper and club statistics |
| `get_matchup` | Two clubs before a game (by `game_id`, or `team` and `opponent` for their next meeting): table rows, form overall, at home and away, records, runs, rest and this season's meetings |
| `get_head_to_head` | Two clubs' meetings in earlier seasons (`seasons`, default 5), in either league, from the federation's archive |
| `set_goal_reference` | Remembers what was sent for a goal (a message id), handed back by `swedish_hockey_goal_updated` |

## Events

| Event | When | Data |
|---|---|---|
| `swedish_hockey_goal` | Once per goal | `team`, `game_id`, `score`, `scorer`, `assists`, `note`, `ours`, `source` (`push` or `poll`) |
| `swedish_hockey_goal_updated` | A goal's scorer or assists arrive or change after it was announced | as above, plus `reference` and `previous` |
| `swedish_hockey_game_end` | The final whistle | `score`, `decided_in`, `we_won` |

A goal is announced as soon as the score changes; the scorer often follows a
little later. `swedish_hockey_goal_updated` waits up to a minute for
`set_goal_reference`, so an automation can store the id of the message it sent
and then edit that message rather than send a second one.

## Where the data comes from

| Source | Used for |
|---|---|
| `shl.se/api` | SHL schedule, table, games, statistics |
| `hockeyallsvenskan.se` | Hockeyallsvenskan schedule, table, games, players, statistics |
| `game-data.s8y.se`, `game-broadcaster.s8y.se` | Play-by-play, and the live feed both leagues' sites use |
| `stats.swehockey.se` | The federation's game sheets: period scores, saves, power play time |
| `stats.swehockey.se` archive | Earlier seasons of both leagues, for meetings between two clubs; each finished season is read once and kept |
| `tv.nu` | Which channel shows a game (neither league says) |
| Svenska Spel (Kambi's offering API) | Odds on regular time for the next round; read at most every ten minutes, and only while a game is near |

## Development

```
custom_components/swedish_hockey/   the integration
  card.py                           serves the card, keeps its dashboard resource
  www/hockey-match-card.js          the built card (generated, committed)
  brand/                            the icon (rendered from assets/icon.svg)
frontend/                           the card's TypeScript source
  dev/index.html                    the card in a browser, against made-up data
tests/                              the integration's tests
```

The tests are plain scripts on the standard library; the card is TypeScript
and Lit, built with esbuild and tested in happy-dom:

```sh
for t in tests/test_*.py; do python3 "$t" | tail -1; done
cd frontend && npm ci && npm run typecheck && npm test
npm run build   # writes custom_components/swedish_hockey/www/hockey-match-card.js
```

Never edit `www/hockey-match-card.js` by hand: CI checks that it is exactly
what `frontend/src` builds to.

## License

MIT. See [LICENSE](LICENSE).
