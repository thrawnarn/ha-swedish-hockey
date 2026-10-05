/**
 * Everything the card's dialog knows and does: which view is open, what has
 * been read for it, and how to read more.
 *
 * The card and the badge each own one. The views are drawn from it and call
 * it to move about, so a tap on a fixture row in any view opens the same
 * summary the same way. Assigning to any of the state fields below asks the
 * card to draw itself again; the card hands every part a fresh context, so
 * every part draws with it.
 */

import { errorText } from "./base";
import { SCHEDULE_BEFORE, ROSTER_SORT } from "./constants";
import { clubColour } from "./format";
import { STATS_FRESH, STATS_PAGE, STATS_SCOPES } from "./stats-model";
import { clubKey, findTeams, teamMatches } from "./teams";
import type {
  CardConfig,
  EntityIds,
  Game,
  HassDevice,
  HassEntity,
  HomeAssistant,
  Row,
  StatsRow,
  TableRow,
} from "./types";

/** What owns the controller: the card or the badge. */
export interface ControllerHost {
  hass?: HomeAssistant;
  readonly cardConfig?: CardConfig;
  requestUpdate(): void;
  readonly updateComplete: Promise<boolean>;
}

/** A club as the team picker lists it. */
export interface Club {
  key: string;
  name: string;
  logo: string | null;
}

/** What the club list is choosing for. */
export interface PickerSpec {
  title: string;
  clubs: Club[];
  chosen: string[];
  set(teams: string[]): void;
}

export type TableView = "table" | "live" | "schedule" | "stats";
export type Panel = "table" | "game" | "events" | "results";

/** The stats tab's own choices, kept while the card lives: they survive the
 *  dialog closing, as a reader would expect of a filter they set. */
export interface StatsUi {
  scope?: string;
  section?: string;
  more?: number;
  groups?: Record<string, string>;
  sorts?: Record<string, { key: string; dir?: "asc" | "desc" }>;
  filters?: Record<string, { teams?: string[]; position?: string | null }>;
}

export interface StatsEntry {
  data?: Row;
  at?: number;
  loading?: boolean;
  error?: string | null;
}

/** The fields that, when assigned, make the card draw again. */
const STATE = [
  "panel",
  "liveTable",
  "recap",
  "team",
  "tableView",
  "player",
  "schedule",
  "results",
  "photo",
  "trend",
  "tonight",
  "statsOpen",
  "day",
  "stats",
  "statsData",
  "picker",
] as const;

export class HockeyController {
  declare panel: Panel | null;
  /** False once the live table has been switched off at the foot of the
   *  table; otherwise the live one shows whenever there is one. */
  declare liveTable: boolean | undefined;
  declare recap: Row | null;
  declare team: Row | null;
  declare tableView: TableView;
  declare player: Row | null;
  declare schedule: Row | null;
  declare results: Row | null;
  declare photo: string | null;
  declare trend: Row | null;
  declare tonight: Row | null;
  declare statsOpen: boolean;
  declare day: number;
  declare stats: StatsUi | null;
  declare statsData: Record<string, StatsEntry> | null;
  declare picker: string | null;

  /** The sensors of the team the card follows, found afresh each render. */
  ids: EntityIds = {};

  private _state: Record<string, unknown> = {};
  private _request = 0;
  private _liveTimer: ReturnType<typeof setInterval> | null = null;
  private _entryId: string | undefined;

  constructor(readonly host: ControllerHost) {
    this._state.tableView = "table";
    this._state.day = 0;
    this._state.statsOpen = false;
  }

  get hass(): HomeAssistant {
    return this.host.hass as HomeAssistant;
  }

  get config(): CardConfig {
    return this.host.cardConfig ?? {};
  }

  /** Something changed: draw again. Lit folds a run of these into one. */
  changed(): void {
    this.host.requestUpdate();
  }

  /** Once the card and every part in it have drawn what was just changed. */
  async settled(): Promise<void> {
    await this.host.updateComplete;
    await new Promise((resolve) => setTimeout(resolve));
  }

  // ---- Entities ---------------------------------------------------------------

  // Entities are found from the team's device, so the card config stays a
  // single team name. Explicit *_entity keys still win, for hand-written YAML.
  findIds(): EntityIds {
    const config = this.config;
    const found = config.team
      ? (findTeams(this.hass).find((t) => teamMatches(t, config.team))?.entities ?? {})
      : {};
    this.ids = {
      live: config.live_entity ?? found.live,
      next: config.next_entity ?? found.next,
      standings: config.standings_entity ?? found.standings,
    };
    return this.ids;
  }

  state(entityId: string | undefined): HassEntity | undefined {
    return entityId ? this.hass?.states?.[entityId] : undefined;
  }

  /** The league table, as the standings sensor carries it. */
  table(): TableRow[] | undefined {
    return this.state(this.ids.standings)?.attributes?.table;
  }

  // Services resolve a team by its club code (LIF, SSK), which the sensors
  // carry. The card's own `team` is the device name and only a fallback: the
  // same club is spelled "Leksand" in one payload and "Leksands IF" in
  // another, and the device may have been renamed by hand besides.
  teamRef(): string {
    const ids = this.ids;
    for (const entityId of [ids.next, ids.standings, ids.live]) {
      const code = this.state(entityId)?.attributes?.team_code;
      if (code) return code;
    }
    if (this.config.team) return this.config.team;
    const device = this.device();
    return device?.name_by_user || device?.name || "";
  }

  device(): HassDevice | null {
    const ids = this.ids;
    const entityId = ids.next ?? ids.live ?? ids.standings;
    const deviceId = entityId ? this.hass?.entities?.[entityId]?.device_id : null;
    return deviceId ? (this.hass?.devices?.[deviceId] ?? null) : null;
  }

  async configEntryId(): Promise<string | undefined> {
    if (this._entryId) return this._entryId;
    const device = this.device();
    let entry = device?.primary_config_entry ?? device?.config_entries?.[0] ?? undefined;
    if (!entry) {
      // Older frontends leave the config entry off the device registry entry.
      const ids = this.ids;
      const entityId = ids.next ?? ids.live ?? ids.standings;
      const registry = entityId
        ? await this.hass.callWS<{ config_entry_id?: string }>({
            type: "config/entity_registry/get",
            entity_id: entityId,
          })
        : null;
      entry = registry?.config_entry_id;
    }
    this._entryId = entry;
    return entry;
  }

  /** Ask one of the integration's services, and hand back its answer. */
  async ask(service: string, data: Record<string, unknown> = {}): Promise<any> {
    const entry = await this.configEntryId();
    if (!entry) throw new Error("Hittade inte integrationen");
    const result = await this.hass.callService(
      "swedish_hockey",
      service,
      { config_entry_id: entry, ...data },
      undefined,
      false,
      true,
    );
    return result?.response ?? result;
  }

  async askTeam(teamCode: string, service: string, data: Record<string, unknown> = {}) {
    return this.ask(service, { team: teamCode, ...data });
  }

  // A club's crest and colour, from wherever the card has seen the club: the
  // table has every crest, the fixtures carry the colours.
  crestOf(code: unknown, name?: unknown): string | null {
    const table = this.table() ?? [];
    const key = clubKey(code);
    const row: TableRow | undefined =
      (key ? table.find((r) => clubKey(r.team_code) === key) : undefined) ||
      (name ? table.find((r) => clubKey(r.team) === clubKey(name)) : undefined);
    return row?.logo ?? (this.team?.row?.team_code === code ? this.team?.row.logo : null);
  }

  clubColourOf(code: unknown): string {
    const key = clubKey(code);
    const games: Game[] = [
      ...(this.team?.next ?? []),
      ...(this.team?.results ?? []),
      ...(this.team?.season ?? []),
      ...(this.schedule?.games ?? []),
      ...(this.tonight?.games ?? []),
    ];
    for (const game of games) {
      if (clubKey(game.home_code) === key && game.home_color) {
        return clubColour(game.home_color, "var(--primary-color)");
      }
      if (clubKey(game.away_code) === key && game.away_color) {
        return clubColour(game.away_color, "var(--primary-color)");
      }
    }
    // The statistics carry every club's colour, for wherever no game does.
    for (const entry of Object.values(this.statsData ?? {})) {
      const club = entry?.data?.teams?.find((team: Row) => clubKey(team.team_code) === key);
      if (club?.color) return clubColour(club.color, "var(--primary-color)");
    }
    return "var(--primary-color)";
  }

  // ---- Requests ---------------------------------------------------------------

  // Every fetch is stamped, and every step away from a view - back, close, or
  // opening something else - moves the stamp on. A reply that comes back
  // stamped with anything but the current number answers a question nobody is
  // asking any more, and writing it would either resurrect a view the user has
  // left or merge one club's season into another's.
  newRequest(): number {
    this._request += 1;
    return this._request;
  }

  stale(token: number): boolean {
    return token !== this._request;
  }

  // ---- Moving about -----------------------------------------------------------

  /** The dialog has closed: everything about where it was goes with it. */
  reset(): void {
    this.newRequest();
    this.stopLive();
    this.panel = null;
    this.recap = null;
    this.team = null;
    this.player = null;
    this.tableView = "table";
    this.schedule = null;
    this.results = null;
    this.photo = null;
    this.trend = null;
    this.tonight = null;
    this.statsOpen = false;
    this.day = 0;
    this.picker = null;
  }

  openTab(id: string): void {
    this.newRequest();
    this.stopLive();
    this.recap = null;
    this.team = null;
    this.player = null;
    if (id === "game") {
      this.panel = "game";
      return;
    }
    this.panel = "table";
    this.tableView = (id === "today" ? "live" : id) as TableView;
    if (id === "today") {
      this.day = 0;
      this.watchLive();
    }
    if (id === "schedule") this.loadSchedule();
    if (id === "stats") this.loadStats();
  }

  /** One of the buttons along the card's foot. */
  openBarButton(id: string): void {
    this.newRequest();
    this.stopLive();
    this.recap = null;
    this.team = null;
    this.player = null;
    // Live is a tab inside the table view, so the table stays one tap away.
    this.panel = (id === "live" ? "table" : id) as Panel;
    this.tableView = id === "live" ? "live" : "table";
    if (id === "results") this.loadResults();
    if (id === "live") this.watchLive();
  }

  /** The table view's own switch, where there is no tab bar. */
  showTableView(view: TableView): void {
    this.tableView = view;
    if (view === "live") this.watchLive();
    else this.stopLive();
    if (view === "schedule") this.loadSchedule();
    if (view === "stats") this.loadStats();
  }

  // ---- The table over the last few games ----------------------------------

  // The table as it would stand over the last few games only. Nobody
  // publishes one, so it is worked out from the results.
  async loadTrend(last: number): Promise<void> {
    if (!last) {
      this.trend = null;
      return;
    }
    if (this.trend?.last === last) return;
    const token = this.newRequest();
    this.trend = { last, loading: true };
    try {
      const data = await this.ask("get_form_table", { last, team: this.teamRef() });
      if (this.stale(token)) return;
      this.trend = { last, table: data?.table ?? [] };
    } catch (err) {
      if (this.stale(token)) return;
      this.trend = { last, error: errorText(err) };
    }
  }

  // ---- Today's games ------------------------------------------------------

  // The league's remaining fixtures are in no sensor - the card follows one
  // team - so they are asked for once and kept for as long as the dialog is.
  // Nothing is read until the tab is open, and then only while it stays open:
  // once a minute is as often as a score is worth asking for.
  watchLive(): void {
    this.loadLive();
    this.stopLive();
    this._liveTimer = setInterval(() => this.loadLive(), 60000);
  }

  stopLive(): void {
    if (this._liveTimer) {
      clearInterval(this._liveTimer);
      this._liveTimer = null;
    }
  }

  // The day the view shows, as the service wants it: the local date, written
  // out, `offset` days from today.
  dayDate(offset: number): Date {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    return day;
  }

  async loadLive(): Promise<void> {
    const offset = this.day ?? 0;
    // A read for the same day already on its way is enough; a step to another
    // day asks again, and whichever answer is for the day on show wins.
    if (this.tonight?.loading && this.tonight.day === offset) return;
    // Only today's scores move; another day is read once and left.
    if (offset !== 0 && this.tonight?.day === offset && this.tonight.games) return;
    this.tonight = {
      ...(this.tonight?.day === offset ? this.tonight : {}),
      day: offset,
      loading: true,
    };
    try {
      const date = this.dayDate(offset);
      const data: Record<string, unknown> = {};
      if (offset !== 0) {
        data.date = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
      }
      const answer = await this.ask("get_live", data);
      // Not guarded on the request stamp: a score arriving late is still the
      // score, and the tab may well still be open when it lands. The day is
      // checked, though - an answer for a day stepped away from is not shown.
      if (this.tableView !== "live" || (this.day ?? 0) !== offset) return;
      this.tonight = { day: offset, games: answer?.games ?? [], updated: new Date() };
    } catch (err) {
      if ((this.day ?? 0) !== offset) return;
      this.tonight = {
        ...this.tonight,
        day: offset,
        loading: false,
        error: errorText(err),
      };
    }
  }

  stepDay(step: number): void {
    this.day = (this.day ?? 0) + step;
    this.loadLive();
  }

  // ---- The team's earlier results -------------------------------------------

  // The sensor carries the last five games, which is enough to draw at once.
  // The service carries ten and knows which of them have a clip, so it is
  // asked for as the panel opens and swapped in when it answers.
  async loadResults(): Promise<void> {
    if (this.results?.games || this.results?.loading) return;
    const token = this.newRequest();
    this.results = { loading: true };
    try {
      const data = await this.ask("get_results", {
        team: this.teamRef(),
        limit: 10,
        highlights: true,
      });
      if (this.stale(token)) return;
      this.results = { games: data?.results ?? [] };
    } catch (err) {
      if (this.stale(token)) return;
      this.results = { error: errorText(err) };
    }
  }

  // ---- The league's schedule ------------------------------------------------

  // The season so far comes too, with the list opened at the next game: what
  // is still to come is below, what has been played is a scroll up. The
  // service gives at most 200 games, so a hundred back leaves as many ahead.
  async loadSchedule(): Promise<void> {
    if (this.schedule?.loading) return;
    if (this.schedule?.games) {
      this.schedule = { ...this.schedule, scrollToNext: true };
      return;
    }
    const before = SCHEDULE_BEFORE;
    const token = this.newRequest();
    this.schedule = { loading: true, before, teams: this.schedule?.teams ?? [] };
    try {
      const data = await this.ask("get_schedule", { limit: 200, before, highlights: true });
      if (this.stale(token)) return;
      this.schedule = {
        games: data?.games ?? [],
        before,
        nextIndex: data?.next_index ?? null,
        teams: this.schedule?.teams ?? [],
        scrollToNext: true,
      };
    } catch (err) {
      if (this.stale(token)) return;
      this.schedule = { error: errorText(err) };
    }
  }

  filterSchedule(teams: string[]): void {
    this.schedule = { ...this.schedule, teams, scrollToNext: true };
  }

  /** The list is at its next game; stop asking for it. */
  scrolledToNext(which: "schedule" | "team"): void {
    if (which === "schedule" && this.schedule?.scrollToNext) {
      this.schedule = { ...this.schedule, scrollToNext: false };
    }
    if (which === "team" && this.team?.scrollToNext) {
      this.team = { ...this.team, scrollToNext: false };
    }
  }

  // ---- Clubs to pick from ---------------------------------------------------

  clubsOf(rows: Row[] | undefined | null): Club[] {
    return (rows ?? [])
      .filter((row) => row?.team_code)
      .map((row) => ({
        key: clubKey(row.team_code),
        name: row.team ?? row.team_code,
        logo: row.logo ?? this.crestOf(row.team_code, row.team),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }

  // The league's clubs from its table; from the games themselves should the
  // table not have been read.
  scheduleClubs(): Club[] {
    const table = this.table();
    if (table?.length) return this.clubsOf(table);
    const seen = new Map<string, Row>();
    for (const game of this.schedule?.games ?? []) {
      for (const side of ["home", "away"]) {
        const code = game[`${side}_code`];
        if (code && !seen.has(clubKey(code))) {
          seen.set(clubKey(code), {
            team_code: code,
            team: game[`${side}_team`],
            logo: game[`${side}_logo`],
          });
        }
      }
    }
    return this.clubsOf([...seen.values()]);
  }

  // What the club list is choosing for: the schedule's games, or one of the
  // statistics' lists of players. It is read afresh every render, so a tick
  // is applied - and shows behind the list - the moment it is made.
  pickerSpec(picker: string | null = this.picker): PickerSpec | null {
    if (picker === "schedule") {
      return {
        title: "Visa matcher för",
        clubs: this.scheduleClubs(),
        chosen: this.schedule?.teams ?? [],
        set: (teams) => this.filterSchedule(teams),
      };
    }
    if (picker === "skaters" || picker === "goalies") {
      const data = this.statsData?.[this.statsScope()]?.data;
      return {
        title: picker === "goalies" ? "Visa målvakter från" : "Visa spelare från",
        clubs: this.clubsOf(data?.teams),
        chosen: this.stats?.filters?.[picker]?.teams ?? [],
        set: (teams) => this.setStatsFilter(picker, { teams }),
      };
    }
    return null;
  }

  // ---- Statistics -------------------------------------------------------------

  // The statistics are the league's, the same whichever club the card follows
  // and whichever view asked for them, so a reply is kept by the scope it is
  // for rather than by the request: it is written whenever it lands, since a
  // late answer is still the answer. A stale copy stays on show while the
  // fresh one is read.
  async loadStats(scope: string = this.statsScope()): Promise<void> {
    const kept = this.statsData?.[scope];
    if (kept?.loading) return;
    if (kept?.data && Date.now() - (kept.at ?? 0) < STATS_FRESH) return;
    const store = (value: StatsEntry) => {
      this.statsData = { ...(this.statsData ?? {}), [scope]: value };
    };
    store({ ...(kept ?? {}), loading: true, error: null });
    try {
      const wanted = STATS_SCOPES.find((s) => s.id === scope) ?? STATS_SCOPES[0];
      const data = await this.ask("get_statistics", { ...wanted.data });
      store({ data, at: Date.now() });
    } catch (err) {
      store({
        ...(this.statsData?.[scope] ?? {}),
        loading: false,
        error: errorText(err),
      });
    }
  }

  statsScope(): string {
    return this.stats?.scope ?? "season";
  }

  setStats(patch: StatsUi): void {
    this.stats = { ...(this.stats ?? {}), ...patch };
  }

  setStatsFilter(kind: string, patch: { teams?: string[]; position?: string | null }): void {
    this.setStats({
      filters: {
        ...(this.stats?.filters ?? {}),
        [kind]: { ...(this.stats?.filters?.[kind] ?? {}), ...patch },
      },
      more: STATS_PAGE,
    });
  }

  // ---- A club's page ------------------------------------------------------------

  // Everything about another club has to be asked for: the card only ever
  // holds its own team's fixtures. The table row it was tapped from is enough
  // to draw the header while the rest arrives.
  // Only what the open tab needs is fetched. The overview is two short reads -
  // three fixtures either side of today - and the season and the squad are
  // asked for the first time their own tab is opened.
  async openTeam(row: TableRow, tab = "overview"): Promise<void> {
    if (!row?.team_code) return;
    const token = this.newRequest();
    this.team = { row, tab, loading: true };
    if (tab === "stats") this.loadStats("season");
    try {
      const [next, results] = await Promise.allSettled([
        this.askTeam(row.team_code, "get_schedule", { limit: 3 }),
        this.askTeam(row.team_code, "get_results", { limit: 3, highlights: true }),
      ]);
      if (this.stale(token)) return;
      const value = (settled: PromiseSettledResult<any>) =>
        settled.status === "fulfilled" ? settled.value : null;
      this.team = {
        ...this.team,
        loading: false,
        next: value(next)?.games ?? [],
        results: value(results)?.results ?? [],
        error:
          next.status === "rejected" && results.status === "rejected"
            ? errorText(results.reason)
            : null,
      };
    } catch (err) {
      if (this.stale(token)) return;
      this.team = { ...this.team, loading: false, error: errorText(err) };
    }
  }

  // The table row has the rank and the record to fill the header with; a crest
  // elsewhere carries only a name, so the row is looked up when the table is
  // loaded and made up from what is on screen when it is not. A club reached
  // from the statistics opens on its own statistics.
  openTeamByCode(code: string, name?: string, logo?: string, tab = "overview"): void {
    const table = this.table();
    const row = (table ?? []).find((r) => clubKey(r.team_code) === clubKey(code)) ?? {
      team_code: code,
      team: name,
      logo,
    };
    this.recap = null;
    this.panel = "table";
    this.openTeam(row, tab);
  }

  closeTeam(): void {
    this.newRequest();
    this.team = null;
  }

  async openTeamTab(tab: string): Promise<void> {
    const token = this.newRequest();
    this.team = { ...this.team, tab };
    const code = this.team?.row?.team_code;
    if (tab === "schedule" && !this.team?.season) {
      await this.loadTeamSeason(0);
    }
    if (tab === "stats") this.loadStats("season");
    if (tab === "roster" && !this.team?.roster) {
      this.team = { ...this.team, rosterLoading: true };
      try {
        const data = await this.askTeam(code, "get_roster");
        if (this.stale(token)) return;
        this.team = {
          ...this.team,
          rosterLoading: false,
          roster: data?.players ?? [],
          statsUrl: data?.stats_url ?? null,
        };
      } catch (err) {
        if (this.stale(token)) return;
        this.team = {
          ...this.team,
          rosterLoading: false,
          rosterError: errorText(err),
        };
      }
    }
  }

  // What is still to come, and on request what came before it. The whole
  // season is one read either way; asking for it in two is what lets the list
  // open at the part that has not happened yet.
  async loadTeamSeason(before = 0): Promise<void> {
    const team = this.team;
    if (!team?.row?.team_code || team.seasonLoading) return;
    if (team.season && (team.seasonBefore ?? 0) >= before) return;
    const token = this.newRequest();
    this.team = { ...team, seasonLoading: true };
    try {
      const data = await this.askTeam(team.row.team_code, "get_schedule", {
        before,
        limit: 200,
        highlights: Boolean(before),
      });
      if (this.stale(token)) return;
      this.team = {
        ...this.team,
        seasonLoading: false,
        season: data?.games ?? [],
        seasonBefore: before,
        nextIndex: data?.next_index ?? null,
        // Reaching back moves the list under the reader; put them back at the
        // next game.
        scrollToNext: Boolean(before),
      };
    } catch (err) {
      if (this.stale(token)) return;
      this.team = {
        ...this.team,
        seasonLoading: false,
        seasonError: errorText(err),
      };
    }
  }

  setTeam(patch: Row): void {
    this.team = { ...this.team, ...patch };
  }

  sortRoster(group: string, key: string): void {
    const sort = this.team?.sorts?.[group] ?? ROSTER_SORT;
    // Tapping the same column turns it round; a new one starts where that
    // column is most useful - names from A, numbers from the top.
    const dir =
      sort.key === key
        ? sort.dir === "asc"
          ? "desc"
          : "asc"
        : key === "player"
          ? "asc"
          : "desc";
    this.team = {
      ...this.team,
      sorts: { ...(this.team?.sorts ?? {}), [group]: { key, dir } },
    };
  }

  // ---- A game's summary ----------------------------------------------------------

  // The card holds nothing about a game once it is over - the goals and the
  // shots are fetched back from the play-by-play when a row is tapped.
  async loadRecap(row: Game, teamCode?: string): Promise<void> {
    // Without an id the service answers for the team's most recent game,
    // which is what `latest` asks for.
    if (!row?.game_id && !row?.latest) return;
    const token = this.newRequest();
    this.recap = { loading: true, row };
    try {
      const data = await this.ask("get_recap", {
        team: teamCode || this.teamRef(),
        ...(row.game_id ? { game_id: row.game_id } : {}),
      });
      if (this.stale(token)) return;
      this.recap = { row, data };
    } catch (err) {
      if (this.stale(token)) return;
      this.recap = { row, error: errorText(err) };
    }
  }

  closeRecap(): void {
    this.newRequest();
    this.recap = null;
  }

  // ---- A player -------------------------------------------------------------------

  // The season's figures for one player, which live in the league's stats
  // tables rather than in anything the card already holds.
  async openPlayer(name: string, teamCode?: string): Promise<void> {
    const token = this.newRequest();
    const clean = String(name).replace(/^#\s*\d+\s*/, "");
    this.player = {
      name: clean,
      jersey: String(name).match(/^#\s*(\d+)/)?.[1],
      teamCode: teamCode || this.teamRef(),
      loading: true,
    };
    // Where he stands in the league comes from the statistics, which are
    // read alongside if the card has not got them already.
    if (this.config.show_stats !== false) this.loadStats("season");
    try {
      const data = await this.ask("get_player", {
        team: teamCode || this.teamRef(),
        player: clean,
      });
      if (this.stale(token)) return;
      this.player = { ...this.player, loading: false, data };
    } catch (err) {
      if (this.stale(token)) return;
      this.player = {
        ...this.player,
        loading: false,
        error: errorText(err),
      };
    }
  }

  closePlayer(): void {
    this.newRequest();
    this.player = null;
  }

  /** A player's row in the season's statistics, found by name and club. */
  playerStatsRow(name: string, teamCode: string, goalie: boolean): StatsRow | null {
    const data = this.statsData?.season?.data;
    if (!data) return null;
    const rows: StatsRow[] = data[goalie ? "goalies" : "skaters"] ?? [];
    const wanted = clubKey(name);
    const named = rows.filter((row) => clubKey(row.player) === wanted);
    return (
      named.find((r) => clubKey(r.team_code) === clubKey(teamCode)) ??
      (named.length === 1 ? named[0] : null)
    );
  }
}

// Each state field is an accessor that asks the card to draw again when it is
// assigned, so no change can be made and then forgotten.
for (const key of STATE) {
  Object.defineProperty(HockeyController.prototype, key, {
    get(this: HockeyController) {
      return (this as any)._state[key];
    },
    set(this: HockeyController, value: unknown) {
      if ((this as any)._state[key] === value) return;
      (this as any)._state[key] = value;
      this.changed();
    },
    configurable: true,
    enumerable: true,
  });
}
