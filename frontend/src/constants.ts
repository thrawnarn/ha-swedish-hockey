/** The card's fixed tables: defaults, cuts, labels, positions, filters. */

export const DEFAULTS = {
  show_clock: true,
  show_powerplay: true,
  show_shots: true,
  show_tv: true,
  show_events: true,
  show_table: true,
  show_results: true,
  show_stats: true,
  result_hours: 6,
};

export const PLATFORM = "swedish_hockey";

// The three lines both leagues draw across their own table, after 6th, 10th
// and 12th. Drawn above the row below each cut, since the rows carry a top
// border already.
export const TABLE_CUTS = [6, 10, 12];

// How many played games the league schedule reaches back over.
export const SCHEDULE_BEFORE = 100;

// The roster opens on points, the way a league prints one.
export const ROSTER_SORT = { key: "TP", dir: "desc" as "asc" | "desc" };

// How a finished game was decided, said under its score; a game won in
// regulation needs nothing said.
export const DECIDED_IN: Record<string, string> = {
  OT: "Efter förlängning",
  SO: "Efter straffar",
  PSO: "Efter straffar",
};

// The stats on show before "Visa mer".
export const KEY_STATS = new Set(["shots_on_goal", "penalty_minutes"]);

export const STAT_LABELS: Record<string, string> = {
  shots_on_goal: "Skott på mål (SOG)",
  shot_attempts: "Skottförsök",
  blocked: "Blockerade skott (BLK)",
  shooting_pct: "Skotteffektivitet (S%)",
  saves: "Räddningar (SVS)",
  save_pct: "Räddningsprocent (SV%)",
  powerplay: "Powerplay (PP%)",
  shorthanded_goals: "Boxplaymål (SHG)",
  penalty_minutes: "Utvisningsminuter (PIM)",
};

// The league's six position codes, as a letter to wear and a line to group by.
export interface Position {
  letter: string;
  group: "gk" | "d" | "f" | "other";
}

export const POSITIONS: Record<string, Position> = {
  GK: { letter: "MV", group: "gk" },
  LD: { letter: "B", group: "d" },
  RD: { letter: "B", group: "d" },
  LW: { letter: "F", group: "f" },
  RW: { letter: "F", group: "f" },
  CE: { letter: "C", group: "f" },
  // SHL says no more than forward or defence.
  F: { letter: "F", group: "f" },
  D: { letter: "B", group: "d" },
};

export const POSITION_GROUPS = [
  { id: "gk", label: "Målvakter" },
  { id: "d", label: "Backar" },
  { id: "f", label: "Forwards" },
  { id: "other", label: "Övriga" },
];

/** A choice in the filter row: [value, the option in full, what the chip
 *  says]. The first of each list is the unfiltered view, and the chip is only
 *  lit once something else is chosen. */
export type FilterOption = [string, string, string?];

export const TABLE_PERIODS: FilterOption[] = [
  ["0", "Hela säsongen", "Säsong"],
  ["5", "Senaste 5 matcherna", "Senaste 5"],
  ["10", "Senaste 10 matcherna", "Senaste 10"],
  ["15", "Senaste 15 matcherna", "Senaste 15"],
];

export const POSITION_FILTERS: FilterOption[] = [
  ["", "Alla positioner", "Position"],
  ["f", "Forwards"],
  ["d", "Backar"],
];

export const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: "long" };
export const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
export const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
export const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
