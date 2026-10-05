---
name: hockey-deploy-live
description: Put a Svensk hockey change into a running Home Assistant and confirm it took. Use after editing the integration or the card when the repo is symlinked into a live Home Assistant, before saying a change is live.
---

# Deploying to a live Home Assistant

A development setup has this repo inside the Home Assistant config folder,
with `config/custom_components/swedish_hockey` a **relative symlink** to the
repo's `custom_components/swedish_hockey`. Edit in the repo; there is no
second copy. Run the tests first (`hockey-test`).

## Card-only changes

```sh
cd frontend && npm run typecheck && npm test && npm run build
```

That writes `custom_components/swedish_hockey/www/hockey-match-card.js`, served
at `/swedish_hockey/frontend/hockey-match-card.js` with caching off. Browsers
still keep the module the dashboard resource URL points at, so bump the `?v=`
on that resource (Settings → Dashboards → Resources, or the
dashboard-resource tool) and say a hard refresh may be needed. No restart.

## Python changes need a restart

`homeassistant.reload_config_entry` re-runs setup with the modules already in
memory: it picks up options, not edits to `.py` files. Restart Home Assistant,
then wait until the API answers and a minute or two more for integrations.
A restart interrupts everything else in the house too; check nothing else
(an EV charge, an alarm) is mid-way first.

## Verify, every time

- The `swedish_hockey` config entries are `loaded`.
- Nothing was logged: search the system log for `swedish_hockey`.
- The sensors have values (next game, league position).
- For the card: fetch `/swedish_hockey/frontend/hockey-match-card.js` and check
  it is the new build (the first line says GENERATED), then render the real
  dashboard card against the real states.
