import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, callsTo, CARD_CONFIG, deferred, hassWith, mount, settle, tap, text, unmount } from "./harness.mjs";
import { GAMES, NEXT_INDEX, OURS, ourGames, TABLE } from "./fixture.mjs";

const next = () => ourGames().find((g) => g.home_score === null);

async function fromSchedule(hass = hassWith()) {
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  return card;
}

test("a game still to come opens its preview from the schedule", async () => {
  const hass = hassWith();
  const card = await fromSchedule(hass);
  const game = GAMES[NEXT_INDEX];
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  assert.ok($(card, "hockey-preview-view"));
  assert.deepEqual(callsTo(hass, "get_matchup")[0].data, { config_entry_id: "entry-1", game_id: game.game_id });
  assert.deepEqual(callsTo(hass, "get_head_to_head")[0].data, {
    config_entry_id: "entry-1",
    team: game.home_code,
    opponent: game.away_code,
    seasons: 5,
  });
  assert.equal(text($(card, "hockey-preview-view .recap-back")), "Spelschema");
  unmount(card);
});

test("the preview's head has the time where a score would be", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const head = $(card, "hockey-preview-view .scoreboard.upcoming");
  assert.ok(head);
  assert.match(text(head.querySelector(".sb-score")), /^\d\d:\d\d$/);
  assert.deepEqual([...head.querySelectorAll(".sb-name")].map(text), [GAMES[NEXT_INDEX].home_team, GAMES[NEXT_INDEX].away_team]);
  assert.match(text($(card, "hockey-preview-view .recap-meta")), /omgång/);
  unmount(card);
});

test("the table, club against club, lights the better figure", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const rows = $$(card, ".pv-vs-row");
  assert.equal(text(rows[0].querySelector(".pv-vs-label")), "Placering");
  const game = GAMES[NEXT_INDEX];
  const rank = (code) => TABLE.find((r) => r.team_code === code).rank;
  const better = rank(game.home_code) < rank(game.away_code) ? ".home" : ".away";
  assert.ok(rows[0].querySelector(`.pv-vs-value${better}.lead`), "the higher place is lit");
  unmount(card);
});

test("each club's form, its run, the game's venue form and its rest", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const [home, away] = $$(card, ".pv-team");
  assert.ok(home && away);
  assert.equal(home.querySelector(".pv-fact").querySelectorAll(".form-pip").length, 2);
  assert.match(text(home), /Hemma/);
  assert.match(text(away), /Borta/);
  assert.match(text(home), /3 raka vinster/);
  assert.match(text(home), /Säsongen \(V–ÖV–ÖF–F\) 5–1–1–1/);
  assert.match(text(home), /Förra matchen V 4–3 mot Någon IF/);
  // A club on the second night of a back-to-back is marked.
  assert.ok(away.querySelector(".pv-fact-value.warn"));
  unmount(card);
});

test("earlier seasons wait behind a button that says how many meetings there are", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const view = $(card, "hockey-preview-view");
  // Hidden at first: no rows from the archive, and nothing counted from it.
  assert.equal(view.querySelectorAll(".fixture-row:not(.tappable)").length, 0);
  assert.ok(!$$(card, "hockey-preview-view .pv-subhead").map(text).some((h) => h.startsWith("2025/26")));
  const toggle = $(card, ".pv-history-toggle");
  assert.equal(text(toggle), "Visa tidigare säsonger (9 möten)");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  const before = text($(card, ".pv-h2h .stat-label") ?? { textContent: "" });
  assert.ok(!before.includes("9"), "the count above takes in only this season");
  unmount(card);
});

test("opened, the earlier seasons are grouped by season, counted in, and close again", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  await tap(card, ".pv-history-toggle");
  const view = $(card, "hockey-preview-view");
  assert.equal(text($(card, ".pv-history-toggle")), "Dölj tidigare säsonger");
  assert.equal($(card, ".pv-history-toggle").getAttribute("aria-expanded"), "true");
  const heads = $$(card, "hockey-preview-view .pv-subhead").map(text);
  assert.ok(heads.includes("2025/26 · SM-slutspel SHL"), heads.join("|"));
  assert.ok(heads.includes("2025/26 · SHL"));
  // Six shown, the rest behind a button.
  assert.equal(view.querySelectorAll(".fixture-row:not(.tappable)").length, 6);
  await tap(card, "hockey-preview-view .stats-more:not(.pv-history-toggle)");
  assert.equal(view.querySelectorAll(".fixture-row:not(.tappable)").length, 9);
  assert.ok(text($(card, ".pv-h2h .stat-label")).includes("senaste mötena"));
  assert.match(text(view), /avgjordes i förlängning eller straffar/);
  assert.match(text(view), /SHL och Hockeyallsvenskan sedan 2024\/25/);
  await tap(card, ".pv-history-toggle");
  assert.equal(view.querySelectorAll(".fixture-row:not(.tappable)").length, 0, "closed again");
  unmount(card);
});

test("the archive is slower: the rest of the preview does not wait for it", async () => {
  const slow = deferred();
  const card = await fromSchedule(hassWith({ answers: { get_head_to_head: () => slow.promise } }));
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  assert.ok($(card, ".pv-vs"), "the table is drawn");
  assert.equal($(card, "hockey-preview-view hockey-loading"), null, "nothing loads where nothing is shown");
  assert.equal(text($(card, ".pv-history-toggle")), "Visa tidigare säsonger");
  await tap(card, ".pv-history-toggle");
  const loader = $(card, "hockey-preview-view hockey-loading");
  assert.equal(text(loader.querySelector(".loading-label")), "Hämtar tidigare möten…");
  slow.resolve({ meetings: [], seasons: ["2025-26 SHL"] });
  await settle(card);
  assert.equal($(card, "hockey-preview-view hockey-loading"), null);
  // Nothing to open: the button gives way to a line saying so.
  assert.equal($(card, ".pv-history-toggle"), null);
  assert.match(text($(card, "hockey-preview-view")), /Inga möten i SHL sedan 2025\/26/);
  unmount(card);
});

test("an archive that cannot be read says so when opened, and the rest stands", async () => {
  const card = await fromSchedule(
    hassWith({ answers: { get_head_to_head: () => Promise.reject(new Error("borta")) } }),
  );
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  assert.ok($(card, ".pv-teams"));
  assert.doesNotMatch(text($(card, "hockey-preview-view")), /gick inte att läsa/);
  await tap(card, ".pv-history-toggle");
  assert.match(text($(card, "hockey-preview-view")), /Tidigare säsonger gick inte att läsa: borta/);
  unmount(card);
});

test("the seasons compare figure by figure, each with its place in the league", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const labels = $$(card, "hockey-preview-view .stats .stat-label").map(text);
  assert.ok(labels.includes("Powerplay"), labels.join("|"));
  assert.ok(labels.includes("Insläppta mål per match"));
  const detail = $$(card, "hockey-preview-view .stats .stat-detail").map(text);
  assert.ok(detail.some((d) => /i ligan$/.test(d)));
  // Fewer goals against is the better figure: the side with fewer is lit.
  const against = $$(card, "hockey-preview-view .stats .stat").find((s) => text(s.querySelector(".stat-label")) === "Insläppta mål per match");
  const [a, b] = [...against.querySelectorAll(".stat-value")].map((v) => Number(text(v).replace(",", ".")));
  assert.ok(against.querySelector(`.stat-value.lead`), "one side is lit");
  assert.equal(text(against.querySelector(".stat-value.lead")).replace(",", "."), String(Math.min(a, b).toFixed(2)));
  unmount(card);
});

test("who to watch: each club's top scorers and its goalkeeper", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  const boards = $$(card, "hockey-preview-view .ts-board");
  assert.equal(boards.length, 2);
  assert.equal(boards[0].querySelectorAll(".ts-board-row").length, 4, "three skaters and a goalkeeper");
  assert.match(text(boards[0]), /\d+\+\d+=\d+/);
  unmount(card);
});

test("a played meeting opens its summary, and back comes back to the preview", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  // Open the preview of a game whose clubs have met already this season.
  const game = GAMES.find((g, i) => i >= NEXT_INDEX && GAMES.slice(0, NEXT_INDEX).some((p) =>
    [p.home_code, p.away_code].includes(g.home_code) && [p.home_code, p.away_code].includes(g.away_code)));
  card.ctl.openPreview(game);
  await settle(card);
  await tap(card, "hockey-preview-view .fixture-row.tappable:not([title])");
  assert.ok($(card, "hockey-recap-view"));
  assert.equal(text($(card, "hockey-recap-view .recap-back")), "Inför matchen");
  await tap(card, "hockey-recap-view .recap-back");
  assert.ok($(card, "hockey-preview-view .pv-teams"), "the preview is whole again");
  unmount(card);
});

test("a club opened from the preview goes over it; back comes back", async () => {
  const card = await fromSchedule();
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  await tap(card, "hockey-preview-view .sb-team.tappable");
  assert.ok($(card, "hockey-team-view"));
  await tap(card, "hockey-team-view .recap-back");
  assert.ok($(card, "hockey-preview-view .pv-vs"), "back to a preview that is still whole");
  await tap(card, "hockey-preview-view .recap-back");
  assert.ok($(card, "hockey-schedule-view"));
  unmount(card);
});

test("a preview opened from a club's page goes over it, and back goes to the club", async () => {
  const card = await mount();
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, "hockey-table-view .table-row:not(.head)", OURS.name);
  await tap(card, "hockey-team-view .fixture-row.tappable[title='Inför matchen']");
  assert.ok($(card, "hockey-preview-view"));
  assert.equal(text($(card, "hockey-preview-view .recap-back")), OURS.name);
  await tap(card, "hockey-preview-view .recap-back");
  assert.ok($(card, "hockey-team-view"));
  unmount(card);
});

test("between games the face opens the next game's preview, from its middle or the footer", async () => {
  const hass = hassWith();
  const card = await mount(CARD_CONFIG, hass);
  await tap(card, ".middle.tappable");
  assert.ok($(card, "dialog:not(.picker)").open);
  assert.ok($(card, "hockey-preview-view"));
  assert.equal(callsTo(hass, "get_matchup")[0].data.game_id, next().game_id);
  await tap(card, ".dialog-close");
  await tap(card, ".footer-bar .bar-button", "Matchinfo");
  assert.ok($(card, "hockey-preview-view"));
  unmount(card);
});

test("the badge's chip opens the game it shows", async () => {
  const hass = hassWith();
  const card = await mount({ type: "custom:hockey-match-badge", team: OURS.code }, hass, "hockey-match-badge");
  await tap(card, ".chip");
  assert.ok($(card, "hockey-preview-view"));
  assert.equal(callsTo(hass, "get_matchup")[0].data.game_id, next().game_id);
  // The table is one tap back.
  await tap(card, "hockey-preview-view .recap-back");
  assert.ok($(card, "hockey-table-view"));
  unmount(card);
});

test("a late answer for a preview that was left is not shown", async () => {
  const slow = deferred();
  const hass = hassWith({ answers: { get_matchup: () => slow.promise } });
  const card = await fromSchedule(hass);
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  await tap(card, "hockey-preview-view .recap-back");
  slow.resolve({ game: GAMES[NEXT_INDEX], home: {}, away: {}, meetings: [] });
  await settle(card);
  assert.equal(card.ctl.preview, null);
  assert.ok($(card, "hockey-schedule-view"));
  unmount(card);
});

test("the two squads stand side by side, neither lit", async () => {
  const hass = hassWith();
  const card = await fromSchedule(hass);
  await tap(card, ".fixture-row.tappable[title='Inför matchen']");
  assert.equal(callsTo(hass, "get_squads").length, 1);
  const sections = $$(card, "hockey-preview-view .team-section").map(text);
  assert.ok(sections.includes("Trupperna"), sections);
  const block = $$(card, "hockey-preview-view .team-section").find((s) => text(s) === "Trupperna").nextElementSibling;
  const bars = [...block.querySelectorAll(".stat")];
  assert.deepEqual(bars.map((b) => text(b.querySelector(".stat-label"))), [
    "Snittlängd",
    "Snittvikt",
    "Snittålder",
    "Svenska spelare",
  ]);
  assert.match(text(bars[0].querySelector(".stat-value")), /^\d{3},\d cm$/);
  assert.match(text(bars[0].querySelector(".stat-detail")), /:[ae] i ligan$/);
  assert.equal(text(bars[3].querySelector(".stat-value")), "84 %");
  assert.equal(text(bars[3].querySelector(".stat-detail")), "21 av 25");
  assert.equal(block.querySelectorAll(".lead").length, 0, "taller is not better");
  unmount(card);
});
