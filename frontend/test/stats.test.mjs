import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, callsTo, choose, hassWith, mount, settle, tap, text, unmount } from "./harness.mjs";
import { CLUBS, OURS } from "./fixture.mjs";

async function stats(hass = hassWith()) {
  const card = await mount(undefined, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Statistik");
  return card;
}

test("the leaders open with our club as the league sees it", async () => {
  const card = await stats();
  assert.match(text($(card, ".st-ours-title")), new RegExp(`${OURS.name} i ligan`));
  assert.ok($$(card, ".lb-card").length >= 10);
  assert.match(text($(card, ".st-foot")), /Uppdaterad \d\d:\d\d/);
  unmount(card);
});

test("the filter row carries the scope for every section", async () => {
  const card = await stats();
  const bar = $(card, "hockey-stats-view .filter-bar");
  assert.ok(bar);
  assert.equal(text(bar.querySelector(".filter-select span")), "Säsong");
  assert.equal(bar.querySelector(".team-pick"), null, "the leaders have no club filter");
  unmount(card);
});

test("the skaters table filters by club and position from the filter row", async () => {
  const card = await stats();
  await tap(card, "hockey-stats-view .st-sections button", "Spelare");
  assert.ok($$(card, ".st-row:not(.head)").length > 10);
  assert.ok($(card, "hockey-stats-view .filter-bar .team-pick"));
  assert.ok($(card, "select[aria-label='Position']"));

  await tap(card, ".team-pick");
  assert.equal(text($(card, ".picker-title")), "Visa spelare från");
  const row = [...$(card, "dialog.picker").querySelectorAll(".picker-row")].find((r) => text(r).includes(CLUBS[3].name));
  row.click();
  await settle(card);
  await tap(card, ".picker-done");
  const rows = $$(card, ".st-row:not(.head)");
  assert.equal(rows.length, 6, "one club's six skaters");
  assert.ok(rows.every((r) => text(r).includes(CLUBS[3].code)));

  await choose(card, "select[aria-label='Position']", "f");
  const forwards = $$(card, ".st-row:not(.head)");
  assert.equal(forwards.length, 4);
  assert.equal(text($(card, "select[aria-label='Position']").closest("label").querySelector("span")), "Forwards");
  // Places stay the league's however the list is narrowed.
  assert.ok(forwards.some((r) => Number(text(r.querySelector(".st-rank"))) > 6));
  unmount(card);
});

test("a narrowed list that leaves nobody says so", async () => {
  const card = await stats();
  await tap(card, "hockey-stats-view .st-sections button", "Målvakter");
  card.ctl.setStatsFilter("goalies", { teams: ["nobody"] });
  await settle(card);
  assert.equal(text($(card, "hockey-stats-view .recap-note")), "Ingen i urvalet.");
  unmount(card);
});

test("choosing the last five games asks the service for them", async () => {
  const hass = hassWith();
  const card = await stats(hass);
  await choose(card, "select[aria-label='Vilka matcher statistiken gäller']", "last5");
  assert.deepEqual(callsTo(hass, "get_statistics").at(-1).data, { config_entry_id: "entry-1", last: 5 });
  assert.equal(text($(card, "hockey-stats-view .filter-select span")), "Senaste 5");
  unmount(card);
});

test("a heading sorts the table, and again turns it round", async () => {
  const card = await stats();
  await tap(card, "hockey-stats-view .st-sections button", "Spelare");
  const head = () => $$(card, ".st-row.head .roster-sort");
  const goals = head().find((h) => text(h).startsWith("Mål"));
  goals.click();
  await settle(card);
  const first = () => text($$(card, ".st-row:not(.head)")[0].querySelector(".sorted"));
  const top = Number(first());
  head().find((h) => text(h).startsWith("Mål")).click();
  await settle(card);
  assert.ok(Number(first()) <= top);
  unmount(card);
});

test("a leader card opens the whole list sorted on its figure", async () => {
  const card = await stats();
  const title = $$(card, ".lb-title").find((b) => text(b).startsWith("Assist"));
  title.click();
  await settle(card);
  assert.equal(card.ctl.stats.section, "skaters");
  assert.ok(text($(card, ".st-row.head .roster-sort.active")).startsWith("A"));
  unmount(card);
});

test("while the statistics are read the leaders' shape is shown", async () => {
  const hass = hassWith({ answers: { get_statistics: () => new Promise(() => {}) } });
  const card = await stats(hass);
  const loader = $(card, "hockey-stats-view hockey-loading");
  assert.ok(loader);
  assert.equal(loader.shape, "cards");
  assert.ok(loader.querySelector(".sk-card"));
  unmount(card);
});

test("the clubs' table sorts on their squads too", async () => {
  const hass = hassWith();
  const card = await stats(hass);
  assert.equal(callsTo(hass, "get_squads").length, 1);
  await tap(card, "hockey-stats-view .st-sections button", "Lag");
  const chips = $$(card, "hockey-stats-view .st-groups .filter-chip").map(text);
  assert.ok(["Trupp", "Backar", "Forwards", "Målvakter"].every((c) => chips.includes(c)), chips);
  await tap(card, "hockey-stats-view .st-groups .filter-chip", "Trupp");
  const names = () => $$(card, "hockey-stats-view .st-row:not(.head) .st-name").map(text);
  const head = () => $$(card, "hockey-stats-view .st-row.head .roster-sort").map(text);
  assert.deepEqual(head().map((h) => h.replace(/[▲▼]/, "")), ["Längd", "Vikt", "Ålder", "Sve%", "V%"]);
  // The fixture's first club is the tallest and the youngest.
  assert.match(names()[0], new RegExp(CLUBS[0].name));
  assert.match(text($(card, "hockey-stats-view .st-row:not(.head) .sorted")), /^185,0$/);
  await tap(card, "hockey-stats-view .st-row.head .roster-sort", "Ålder");
  assert.match(names()[0], new RegExp(CLUBS.at(-1).name), "the oldest first");
  await tap(card, "hockey-stats-view .st-row.head .roster-sort", "Ålder");
  assert.match(names()[0], new RegExp(CLUBS[0].name), "and turned round, the youngest");
  unmount(card);
});
