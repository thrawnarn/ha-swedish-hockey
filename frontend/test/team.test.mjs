import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, callsTo, deferred, hassWith, mount, settle, tap, text, unmount } from "./harness.mjs";
import { CLUBS, OURS, TABLE, recap } from "./fixture.mjs";

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

test("a player's page names his earlier clubs and lists his career by season", async () => {
  const hass = hassWith();
  const card = await teamPage(hass);
  await tap(card, ".team-tabs button", "Spelschema");
  await tap(card, "hockey-team-view .fixture-row.tappable");
  await tap(card, "hockey-recap-view .player-link", "Ada Berg");
  // His present club is not an earlier one, and a club comes up once however
  // many competitions he played for it in.
  assert.deepEqual($$(card, ".player-club").map(text), [CLUBS[1].name]);
  const rows = $$(card, ".career-row:not(.head)");
  assert.equal(rows.length, 4);
  assert.equal(text(rows[0].querySelector(".career-season")), "26/27");
  assert.equal(text(rows[3].querySelector(".career-season")), "", "a season is written once");
  assert.match(text(rows[2]), /SHL/);
  assert.equal(text(rows[1].querySelector(".career-points")), "45");
  unmount(card);
});

test("a game's summary shows without waiting for the game sheet and the clip", async () => {
  // The full answer is held back, the way the federation's site holds a game
  // nobody has opened lately for a few seconds.
  const full = deferred();
  const { period_scores, ...quick } = recap();
  const hass = hassWith({
    answers: {
      get_recap: (data) =>
        data.details === false
          ? quick
          : full.promise,
    },
  });
  const card = await teamPage(hass);
  await tap(card, ".team-tabs button", "Spelschema");
  await tap(card, "hockey-team-view .fixture-row.tappable");
  const asked = callsTo(hass, "get_recap");
  assert.equal(asked.length, 2, "the quick and the full summary are asked for together");
  assert.equal(asked[0].data.game_id, asked[1].data.game_id);
  assert.ok($(card, "hockey-recap-view .scoreboard.over"), "the quick one is drawn already");
  assert.ok($(card, "hockey-recap-view .player-link"));
  assert.equal($(card, ".recap-highlight"), null);

  full.resolve({
    ...recap(),
    highlight: { url: "https://example.invalid/clip", heading: "Norrby vs. Söderby", subheading: "Omgång 1" },
  });
  await settle(card);
  assert.ok($(card, ".recap-highlight"), "the clip joins when the full one arrives");
  unmount(card);
});

test("a full summary that fails leaves the quick one on show", async () => {
  const hass = hassWith({
    answers: {
      get_recap: (data) => {
        if (data.details === false) return recap();
        throw new Error("stats.swehockey.se is down");
      },
    },
  });
  const card = await teamPage(hass);
  await tap(card, ".team-tabs button", "Spelschema");
  await tap(card, "hockey-team-view .fixture-row.tappable");
  assert.ok($(card, "hockey-recap-view .scoreboard.over"));
  assert.equal($(card, "hockey-recap-view .recap-note"), null);
  unmount(card);
});
