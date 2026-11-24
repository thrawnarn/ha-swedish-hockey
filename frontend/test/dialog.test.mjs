import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, CARD_CONFIG, callsTo, deferred, hassWith, mount, settle, tap, text, unmount } from "./harness.mjs";
import { GAMES, liveSensor, NEXT_INDEX, sensors, TABLE } from "./fixture.mjs";

const dialogOf = (card) => $(card, "dialog:not(.picker)");

test("the table button opens the dialog on the league table", async () => {
  const card = await mount();
  await tap(card, ".footer-bar .bar-button", "Tabell");
  assert.ok(dialogOf(card).open);
  const rows = $$(card, "hockey-table-view .table-row:not(.head)");
  assert.equal(rows.length, TABLE.length);
  assert.ok(rows[0].classList.contains("self"));
  assert.ok($(card, ".table-row.cut"), "the cuts are drawn");
  unmount(card);
});

test("closing the dialog forgets where it was, and it opens again", async () => {
  const card = await mount();
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  assert.equal(card.ctl.tableView, "schedule");
  await tap(card, ".dialog-close");
  assert.equal(card.ctl.panel, null);
  assert.equal(card.ctl.tableView, "table");
  assert.equal(dialogOf(card), null, "the dialog is gone with the panel");
  await tap(card, ".footer-bar .bar-button", "Tabell");
  assert.ok(dialogOf(card).open);
  assert.ok($(card, "hockey-table-view"));
  unmount(card);
});

test("the tabs move between the league's views, each read when first opened", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  assert.deepEqual($$(card, ".dialog-nav .bar-button").map(text), ["Matcher", "Tabell", "Spelschema", "Statistik"]);
  assert.equal($(card, ".dialog-nav .bar-button.active").textContent.trim(), "Tabell");

  await tap(card, ".dialog-nav .bar-button", "Matcher");
  assert.ok($(card, "hockey-today-view .day-bar"));
  assert.equal(callsTo(hass, "get_live").length, 1);

  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  assert.ok($(card, "hockey-schedule-view .fixture-row"));
  assert.deepEqual(callsTo(hass, "get_schedule")[0].data, {
    config_entry_id: "entry-1", limit: 500, before: 100, highlights: true,
  });
  assert.equal(callsTo(hass, "get_schedule")[0].returnResponse, true);

  await tap(card, ".dialog-nav .bar-button", "Statistik");
  assert.ok($(card, "hockey-stats-view .lb-card"));
  assert.equal(callsTo(hass, "get_statistics").length, 1);

  // Back to the schedule: it is kept, not read again.
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  assert.equal(callsTo(hass, "get_schedule").length, 1);
  unmount(card);
});

test("today's games step a day either way", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Matcher");
  assert.match(text($(card, ".day-title")), /I dag/);
  await tap(card, ".day-step[aria-label='Nästa dag']");
  assert.match(text($(card, ".day-title")), /I morgon/);
  assert.equal(callsTo(hass, "get_live").at(-1).data.date, "2026-10-06");
  unmount(card);
});

test("while a read is out the view shows its loader, then the answer", async () => {
  const reply = deferred();
  const hass = hassWith({ answers: { get_schedule: () => reply.promise } });
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  const loader = $(card, "hockey-schedule-view hockey-loading");
  assert.ok(loader, "a loader while the schedule is read");
  assert.equal(text(loader.querySelector(".loading-label")), "Hämtar spelschema…");
  assert.ok(loader.querySelectorAll(".sk-fixture").length > 0, "the shape of fixtures");
  assert.equal(loader.querySelector(".loading").getAttribute("role"), "status");
  reply.resolve({ games: [], next_index: null });
  await settle(card);
  assert.equal($(card, "hockey-loading"), null);
  assert.equal(text($(card, "hockey-schedule-view .recap-note")), "Inga matcher i schemat.");
  unmount(card);
});

test("a reply to a view that has been left is not shown", async () => {
  const slow = deferred();
  let first = true;
  const hass = hassWith({
    answers: {
      get_schedule: (data) => {
        if (data.team && first) {
          first = false;
          return slow.promise;
        }
        return { games: [], next_index: null };
      },
    },
  });
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, "hockey-table-view .table-row:not(.head)", TABLE[2].team);
  assert.equal(card.ctl.team.row.team_code, TABLE[2].team_code);
  // Away to another club before the first one's games arrive.
  await tap(card, ".recap-back");
  await tap(card, "hockey-table-view .table-row:not(.head)", TABLE[3].team);
  slow.resolve({ games: [{ start: "2026-10-09T17:00:00Z", home_code: "X", away_code: "Y", home_team: "Wrong", away_team: "Club" }] });
  await settle(card);
  assert.equal(card.ctl.team.row.team_code, TABLE[3].team_code);
  assert.ok(!text($(card, "hockey-team-view")).includes("Wrong"));
  unmount(card);
});

test("the table can be read over the last few games", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  const chip = $(card, "hockey-table-view .filter-bar .filter-select");
  assert.equal(text(chip.querySelector("span")), "Säsong");
  assert.ok(!chip.classList.contains("active"));
  const select = chip.querySelector("select");
  select.value = "5";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await settle(card);
  assert.deepEqual(callsTo(hass, "get_form_table")[0].data, { config_entry_id: "entry-1", last: 5, team: "NOR" });
  assert.ok($(card, "hockey-table-view .filter-select.active"));
  assert.equal(text($(card, "hockey-table-view .filter-select span")), "Senaste 5");
  assert.equal(text($(card, "hockey-table-view .table-row:not(.head) .table-name")), TABLE.at(-1).team);
  unmount(card);
});

test("while games are played the live table shows, and can be switched off", async () => {
  const liveTable = TABLE.map((r, i) => ({ ...r, rank_change: i === 1 ? 1 : 0, live: i < 2 }));
  const card = await mount(CARD_CONFIG, hassWith({ states: sensors({ liveTable }) }));
  await tap(card, ".footer-bar .bar-button", "Tabell");
  assert.ok($(card, ".move.up"), "a club moving up is marked");
  const chip = $(card, ".live-chip");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  await tap(card, ".live-chip");
  assert.equal($(card, ".live-chip").getAttribute("aria-pressed"), "false");
  assert.equal($(card, ".move.up"), null);
  unmount(card);
});

test("the game being played has a tab of its own, with its log", async () => {
  const card = await mount(CARD_CONFIG, hassWith({ states: sensors({ live: liveSensor() }) }));
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Match");
  assert.ok($(card, "hockey-game-view .scoreboard.playing-now"));
  assert.equal($$(card, "hockey-game-view .log-row").length, 4);
  assert.ok($(card, "hockey-game-view .log-row.goal"), "our goals stand out");
  await tap(card, ".dialog-close");
  await tap(card, ".footer-bar .bar-button", "Händelser");
  assert.equal(text($(card, "hockey-events-view .view-heading")), "Händelser");
  assert.equal($$(card, "hockey-events-view .log-row").length, 4);
  unmount(card);
});

test("earlier results come from the sensor at once, then the service's ten", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tidigare");
  assert.equal(text($(card, "hockey-results-view .view-heading")), "Tidigare matcher");
  assert.deepEqual(callsTo(hass, "get_results")[0].data, {
    config_entry_id: "entry-1", team: "NOR", limit: 10, highlights: true,
  });
  assert.ok($$(card, "hockey-results-view .fixture-row").length > 0);
  unmount(card);
});

test("a finished game in the day's list says so, and one being played or to come does not", async () => {
  const [a, b, c] = GAMES.slice(NEXT_INDEX, NEXT_INDEX + 3);
  const games = [
    { ...a, home_score: 3, away_score: 1, state: "post-game", in_progress: false },
    { ...b, home_score: 1, away_score: 0, state: "ongoing", in_progress: true, period: 2 },
    c,
  ];
  const hass = hassWith({ answers: { get_live: () => ({ games }) } });
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Matcher");
  const rows = $$(card, "hockey-today-view .fixture-row");
  assert.equal(rows.length, 3);
  assert.ok(rows[0].classList.contains("ended"));
  assert.equal(text(rows[0].querySelector(".fixture-final")), "Slut");
  assert.ok(rows[0].querySelector(".fixture-clock"), "the start time stays, under the word");
  for (const row of rows.slice(1)) {
    assert.ok(!row.classList.contains("ended"));
    assert.equal(row.querySelector(".fixture-final"), null);
  }
  assert.ok(rows[1].querySelector(".fixture-live"));
  unmount(card);
});

test("the game being played and a played one compare the two squads too", async () => {
  const hass = hassWith({ states: sensors({ live: liveSensor() }) });
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Match");
  assert.equal(callsTo(hass, "get_squads").length, 1);
  const labels = (view) => $$(card, `${view} .stat-label`).map(text);
  assert.ok(labels("hockey-game-view").includes("Snittlängd"), labels("hockey-game-view"));
  assert.ok($$(card, "hockey-game-view .team-section").map(text).includes("Trupperna"));
  unmount(card);
});
