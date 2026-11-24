import { test } from "node:test";
import assert from "node:assert/strict";
import { I } from "./harness.mjs";

test("figures are written the Swedish way", () => {
  assert.equal(I.formatStat(12.345, "pct", true), "12,3 %");
  assert.equal(I.formatStat(12.345, "pct"), "12,3");
  assert.equal(I.formatStat(2.5, "dec"), "2,50");
  assert.equal(I.formatStat(3, "pm"), "+3");
  assert.equal(I.formatStat(-2, "pm"), "-2");
  assert.equal(I.formatStat(13950.4, "crowd"), "13 950");
  assert.equal(I.formatStat(null), "–");
  assert.equal(I.formatStat("18:41", "time"), "18:41");
});

test("ice time sorts as seconds", () => {
  assert.equal(I.statNumber("18:41"), 18 * 60 + 41);
  assert.equal(I.statNumber("7"), 7);
  assert.equal(I.statNumber(""), null);
  assert.equal(I.statNumber("n/a"), null);
});

test("places are written 1:a, 2:a, 3:e, 11:e, 21:a", () => {
  assert.deepEqual([1, 2, 3, 11, 12, 21, 22, 101].map(I.ordinal), [
    "1:a", "2:a", "3:e", "11:e", "12:e", "21:a", "22:a", "101:a",
  ]);
});

test("equal figures share a place and the next place skips", () => {
  const rows = [
    { player: "A", G: 5 },
    { player: "B", G: 7 },
    { player: "C", G: 5 },
    { player: "D", G: 2 },
  ];
  const { ranked } = I.rankStats(rows, "G", { label: "Mål", short: "Mål" });
  assert.deepEqual(ranked.map((r) => [r.row.player, r.rank]), [
    ["B", 1], ["A", 2], ["C", 2], ["D", 4],
  ]);
});

test("a rate needs enough behind it to be ranked", () => {
  const rows = [
    { player: "A", S_perc: 50, S_perc_ok: false },
    { player: "B", S_perc: 20, S_perc_ok: true },
  ];
  const { ranked, rest } = I.rankStats(rows, "S_perc", I.SKATER_METRICS.S_perc);
  assert.deepEqual(ranked.map((r) => r.row.player), ["B"]);
  assert.deepEqual(rest.map((r) => [r.row.player, r.rank]), [["A", null]]);
});

test("an average per game needs a third of the most games played", () => {
  const rows = [
    { player: "A", GP: 1, TP_GP: 3 },
    { player: "B", GP: 9, TP_GP: 1.2 },
  ];
  const { ranked, rest } = I.rankStats(rows, "TP_GP", I.SKATER_METRICS.TP_GP);
  assert.deepEqual(ranked.map((r) => r.row.player), ["B"]);
  assert.deepEqual(rest.map((r) => r.row.player), ["A"]);
});

test("asking the same list the same question gives the same answer object", () => {
  const rows = [{ player: "A", G: 1 }];
  assert.equal(I.rankStats(rows, "G"), I.rankStats(rows, "G"));
});

test("a club's colour is kept off black and white", () => {
  assert.equal(I.clubColour("#3366cc", "x"), "rgb(51, 102, 204)");
  // Just dark enough to vanish on a dark theme: lifted.
  assert.equal(I.clubColour("#26358C", "x"), "rgb(136, 144, 192)");
  assert.notEqual(I.clubColour("#000000", "x"), "rgb(0, 0, 0)");
  assert.notEqual(I.clubColour("#FFFFFF", "x"), "rgb(255, 255, 255)");
  assert.equal(I.clubColour("red", "fallback"), "fallback");
});

test("periods are named, and a shootout whatever the feed calls it", () => {
  assert.equal(I.periodLabel("2"), "Period 2");
  assert.equal(I.periodLabel("4"), "Förlängning");
  assert.equal(I.periodLabel("5"), "Straffar");
  assert.equal(I.periodLabel("SO"), "Straffar");
  assert.equal(I.periodLabel("PSO"), "Straffar");
  assert.equal(I.periodLabel("OT"), "Förlängning");
});

test("the table's cuts and zones", () => {
  assert.equal(I.isCut(7), true);
  assert.equal(I.isCut(6), false);
  assert.deepEqual([1, 6, 7, 10, 11, 12, 13, 14].map(I.zoneOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("a club is found by its code or any spelling of its name", () => {
  const team = { team: "Leksand", code: "LIF", entities: {} };
  assert.equal(I.teamMatches(team, "LIF"), true);
  assert.equal(I.teamMatches(team, "lif"), true);
  assert.equal(I.teamMatches(team, "Leksands IF"), true);
  assert.equal(I.teamMatches(team, "Mora"), false);
  assert.equal(I.clubKey("Leksands IF"), "leksandsif");
});

test("only this integration's entities make a team", () => {
  const hass = {
    states: {
      "sensor.a_live": { state: "0-0", attributes: { in_progress: false, live_scoring: true } },
      "sensor.a_next": { state: "x", attributes: { stat_net_number: "1", team_code: "AAA" } },
      // An update entity has in_progress too.
      "update.b": { state: "on", attributes: { in_progress: false, live_scoring: true } },
    },
    entities: {
      "sensor.a_live": { device_id: "a", platform: "swedish_hockey" },
      "sensor.a_next": { device_id: "a", platform: "swedish_hockey" },
      "update.b": { device_id: "b", platform: "hacs" },
    },
    devices: { a: { name: "Aby" }, b: { name: "Not a team" } },
  };
  assert.deepEqual(I.findTeams(hass), [
    { team: "Aby", code: "AAA", entities: { live: "sensor.a_live", next: "sensor.a_next" } },
  ]);
});

test("the clubs' rows take on their squads' figures, kept for the next render", () => {
  const teams = [{ team_code: "AAA", team: "Aby" }, { team_code: "BBB", team: "Bstad" }];
  const squads = {
    teams: [
      {
        team_code: "aaa",
        players: 20,
        height: 184.2,
        weight: 85,
        age: 26.1,
        home_grown: 15,
        shoots: { left: 12, right: 4 },
        positions: { d: { players: 7, height: 186, weight: 88, age: 27 } },
      },
    ],
  };
  const rows = I.withSquads(teams, squads);
  assert.equal(rows[0].sq_height, 184.2);
  assert.equal(rows[0].sq_swedes, 75);
  assert.equal(rows[0].sq_left, 75, "a share of those whose shot is known");
  assert.equal(rows[0].sq_d_height, 186);
  assert.equal(rows[1], teams[1], "a club without a squad is left as it was");
  assert.equal(I.withSquads(teams, squads), rows, "the same question, the same list");
  assert.equal(I.withSquads(teams, null), teams);
});
