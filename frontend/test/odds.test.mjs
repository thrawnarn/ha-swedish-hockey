import { test } from "node:test";
import assert from "node:assert/strict";
import { $, $$, CARD_CONFIG, hassWith, I, mount, tap, text, unmount } from "./harness.mjs";
import { GAMES, NEXT_INDEX, ourGames } from "./fixture.mjs";

test("odds are written the Swedish way, and what they imply adds up to a hundred", () => {
  assert.equal(I.formatOdds(1.38), "1,38");
  assert.equal(I.formatOdds(6.75), "6,75");
  assert.equal(I.formatOdds(null), "–");
  const chances = I.impliedChances([1.38, 5.8, 6.75]);
  assert.deepEqual(chances, [69, 16, 14]);
  assert.ok(Math.abs(chances.reduce((a, b) => a + b, 0) - 100) <= 1);
});

test("a game still to come shows its odds in the schedule; a played one does not", async () => {
  const card = await mount(CARD_CONFIG, hassWith());
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  const withOdds = $$(card, "hockey-schedule-view .fixture-row .odds");
  assert.equal(withOdds.length, 3, "the two league games and ours");
  const league = withOdds.find((odds) => text(odds) === "1 1,38 X 5,80 2 6,75");
  assert.ok(league, withOdds.map(text).join(" | "));
  assert.match(league.getAttribute("title"), /Svenska Spel, ordinarie tid/);
  const played = $$(card, "hockey-schedule-view .fixture-row").slice(0, NEXT_INDEX);
  assert.ok(played.every((row) => !row.querySelector(".odds")));
  unmount(card);
});

test("the card's next game carries its odds on the face", async () => {
  const card = await mount();
  assert.equal(text($(card, ".face-odds")), "1 2,10 X 4,20 2 2,90");
  unmount(card);
});

test("the preview sets out each outcome with its odds and its chance", async () => {
  const card = await mount();
  card.ctl.openPreview(GAMES.find((g) => g.odds?.home === 1.38));
  const { settle } = await import("./harness.mjs");
  await settle(card);
  const tiles = $$(card, ".pv-odds-tile");
  assert.equal(tiles.length, 3);
  assert.equal(text(tiles[0].querySelector(".pv-odds-price")), "1,38");
  assert.equal(text(tiles[1].querySelector(".pv-odds-label")), "X Oavgjort");
  assert.equal(text(tiles[0].querySelector(".pv-odds-chance")), "69 %");
  assert.ok(tiles[0].classList.contains("favourite"), "the favourite stands out");
  assert.match(text($(card, "hockey-preview-view")), /Odds från Svenska Spel, ordinarie tid/);
  unmount(card);
});

test("with odds switched off, none are shown anywhere", async () => {
  const card = await mount({ ...CARD_CONFIG, show_odds: false });
  assert.equal($(card, ".face-odds"), null);
  await tap(card, ".footer-bar .bar-button", "Tabell");
  await tap(card, ".dialog-nav .bar-button", "Spelschema");
  assert.equal($(card, ".odds"), null);
  card.ctl.openPreview(GAMES.find((g) => g.odds?.home === 1.38));
  const { settle } = await import("./harness.mjs");
  await settle(card);
  assert.ok($(card, "hockey-preview-view"));
  assert.equal($(card, ".pv-odds"), null);
  unmount(card);
});

test("the editor offers odds as an option", async () => {
  const element = document.createElement("hockey-match-card-editor");
  element.hass = hassWith();
  element.setConfig({ team: "Norrby" });
  document.body.appendChild(element);
  const { settle } = await import("./harness.mjs");
  await settle(element);
  const form = element.shadowRoot.querySelector("ha-form");
  const names = form.schema.flatMap((s) => (s.schema ? s.schema.map((f) => f.name) : [s.name]));
  assert.ok(names.includes("show_odds"));
  assert.equal(form.computeLabel({ name: "show_odds" }), "Odds (Svenska Spel)");
  element.remove();
});

test("a next game the bookmaker has not opened has no odds line", async () => {
  const next = ourGames().find((g) => g.home_score === null);
  const saved = next.odds;
  delete next.odds;
  try {
    const card = await mount();
    assert.equal($(card, ".face-odds"), null);
    unmount(card);
  } finally {
    next.odds = saved;
  }
});
