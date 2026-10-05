/**
 * The league's statistics, as the Statistik tab reads them, and how a list of
 * rows is ranked on one figure.
 */

import type { Metric, Ranked, Ranking, StatsRow } from "./types";
import { statNumber } from "./format";

// The league's statistics, as the Statistik tab reads them. Every figure the
// service sends is named once here: what it is called in full, what heads its
// column, how it is written, and which way is better. `ok` names the flag that
// says a player has done enough of it to be ranked - two shots and one goal is
// not the league's best shooter - and `games` asks for a third of the most
// games anyone has played, for a figure that is an average per game.
export const SKATER_METRICS: Record<string, Metric> = {
  GP: { label: "Matcher", short: "M" },
  G: { label: "Mål", short: "Mål" },
  A: { label: "Assist", short: "A" },
  TP: { label: "Poäng", short: "P" },
  TP_GP: { label: "Poäng per match", short: "P/M", kind: "dec", games: true },
  PlusMinus: { label: "Plus/minus", short: "+/-", kind: "pm" },
  PIM: { label: "Utvisningsminuter", short: "Utv" },
  SOG: { label: "Skott på mål", short: "Skott" },
  S_perc: { label: "Skotteffektivitet", short: "S%", kind: "pct", ok: "S_perc_ok" },
  PPG: { label: "Powerplaymål", short: "PPM" },
  PPP: { label: "Powerplaypoäng", short: "PPP" },
  SHG: { label: "Boxplaymål", short: "BPM" },
  GWG: { label: "Matchvinnande mål", short: "GWG" },
  A1: { label: "Primära assist", short: "A1" },
  ENG: { label: "Mål i tom kasse", short: "TK" },
  GFG: { label: "Matchens första mål", short: "1–0" },
  Hits: { label: "Tacklingar", short: "Tackl" },
  BKS: { label: "Blockerade skott", short: "Block" },
  TOI_GP: { label: "Istid per match", short: "Istid", kind: "time", games: true },
  PPTOI_GP: { label: "Istid i powerplay", short: "PP-tid", kind: "time", games: true },
  SHTOI_GP: { label: "Istid i boxplay", short: "BP-tid", kind: "time", games: true },
  FO_perc: { label: "Vunna tekningar", short: "Tekn%", kind: "pct", ok: "FO_perc_ok" },
  FOW: { label: "Vunna tekningar", short: "TV" },
  CF_perc: { label: "Corsi (skottförsök)", short: "CF%", kind: "pct", games: true },
};

export const GOALIE_METRICS: Record<string, Metric> = {
  GPI: { label: "Matcher", short: "M" },
  SVS_perc: { label: "Räddningsprocent", short: "Rädd%", kind: "pct", ok: "ok" },
  GAA: { label: "Insläppta mål per match", short: "GAA", kind: "dec", dir: "asc", ok: "ok" },
  SO: { label: "Hållna nollor", short: "N" },
  W: { label: "Vinster", short: "V" },
  L: { label: "Förluster", short: "F" },
  SVS: { label: "Räddningar", short: "Rädd" },
  GA: { label: "Insläppta mål", short: "IM", dir: "asc" },
  SOGA: { label: "Skott emot", short: "SE" },
  MIP: { label: "Speltid", short: "Tid", kind: "time" },
  EV_SVS_perc: { label: "Räddningsprocent 5 mot 5", short: "5v5%", kind: "pct", ok: "ok" },
  PK_SVS_perc: { label: "Räddningsprocent i boxplay", short: "BP%", kind: "pct", ok: "ok" },
};

export const TEAM_METRICS: Record<string, Metric> = {
  GP: { label: "Matcher", short: "M" },
  PTS: { label: "Poäng", short: "P" },
  PTS_GP: { label: "Poäng per match", short: "P/M", kind: "dec" },
  GF_GP: { label: "Gjorda mål per match", short: "GM/M", kind: "dec" },
  GA_GP: { label: "Insläppta mål per match", short: "IM/M", kind: "dec", dir: "asc" },
  GD: { label: "Målskillnad", short: "+/-", kind: "pm" },
  first_goal: { label: "Gjorde matchens första mål", short: "1–0" },
  PP_perc: { label: "Powerplay", short: "PP%", kind: "pct" },
  PPG: { label: "Powerplaymål", short: "PPM" },
  PPO: { label: "Powerplaychanser", short: "PPC" },
  PK_perc: { label: "Boxplay", short: "BP%", kind: "pct" },
  PPGA: { label: "Insläppta i boxplay", short: "IBP", dir: "asc" },
  SHG: { label: "Boxplaymål", short: "BPM" },
  ST_perc: { label: "Special teams (PP% + BP%)", short: "ST", kind: "pct" },
  SOG_GP: { label: "Skott per match", short: "S/M", kind: "dec" },
  S_perc: { label: "Skotteffektivitet", short: "S%", kind: "pct" },
  SOGA_GP: { label: "Skott emot per match", short: "SE/M", kind: "dec", dir: "asc" },
  SVS_perc: { label: "Räddningsprocent", short: "Rädd%", kind: "pct" },
  FO_perc: { label: "Vunna tekningar", short: "Tekn%", kind: "pct" },
  PIM_GP: { label: "Utvisningsminuter per match", short: "Utv/M", kind: "dec", dir: "asc" },
  Hits: { label: "Tacklingar", short: "Tackl" },
  BKS: { label: "Blockerade skott", short: "Block" },
  CF_perc: { label: "Corsi (skottförsök)", short: "CF%", kind: "pct" },
  PDO: { label: "PDO (S% + Rädd%)", short: "PDO", kind: "dec1" },
  ENG: { label: "Mål i tom kasse", short: "TK" },
  ATT_avg: { label: "Publiksnitt hemma", short: "Snitt", kind: "crowd" },
  ATT_total: { label: "Publik hemma totalt", short: "Totalt", kind: "crowd" },
  ATT_GP: { label: "Hemmamatcher", short: "M" },
};

export type StatsKind = "skaters" | "goalies" | "teams";

export const STATS_KINDS: Record<StatsKind, { metrics: Record<string, Metric>; label: string }> = {
  skaters: { metrics: SKATER_METRICS, label: "Utespelare" },
  goalies: { metrics: GOALIE_METRICS, label: "Målvakter" },
  teams: { metrics: TEAM_METRICS, label: "Lag" },
};

export const STATS_SECTIONS: [string, string][] = [
  ["leaders", "Ledare"],
  ["skaters", "Spelare"],
  ["goalies", "Målvakter"],
  ["teams", "Lag"],
];

// A table is a handful of columns at a time - a phone has room for five
// beside a name - grouped the way a league's own stats pages group them.
// Each group opens sorted on the figure it is about, not on its first column.
export interface ColumnGroup {
  id: string;
  label: string;
  sort: string;
  columns: string[];
}

export const STATS_COLUMNS: Record<StatsKind, ColumnGroup[]> = {
  skaters: [
    { id: "points", label: "Poäng", sort: "TP", columns: ["GP", "G", "A", "TP", "PlusMinus"] },
    { id: "shots", label: "Skott", sort: "SOG", columns: ["SOG", "S_perc", "PPG", "PPP", "GWG"] },
    {
      id: "ice",
      label: "Istid",
      sort: "TOI_GP",
      columns: ["TOI_GP", "PPTOI_GP", "SHTOI_GP", "TP_GP", "CF_perc"],
    },
    { id: "play", label: "Spel", sort: "PIM", columns: ["PIM", "Hits", "BKS", "FOW", "FO_perc"] },
  ],
  goalies: [
    {
      id: "summary",
      label: "Översikt",
      sort: "SVS_perc",
      columns: ["GPI", "SVS_perc", "GAA", "SO", "W"],
    },
    {
      id: "saves",
      label: "Räddningar",
      sort: "SVS",
      columns: ["SOGA", "SVS", "GA", "EV_SVS_perc", "PK_SVS_perc"],
    },
  ],
  teams: [
    {
      id: "special",
      label: "Special teams",
      sort: "PP_perc",
      columns: ["PP_perc", "PPG", "PK_perc", "SHG", "ST_perc"],
    },
    {
      id: "goals",
      label: "Mål",
      sort: "GF_GP",
      columns: ["GF_GP", "GA_GP", "GD", "first_goal", "PTS_GP"],
    },
    {
      id: "shots",
      label: "Skott",
      sort: "SOG_GP",
      columns: ["SOG_GP", "S_perc", "SOGA_GP", "SVS_perc", "PDO"],
    },
    {
      id: "play",
      label: "Spel",
      sort: "FO_perc",
      columns: ["FO_perc", "PIM_GP", "Hits", "BKS", "CF_perc"],
    },
    { id: "crowd", label: "Publik", sort: "ATT_avg", columns: ["ATT_avg", "ATT_total", "ATT_GP"] },
  ],
};

// The leaders, a row of cards per kind. The first few of each are what the
// league's own front page leads with; the rest are a swipe along.
export const STATS_LEADERS: Record<StatsKind, string[]> = {
  skaters: ["TP", "G", "A", "PlusMinus", "PPP", "GWG", "SOG", "S_perc", "FO_perc", "TOI_GP", "Hits", "BKS", "PIM"],
  goalies: ["SVS_perc", "GAA", "SO", "W"],
  teams: ["PP_perc", "PK_perc", "GF_GP", "GA_GP", "SOG_GP", "SVS_perc", "FO_perc", "PIM_GP", "ATT_avg"],
};

// A club's figures on its own page, in groups, each against the league.
export const TEAM_STAT_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Resultat", keys: ["PTS_GP", "GF_GP", "GA_GP", "GD", "first_goal"] },
  { label: "Special teams", keys: ["PP_perc", "PK_perc", "PPG", "PPGA", "SHG", "ST_perc"] },
  { label: "Skott", keys: ["SOG_GP", "S_perc", "SOGA_GP", "SVS_perc", "CF_perc", "PDO"] },
  { label: "Spel", keys: ["FO_perc", "PIM_GP", "Hits", "BKS"] },
  { label: "Publik", keys: ["ATT_avg", "ATT_total"] },
];

// What the statistics can be narrowed to, and how the service is asked for
// each. Last-few-games is Hockeyallsvenskan's alone; the service says so.
// `short` is what the chip in the filter row says once it is chosen.
export interface StatsScope {
  id: string;
  label: string;
  short?: string;
  data: Record<string, unknown>;
  needs?: string;
}

export const STATS_SCOPES: StatsScope[] = [
  { id: "season", label: "Hela säsongen", short: "Säsong", data: {} },
  { id: "last5", label: "Senaste 5 matcherna", short: "Senaste 5", data: { last: 5 }, needs: "last" },
  { id: "last10", label: "Senaste 10 matcherna", short: "Senaste 10", data: { last: 10 }, needs: "last" },
  { id: "home", label: "Hemmamatcher", short: "Hemma", data: { location: "home" } },
  { id: "away", label: "Bortamatcher", short: "Borta", data: { location: "away" } },
];


// How long a read is good for in the card. The integration keeps its own copy
// for ten minutes, so this only spares the round trip.
export const STATS_FRESH = 5 * 60e3;
export const STATS_PAGE = 40;

// Rows ranked on one figure, best first, with a place each. Equal figures
// share a place and the next one along skips, as a league table does. Rows
// without the figure are left out; rows short of the minimum for a rate are
// kept apart from the ranked ones, so a list can show them after.
//
// The card is drawn again every time anything in Home Assistant changes, so a
// ranking is kept against the list it was made from: the same list asked the
// same question gets the same answer without sorting three hundred rows again.
const RANKINGS = new WeakMap<StatsRow[], Map<string, Ranking>>();

export function rankStats(
  rows: StatsRow[] | undefined | null,
  key: string,
  metric: Metric | Partial<Metric> = {},
  dir: "asc" | "desc" = metric.dir ?? "desc",
): Ranking {
  const question = `${key}|${dir}`;
  const kept = rows ? RANKINGS.get(rows) : undefined;
  const known = kept?.get(question);
  if (known) return known;
  const answer = rankAnew(rows, key, metric, dir);
  if (rows) {
    if (kept) kept.set(question, answer);
    else RANKINGS.set(rows, new Map([[question, answer]]));
  }
  return answer;
}

function rankAnew(
  rows: StatsRow[] | undefined | null,
  key: string,
  metric: Partial<Metric>,
  dir: "asc" | "desc",
): Ranking {
  const sign = dir === "asc" ? 1 : -1;
  const withValue = (rows ?? []).filter((row) => statNumber(row[key]) !== null);
  let floor = 0;
  if (metric.games) {
    const most = Math.max(0, ...withValue.map((row) => Number(row.GP ?? row.GPI ?? 0)));
    floor = Math.ceil(most / 3);
  }
  const qualifies = (row: StatsRow) =>
    (!metric.ok || row[metric.ok] !== false) &&
    (!floor || Number(row.GP ?? row.GPI ?? 0) >= floor);
  const byValue = (a: StatsRow, b: StatsRow) =>
    sign * ((statNumber(a[key]) as number) - (statNumber(b[key]) as number)) ||
    String(a.player ?? a.team ?? "").localeCompare(String(b.player ?? b.team ?? ""), "sv");
  const ranked = withValue.filter(qualifies).sort(byValue);
  const rest = withValue.filter((row) => !qualifies(row)).sort(byValue);
  let place = 0;
  let previous: number | null = null;
  const placed: Ranked[] = ranked.map((row, index) => {
    const value = statNumber(row[key]);
    if (value !== previous) {
      place = index + 1;
      previous = value;
    }
    return { row, rank: place };
  });
  return { ranked: placed, rest: rest.map((row) => ({ row, rank: null })) };
}
