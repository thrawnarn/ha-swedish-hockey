import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, hassWith, mount, settle, tap, text, unmount } from "./harness.mjs";
import { CLUBS, GAMES, NEXT_INDEX, OURS } from "./fixture.mjs";

async function schedule() {
  const card = await mount(undefined, hassWith());
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  return card;
}

test("the schedule lists the season by day, our games marked, the next game flagged", async () => {
  const card = await schedule();
  assert.equal($$(card, "hockey-schedule-view .fixture-row").length, GAMES.length);
  assert.ok($$(card, "hockey-schedule-view .team-section").length > 10);
  const next = $(card, ".fixture-row.next");
  assert.ok(next);
  assert.match(text(next), new RegExp(GAMES[NEXT_INDEX].home_team));
  assert.ok($(card, ".fixture-row.self"));
  // Played games open their summary, games to come their preview.
  assert.equal($$(card, ".fixture-row.tappable").length, GAMES.length);
  assert.equal($$(card, ".fixture-row.tappable[title='Inför matchen']").length, GAMES.length - NEXT_INDEX);
  // The scroll to the next game has been made and is not asked for again.
  assert.equal(card.ctl.schedule.scrollToNext, false);
  unmount(card);
});

test("one button chooses the clubs; with none chosen it says all", async () => {
  const card = await schedule();
  const bar = $(card, "hockey-schedule-view .filter-bar");
  assert.ok(bar);
  assert.equal(bar.querySelectorAll(".filter-chip").length, 1, "one button, not a row of fourteen");
  assert.equal(text($(card, ".team-pick")), "Alla lag");
  assert.equal($(card, ".team-pick").getAttribute("aria-haspopup"), "dialog");
  unmount(card);
});

test("the club list opens over the dialog, and a tick narrows the schedule at once", async () => {
  const card = await schedule();
  await tap(card, ".team-pick");
  const picker = $(card, "dialog.picker");
  assert.ok(picker?.open, "the list is open");
  assert.equal(text(picker.querySelector(".picker-title")), "Visa matcher för");
  const rows = [...picker.querySelectorAll(".picker-row")];
  assert.equal(rows.length, CLUBS.length);
  assert.ok(rows[0].hasAttribute("autofocus"), "the first club takes the focus");
  assert.match(text(rows.find((r) => text(r).includes(OURS.name))), /Ditt lag/);

  const pick = (name) => [...$(card, "dialog.picker").querySelectorAll(".picker-row")].find((r) => text(r).includes(name));
  pick(CLUBS[1].name).click();
  pick(CLUBS[2].name).click();
  await settle(card);
  assert.deepEqual(card.ctl.schedule.teams, [CLUBS[1].code.toLowerCase(), CLUBS[2].code.toLowerCase()].map((k) => k.normalize()));
  assert.equal(pick(CLUBS[1].name).getAttribute("aria-checked"), "true");
  assert.equal(text($(card, ".picker-count")), `2 av ${CLUBS.length} lag valda`);

  const shown = $$(card, "hockey-schedule-view .fixture-row");
  const involved = GAMES.filter((g) => [CLUBS[1].code, CLUBS[2].code].includes(g.home_code) || [CLUBS[1].code, CLUBS[2].code].includes(g.away_code));
  assert.equal(shown.length, involved.length);
  assert.equal(text($(card, ".team-pick-label")), `${CLUBS[1].name}, ${CLUBS[2].name}`);
  assert.equal($$(card, ".team-pick .crest-stack img").length, 2);

  // A third club: the button counts them.
  pick(CLUBS[3].name).click();
  await settle(card);
  assert.equal(text($(card, ".team-pick-label")), "3 lag");

  // Klar closes the list and leaves the choice.
  await tap(card, ".picker-done");
  assert.equal($(card, "dialog.picker"), null);
  assert.ok($(card, "dialog:not(.picker)").open, "the dialog behind stays open");
  assert.equal(card.ctl.schedule.teams.length, 3);
  unmount(card);
});

test("Rensa clears the choice, and is off with nothing chosen", async () => {
  const card = await schedule();
  card.ctl.filterSchedule([CLUBS[4].code.toLowerCase()]);
  await settle(card);
  await tap(card, ".team-pick");
  assert.equal($(card, ".picker-clear").disabled, false);
  await tap(card, ".picker-clear");
  assert.deepEqual(card.ctl.schedule.teams, []);
  assert.equal($(card, ".picker-clear").disabled, true);
  assert.equal($$(card, "hockey-schedule-view .fixture-row").length, GAMES.length);
  unmount(card);
});

test("two ticks before the list redraws both count", async () => {
  const card = await schedule();
  await tap(card, ".team-pick");
  const rows = [...$(card, "dialog.picker").querySelectorAll(".picker-row")];
  rows[5].click();
  rows[6].click();
  await settle(card);
  assert.equal(card.ctl.schedule.teams.length, 2);
  unmount(card);
});

test("closing the club list does not close the dialog behind it", async () => {
  const card = await schedule();
  await tap(card, ".team-pick");
  $(card, "dialog.picker").close();
  await settle(card);
  assert.equal(card.ctl.picker, null);
  assert.equal(card.ctl.panel, "table");
  assert.ok($(card, "dialog:not(.picker)").open);
  unmount(card);
});

test("a choice that leaves no games says so, and the button stays to undo it", async () => {
  const card = await schedule();
  card.ctl.filterSchedule(["nobody"]);
  await settle(card);
  assert.equal(text($(card, "hockey-schedule-view .recap-note")), "Inga matcher för de valda lagen.");
  assert.ok($(card, ".team-pick"));
  unmount(card);
});
