import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, CARD_CONFIG, hassWith, mount, tap, text, unmount } from "./harness.mjs";
import { liveSensor, OURS, ourGames, resultOf, sensors } from "./fixture.mjs";

test("between games the card shows the next fixture", async () => {
  const card = await mount();
  const names = $$(card, ".team-name").map(text);
  const next = ourGames().find((g) => g.home_score === null);
  assert.deepEqual(names, [next.home_team, next.away_team]);
  assert.match(text($(card, ".kickoff")), /^\d\d:\d\d$/);
  assert.equal(text($(card, ".venue")), next.venue);
  unmount(card);
});

test("the footer offers the next game's page, the table and the earlier results", async () => {
  const card = await mount();
  assert.deepEqual($$(card, ".footer-bar .bar-button").map(text), ["Matchinfo", "Tabell", "Tidigare"]);
  unmount(card);
});

test("a held result shows how it went, and the arrow crosses to the next game", async () => {
  const last = ourGames().filter((g) => g.home_score !== null).at(-1);
  const result = { ...resultOf(last), ended_at: new Date(Date.now() - 3600e3).toISOString() };
  const card = await mount(CARD_CONFIG, hassWith({ states: sensors({ lastResult: result }) }));
  assert.match(text($(card, ".final")), /VINST|FÖRLUST|SLUTRESULTAT/);
  assert.equal(text($(card, ".score")), result.score);
  await tap(card, ".view-toggle");
  assert.equal($(card, ".final"), null);
  assert.ok($(card, ".kickoff"));
  unmount(card);
});

test("a result older than the hold is not shown", async () => {
  const last = ourGames().filter((g) => g.home_score !== null).at(-1);
  const result = { ...resultOf(last), ended_at: new Date(Date.now() - 10 * 3600e3).toISOString() };
  const card = await mount(CARD_CONFIG, hassWith({ states: sensors({ lastResult: result }) }));
  assert.equal($(card, ".final"), null);
  assert.equal($(card, ".view-toggle"), null);
  unmount(card);
});

test("while a game is on the card shows it live, with the last goal", async () => {
  const card = await mount(CARD_CONFIG, hassWith({ states: sensors({ live: liveSensor() }) }));
  assert.equal(text($(card, ".live-badge")), "LIVE");
  assert.equal(text($(card, ".score")), "2-1");
  assert.equal(text($(card, ".period")), "Period 2 · 08:14");
  assert.match(text($(card, ".pp")), /5 mot 4/);
  assert.match(text($(card, ".footer-line")), /07:58 .*Ada Berg.*\(PP\)/);
  assert.equal(text($(card, ".assists")), "Eva Fors, Bo Ek");
  // The match log is a button of its own while the game is on.
  // The next game's page is not offered while this one is on.
  assert.deepEqual($$(card, ".footer-bar .bar-button").map(text), ["Händelser 4", "Tabell", "Tidigare"]);
  unmount(card);
});

test("settings switch parts of the face off", async () => {
  const config = { ...CARD_CONFIG, show_powerplay: false, show_clock: false, show_shots: false };
  const card = await mount(config, hassWith({ states: sensors({ live: liveSensor() }) }));
  assert.equal($(card, ".pp"), null);
  assert.equal($(card, ".shots"), null);
  assert.equal(text($(card, ".period")), "Period 2");
  unmount(card);
});

test("a card for a team that is not there says so", async () => {
  const card = await mount({ ...CARD_CONFIG, team: "Nobody" });
  assert.match(text($(card, "ha-card")), /No entities found for Nobody/);
  unmount(card);
});

test("a card needs a team", () => {
  const card = document.createElement("hockey-match-card");
  assert.throws(() => card.setConfig({}), /Pick a team/);
});

test("the badge shows the next game as a chip", async () => {
  const card = await mount({ type: "custom:hockey-match-badge", team: OURS.code }, hassWith(), "hockey-match-badge");
  const next = ourGames().find((g) => g.home_score === null);
  assert.match(text($(card, ".chip")), new RegExp(`${next.home_code} – ${next.away_code}`));
  unmount(card);
});

test("the badge shows a game being played, and opens on it", async () => {
  const hass = hassWith({ states: sensors({ live: liveSensor() }) });
  const card = await mount({ type: "custom:hockey-match-badge", team: OURS.code }, hass, "hockey-match-badge");
  assert.ok($(card, ".chip.is-live"));
  assert.match(text($(card, ".chip")), /2–1 .* P2 08:14/);
  await tap(card, ".chip");
  assert.ok($(card, "dialog:not(.picker)").open);
  assert.ok($(card, "hockey-game-view .scoreboard.playing-now"));
  // The badge always has its tabs, the game first.
  assert.deepEqual($$(card, ".dialog-nav .bar-button").map(text), [
    "Match", "Matcher", "Tabell", "Spelschema", "Statistik",
  ]);
  unmount(card);
});

test("the parts a card is made of are each defined once, as their own elements", () => {
  for (const name of [
    "hockey-dialog", "hockey-team-picker", "hockey-loading", "hockey-league-view", "hockey-today-view",
    "hockey-table-view", "hockey-schedule-view", "hockey-stats-view", "hockey-team-view",
    "hockey-recap-view", "hockey-player-view", "hockey-game-view", "hockey-events-view",
    "hockey-results-view", "hockey-match-card", "hockey-match-badge",
    "hockey-match-card-editor", "hockey-match-badge-editor",
  ]) {
    assert.ok(customElements.get(name), name);
  }
  assert.ok(window.customCards.some((c) => c.type === "hockey-match-card"));
  assert.ok(window.customBadges.some((c) => c.type === "hockey-match-badge"));
});
