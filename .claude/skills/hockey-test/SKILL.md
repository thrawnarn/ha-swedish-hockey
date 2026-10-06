---
name: hockey-test
description: Run and write Svensk hockey's tests. Use after any change to custom_components/swedish_hockey or frontend/, when adding a regression test, or when a card test hangs or fails on rendering.
---

# Testing Svensk hockey

## Run everything

From the repository root:

```sh
for t in tests/test_*.py; do printf "%s: " "$t"; python3 "$t" 2>&1 | tail -1; done
cd frontend && npm run typecheck && npm test
```

Report the per-file totals. A Python file whose last line is a traceback
crashed; say which check it stopped at.

## The integration (`tests/`)

Plain scripts on the standard library: no pytest, no Home Assistant install.
`tests/_rig.py` stubs `aiohttp` and `homeassistant.util.dt` and loads modules
from `custom_components/swedish_hockey/` as the package `sh`
(`load("api")`). Each check is `check("a sentence that reads as a spec", cond)`;
`done()` prints `N/M passed` and exits non-zero on a failure.

- `test_api.py`: club matching, scores, season year, goal clock and strength.
- `test_tv.py`: pairing tv.nu listings with games.
- `test_metadata.py`: manifest, translations, services.yaml against strings,
  and that the served card is the build.
- `test_card.py`: the dashboard resource the integration keeps.
- `test_matchup.py`: form, records, runs, rest and meetings before a game.
- `test_archive.py`: the federation archive's pages (made-up markup in the
  site's shape) and the read-once store.

A module that imports more of Home Assistant (coordinator, sensors) needs more
stubs in `_rig.py`; add them there rather than per file.

## The card (`frontend/test/`)

Node's test runner against the **built** bundle in happy-dom. `npm test`
builds `frontend/.cache/hockey-match-card.js` and `.cache/internals.mjs` (the
pure modules), never the served file.

- `harness.mjs`: pins `TZ=Europe/Stockholm` and the clock (`fixture.NOW`),
  stubs `ha-card`/`ha-icon`/`ha-form`, and gives `hassWith({ states, answers })`
  (every service call recorded in `hass.calls`), `mount`, `settle`, `tap`,
  `choose`, `$`/`$$`, `text`, `deferred`.
- `fixture.mjs`: a made-up league of fourteen clubs. Never put real league
  data in the repo.
- **Always `await settle(card)`** after changing anything: the parts are
  nested Lit elements that render after the card does, and service replies are
  promises.
- To test a loader or a late reply, answer a service with `deferred().promise`
  and resolve it when the test chooses.
- `textContent` of a filter chip includes its hidden `<option>`s; read the
  chip's `span`.

## Looking at it

The tests check behaviour, not looks. `frontend/dev/index.html` puts the card
in a browser against the made-up league:

```sh
cd frontend && node build.mjs --test && python3 -m http.server 8123
# http://localhost:8123/dev/?scene=schedule   (face, live, result, badge,
# table, today, schedule, stats, skaters, team, roster, recap, player,
# preview, game, loading; &theme=light)
```

For a visual change, look at a screenshot at phone width (390 px) and at
desktop width. Chromium's `--window-size` will not go
below 500 px, so put the page in a 390 px iframe, or drive it over the
DevTools protocol with `Emulation.setDeviceMetricsOverride`. Don't trust
`--virtual-time-budget` for anything that depends on `<dialog>` close events.
