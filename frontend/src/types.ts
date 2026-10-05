/**
 * The little of Home Assistant's frontend API the card uses, typed, and the
 * shapes the integration's services answer with.
 *
 * Written out rather than imported from a types package: the card touches a
 * handful of fields, and depending on the frontend's own type tree for that
 * would tie every build to its release cadence. The service payloads are
 * typed loosely on purpose -- they are the integration's dictionaries, and the
 * card reads them defensively, as it always has.
 */

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface HassEntityRegistryEntry {
  device_id?: string | null;
  platform?: string;
}

export interface HassDevice {
  name?: string | null;
  name_by_user?: string | null;
  primary_config_entry?: string | null;
  config_entries?: string[];
}

export interface HassLocale {
  language?: string;
  /** "24", "12", "language" or "system". */
  time_format?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, HassEntityRegistryEntry>;
  devices?: Record<string, HassDevice>;
  locale?: HassLocale;
  language?: string;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: unknown,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ): Promise<any>;
  callWS<T = any>(message: Record<string, unknown>): Promise<T>;
}

/** The card's (and the badge's) configuration, as YAML or the editor gives it. */
export interface CardConfig {
  type?: string;
  team?: string;
  title?: string;
  live_entity?: string;
  next_entity?: string;
  standings_entity?: string;
  show_clock?: boolean;
  show_powerplay?: boolean;
  show_shots?: boolean;
  show_tv?: boolean;
  show_events?: boolean;
  show_table?: boolean;
  show_results?: boolean;
  show_stats?: boolean;
  result_hours?: number;
  [key: string]: unknown;
}

/** The three sensors a team's card reads. */
export interface EntityIds {
  live?: string;
  next?: string;
  standings?: string;
}

export interface FoundTeam {
  team: string;
  code?: string;
  entities: EntityIds;
}

/** One of the integration's dictionaries: a game, a table row, a player. */
export type Row = Record<string, any>;
export type Game = Row;
export type TableRow = Row;
export type StatsRow = Row;

/** A metric in the statistics tables. */
export interface Metric {
  label: string;
  short: string;
  /** How it is written: a percentage, decimals, plus/minus, time, a crowd. */
  kind?: "pct" | "dec" | "dec1" | "pm" | "time" | "crowd";
  /** Which way is better; descending unless said. */
  dir?: "asc" | "desc";
  /** The flag that says a row has done enough of it to be ranked. */
  ok?: string;
  /** An average per game: ranked only with a third of the most games. */
  games?: boolean;
}

export interface Ranked {
  row: StatsRow;
  rank: number | null;
}

export interface Ranking {
  ranked: Ranked[];
  rest: Ranked[];
}

/** A loading read, its answer, or what went wrong. */
export interface Loadable {
  loading?: boolean;
  error?: string | null;
}
