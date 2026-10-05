import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, callsTo, hassWith, mount, tap, text, unmount } from "./harness.mjs";
import { OURS, TABLE } from "./fixture.mjs";

async function teamPage(hass = hassWith()) {
  const card = await mount(undefined, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, "hockey-table-view .table-row:not(.head)", OURS.name);
  return card;
}

test("a table row opens the club's page", async () => {
  const hass = hassWith();
  const card = await teamPage(hass);
  assert.equal(text($(card, ".hero-title")), OURS.name);
  assert.match(text($(card, ".hero-kicker")), /1:a i tabellen/);
  assert.equal(text($(card, ".hero-big-value")), String(TABLE[0].points));
  assert.ok($$(card, "hockey-team-view .fixture-row").length > 0);
  assert.deepEqual(callsTo(hass, "get_schedule")[0].data, { config_entry_id: "entry-1", team: "NOR", limit: 3 });
  await tap(card, ".recap-back");
  assert.equal(card.ctl.team, null);
  assert.ok($(card, "hockey-table-view"));
  unmount(card);
});

test("the squad sorts by points, and can be split by position", async () => {
  const hass = hassWith();
  const card = await teamPage(hass);
  await tap(card, ".team-tabs button", "Trupp");
  assert.equal(callsTo(hass, "get_roster").length, 1);
  const names = () => $$(card, ".roster-row:not(.head) .player-link").map(text);
  assert.equal(names().at(-1), "Gun Hed", "the goalkeeper keeps to the foot of one list");
  await tap(card, ".roster-row.head .roster-sort", "Spelare");
  assert.equal(names()[0], "Ada Berg");
  await tap(card, "hockey-team-view .switch button", "Per position");
  assert.deepEqual($$(card, "hockey-team-view .team-section").map(text), ["Målvakter", "Backar", "Forwards"]);
  unmount(card);
});

test("the club's statistics stand against the league", async () => {
  const card = await teamPage();
  await tap(card, ".team-tabs button", "Statistik");
  assert.ok($$(card, ".ts-row").length >= 5);
  assert.ok($(card, ".ts-leaders .ts-board"));
  unmount(card);
});

test("a played game opens its summary, and a scorer his page", async () => {
  const hass = hassWith();
  const card = await teamPage(hass);
  await tap(card, ".team-tabs button", "Spelschema");
  await tap(card, "hockey-team-view .fixture-row.tappable");
  assert.ok(callsTo(hass, "get_recap")[0].data.game_id);
  assert.ok($(card, "hockey-recap-view .scoreboard.over"));
  // A crowd is written in groups of three, with a space that does not break.
  assert.match($(card, ".recap-meta").textContent, /4\u00a0321 åskådare/);
  assert.equal($$(card, "hockey-recap-view .stat").length, 2, "the key figures first");
  await tap(card, ".stats-more");
  assert.equal($$(card, "hockey-recap-view .stat").length, 3);
  assert.match(text($(card, ".recap-back")), new RegExp(OURS.name));

  await tap(card, "hockey-recap-view .player-link", "Ada Berg");
  assert.equal(callsTo(hass, "get_player")[0].data.player, "Ada Berg");
  assert.equal(text($(card, ".hero-title")), "Ada Berg");
  assert.match(text($(card, ".player-facts")), /24 år · 180 cm · 82 kg · vänsterfattad · SWE/);
  assert.equal(text($(card, "hockey-player-view .recap-back")), "Sammanfattning");
  await tap(card, "hockey-player-view .recap-back");
  assert.ok($(card, "hockey-recap-view"));
  unmount(card);
});
