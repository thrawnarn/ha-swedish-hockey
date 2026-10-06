# CLAUDE.md

Guidance for Claude Code working in this repository.

Svensk hockey is a Home Assistant custom integration
(`custom_components/swedish_hockey/`) for the SHL and Hockeyallsvenskan:
calendars, next-game, standings and live-score sensors, goal events and
services that answer with the leagues' data. It includes a Lovelace card and
badge, written in TypeScript and Lit in `frontend/` and built into
`custom_components/swedish_hockey/www/hockey-match-card.js`, which the
integration serves at `/swedish_hockey/frontend/` and keeps registered as a
dashboard resource (`card.py`). The GitHub repository is
`thrawnarn/ha-swedish-hockey`.
This is meant to become a public repository, so read the `hockey-release` skill
before any push.

## Skills in this repo

- `hockey-test`: running and writing the tests, and the harness gotchas.
- `hockey-deploy-live`: getting a change into a running Home Assistant and
  verifying it.
- `hockey-release`: privacy sweep, version, tag and push.

## Layout

| Module | Role |
|---|---|
| `api.py` | The two leagues' clients: schedule, table, games, play-by-play, players, statistics endpoints; the dataclasses everything else passes around (`Team`, `Game`, `LiveGame`, `Goal`...) |
| `coordinator.py` | The league coordinator (schedule, table, results, TV) and one live coordinator per followed team; goal events and their dedup log |
| `push.py` | The s8y live feed (Server-Sent Events) laid over the polled live game |
| `swehockey.py`, `stats.py` | The federation's game sheet, and the figures made from it |
| `league_stats.py` | `get_statistics`: the statnet tables both leagues publish |
| `tv.py` | TV channels from tv.nu, paired with games by time and club name |
| `services.py` | Every service; normalised dictionaries for both leagues |
| `card.py` | Serves `www/` and keeps one Lovelace resource for the card, versioned by the build's fingerprint; takes over hand-added copies; removed with the last entry |
| `sensor.py`, `calendar.py`, `switch.py` | The entities |

The card (`frontend/src/`):

| Module | Role |
|---|---|
| `card/card.ts`, `card/face.ts` | `<hockey-match-card>`: the face, and the owner of the controller |
| `card/badge.ts` | `<hockey-match-badge>`: the same card behind a chip |
| `controller.ts` | All of the dialog's state, every service call, and how to move between views |
| `context.ts` | `Ctx`: what every part is handed, new on every render |
| `dialog/dialog.ts`, `dialog/picker.ts` | `<hockey-dialog>` (routing, tabs, photo) and `<hockey-team-picker>` |
| `views/*.ts` | One element per view: today, table, schedule, stats, team, recap, player, game, events, results |
| `parts/*.ts` | Markup shared by the views: fixture rows, scoreboard, stat bars, timeline, filter row, `<hockey-loading>` |
| `styles.ts` | The one stylesheet |
| `format.ts`, `stats-model.ts`, `teams.ts`, `time.ts`, `constants.ts` | Pure helpers and tables, tested directly |

## Conventions

- **Club codes are the identifier.** A club is LIF in one payload, "Leksand"
  in the next and "Leksands IF" in a third. Key on the code (`team_code`),
  match names only as a fallback (`api.match_team`, the card's `clubKey`).
- **Swedish on screen.** The card, entity names and service answers speak
  Swedish; `strings.json` (English) and `translations/sv.json` must have the
  same keys (a test checks), and `translations/en.json` is a copy of
  `strings.json`.
- **Comments explain why**, often by naming what happened that made a rule
  necessary. Keep that voice, and read a rule's comment before "fixing" it.
- **No installation's entities in code.** Nothing names a real device, entity
  or config entry; tests use made-up clubs (`frontend/test/fixture.mjs`).
- **Never edit `www/hockey-match-card.js` by hand.** Change `frontend/src/`
  and run `npm run build` in `frontend/`; CI fails if the committed file does
  not match the source. `npm test` builds its own copy into
  `frontend/.cache/`, so running the tests never touches the served file.
- **The card bundles its own Lit**, as ChargeSteer's does: typed, testable
  outside Home Assistant, independent of HA internals. Every part renders into
  the card's shadow root (`LightElement`), so `styles.ts` reaches them all;
  view elements are `display: contents` so their rows sit directly in the
  dialog's flex panel, which the sticky filter row depends on.
- **The card's resource is the integration's.** `card.py` rewrites any
  resource ending in `hockey-match-card.js` to the served URL at every start,
  and only ever writes to Lovelace's collection after it has been loaded
  (writing first would save over the user's resources). It touches nothing
  in YAML mode. Keep both rules if you change it; `tests/test_card.py`
  checks them.
- **State changes go through the controller.** Its state fields are accessors
  that ask the card to render again; views read them and call its methods.
  Every fetch is stamped (`newRequest`/`stale`) so a late reply cannot
  resurrect a view the user has left.
- `frontend/node_modules` is a symlink made by `./deps.sh` into
  `~/.cache/swedish-hockey-frontend`, keeping it out of Home Assistant backups.
  Run `./deps.sh`, not `npm install`, inside a Home Assistant config folder.
