/**
 * <hockey-preview-view>: a game still to come, and the two clubs before it.
 *
 * Where each stands, how each has been playing - lately, and at home or away
 * as the game will have them - what happened when they met before, this
 * season and in earlier ones, how their seasons compare and who to watch.
 * This season's numbers arrive in one quick read; earlier meetings come from
 * the federation's archive and draw in when they come.
 */

import { html, nothing, type TemplateResult } from "lit";
import { PartElement } from "../base";
import { DATE } from "../constants";
import { formatStat, ordinal, plus, statNumber } from "../format";
import {
  earlierMeetings,
  headToHead,
  RESULT_LETTER,
  recordText,
  restText,
  seasonLabel,
  streakText,
} from "../matchup";
import { rankStats, SKATER_METRICS, TEAM_METRICS } from "../stats-model";
import { clubKey } from "../teams";
import { relativeDay, timeFormat } from "../time";
import type { Metric, Row, StatsRow } from "../types";
import { badge, tv } from "../parts/common";
import { fixtureRow } from "../parts/fixture";
import { playerLink } from "../parts/links";
import { loading } from "../parts/loading";
import { scoreboard } from "../parts/scoreboard";

// The figures that say most about how a club plays, in the order a reader
// would weigh them.
const COMPARE = ["GF_GP", "GA_GP", "PP_perc", "PK_perc", "SVS_perc", "SOG_GP", "FO_perc", "PIM_GP"];

// How many earlier meetings show before "Visa fler".
const HISTORY_SHOWN = 6;

const BACK: Record<string, string> = {
  live: "Matcher",
  schedule: "Spelschema",
  stats: "Statistik",
};

export class HockeyPreviewView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const { ctl } = ctx;
    const preview = ctl.preview ?? {};
    const { data, loading: busy, error } = preview;
    const game: Row = data?.game ?? preview.game ?? {};
    const backTo =
      preview.aboveTeam && ctl.team
        ? (ctl.team.row?.team ?? "Laget")
        : (BACK[ctl.tableView] ?? "Tabell");
    return html`
      <button class="recap-back" @click=${() => ctl.closePreview()}>
        <ha-icon icon="mdi:chevron-left"></ha-icon>${backTo}
      </button>
      ${this.head(game)}
      ${busy && !data ? loading("Hämtar matchinfo…", "table") : nothing}
      ${error && !data ? html`<div class="recap-note">${error}</div>` : nothing}
      ${data
        ? html`${this.standing(data)} ${this.form(data)} ${this.meetings(data)} ${this.season(data)}
          ${this.players(data)}`
        : nothing}
    `;
  }

  // ---- The head ---------------------------------------------------------------

  private head(game: Row) {
    const { ctx } = this;
    const { locale, hass } = ctx;
    const when = new Date(game.start ?? "");
    const valid = !Number.isNaN(when.getTime());
    const day = valid
      ? (relativeDay(when, locale) ?? when.toLocaleDateString(locale, { weekday: "long" }))
      : "";
    const meta = [
      game.venue,
      game.round ? `omgång ${game.round}` : null,
    ].filter(Boolean);
    return html`
      ${scoreboard(ctx, {
        home: { code: game.home_code, name: game.home_team, logo: game.home_logo },
        away: { code: game.away_code, name: game.away_team, logo: game.away_logo },
        kind: "upcoming",
        centre: html`
          <span class="sb-status">${day}</span>
          <span class="sb-score pv-time">
            ${valid ? when.toLocaleTimeString(locale, timeFormat(hass)) : "–"}
          </span>
          ${valid ? html`<span class="sb-clock">${when.toLocaleDateString(locale, DATE)}</span>` : nothing}
        `,
        extra: tv(ctx, game.tv_channels),
      })}
      ${meta.length ? html`<div class="recap-meta sb-meta">${meta.join(" · ")}</div>` : nothing}
    `;
  }

  // ---- The table ----------------------------------------------------------------

  private standing(data: Row) {
    const home = data.home?.standing;
    const away = data.away?.standing;
    if (!home || !away) return nothing;
    const perGame = (row: Row) =>
      row.games_played ? Number(row.points) / Number(row.games_played) : null;
    const rows: [string, unknown, unknown, string, "asc" | "desc"][] = [
      ["Placering", home.rank, away.rank, "rank", "asc"],
      ["Poäng", home.points, away.points, "n", "desc"],
      ["Matcher", home.games_played, away.games_played, "plain", "desc"],
      ["Poäng per match", perGame(home), perGame(away), "dec", "desc"],
      ["Målskillnad", home.goal_difference, away.goal_difference, "pm", "desc"],
      [
        "Gjorda – insläppta",
        `${home.goals_for ?? "–"}–${home.goals_against ?? "–"}`,
        `${away.goals_for ?? "–"}–${away.goals_against ?? "–"}`,
        "text",
        "desc",
      ],
    ];
    const shown = (value: unknown, kind: string) =>
      value === null || value === undefined
        ? "–"
        : kind === "rank"
          ? ordinal(Number(value))
          : kind === "dec"
            ? formatStat(value, "dec")
            : kind === "pm"
              ? plus(value)
              : String(value);
    return html`
      <div class="team-section">Tabellen</div>
      <div class="pv-vs">
        ${rows.map(([label, a, b, kind, dir]) => {
          const x = statNumber(a);
          const y = statNumber(b);
          const better =
            kind === "text" || kind === "plain" || x === null || y === null || x === y
              ? null
              : (dir === "asc" ? x < y : x > y)
                ? "home"
                : "away";
          return html`
            <div class="pv-vs-row">
              <span class="pv-vs-value home ${better === "home" ? "lead" : ""}">${shown(a, kind)}</span>
              <span class="pv-vs-label">${label}</span>
              <span class="pv-vs-value away ${better === "away" ? "lead" : ""}">${shown(b, kind)}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  // ---- Form -------------------------------------------------------------------------

  private pips(entries: Row[] | undefined) {
    const { locale } = this.ctx;
    return html`<span class="pv-form">
      ${(entries ?? []).map((game) => {
        const when = new Date(game.start ?? "");
        const date = Number.isNaN(when.getTime())
          ? ""
          : `${when.toLocaleDateString(locale, { day: "numeric", month: "short" })} · `;
        return html`<span
          class="form-pip ${game.result}"
          title=${`${date}${RESULT_LETTER[game.result] ?? ""} ${game.score} ${game.is_home ? "mot" : "borta mot"} ${game.opponent}`}
        ></span>`;
      })}
    </span>`;
  }

  private form(data: Row) {
    if (!data.home?.team_code || !data.away?.team_code) return nothing;
    const sides: [Row, "home" | "away"][] = [
      [data.home, "home"],
      [data.away, "away"],
    ];
    return html`
      <div class="team-section">Form</div>
      <div class="pv-teams">
        ${sides.map(([side, where]) => this.teamCard(side, where))}
      </div>
    `;
  }

  private teamCard(side: Row, where: "home" | "away") {
    if (!side) return nothing;
    const { ctl } = this.ctx;
    // The home side's home games and the away side's away games: the form
    // the game will have them in.
    const venueForm = where === "home" ? side.home_form : side.away_form;
    const venueRecord = where === "home" ? side.home_record : side.away_record;
    const last = side.last_game;
    const fact = (label: string, value: unknown, cls = "") =>
      value === null || value === undefined || value === ""
        ? nothing
        : html`<div class="pv-fact">
            <span class="pv-fact-label">${label}</span>
            <span class="pv-fact-value ${cls}">${value}</span>
          </div>`;
    return html`
      <div class="pv-team" style=${`--club: ${ctl.clubColourOf(side.team_code)}`}>
        <div class="pv-team-head">
          ${badge(side.logo, "pv-crest")}<span class="pv-team-name">${side.team}</span>
        </div>
        ${fact("Senaste 5", side.form?.length ? this.pips(side.form) : null)}
        ${fact(
          where === "home" ? "Hemma" : "Borta",
          venueForm?.length
            ? html`${this.pips(venueForm)}<span class="pv-record">${recordText(venueRecord)}</span>`
            : null,
        )}
        ${fact("Säsongen (V–ÖV–ÖF–F)", recordText(side.record))}
        ${fact("Svit", streakText(side.streak))}
        ${fact(
          "Förra matchen",
          last
            ? `${RESULT_LETTER[last.result] ?? ""} ${String(last.score).replace("-", "–")} mot ${
                last.opponent_name ?? last.opponent
              }`
            : null,
        )}
        ${fact("Vila", restText(side.rest_days), side.rest_days === 1 ? "warn" : "")}
      </div>
    `;
  }

  // ---- Meetings ------------------------------------------------------------------

  private meetings(data: Row) {
    const { ctx } = this;
    const { ctl } = ctx;
    const game: Row = data.game ?? {};
    const preview = ctl.preview ?? {};
    const history: Row = preview.history ?? {};
    const archive: Row[] = history.meetings ?? [];
    const thisSeason: Row[] = (data.meetings ?? []).filter((m: Row) => !m.this_game);
    const earlier = earlierMeetings(data.meetings ?? [], archive, game.start);
    const summary = headToHead(earlier, game.home_code);
    const ours = ctl.teamRef();
    const through = [game.home_code, game.away_code].find((code) => clubKey(code) === clubKey(ours));

    const groups = new Map<string, Row[]>();
    for (const meeting of archive) {
      const series = meeting.series && meeting.series !== meeting.league ? meeting.series : meeting.league;
      const key = `${seasonLabel(meeting.season)} · ${series === "HockeyAllsvenskan" ? "Hockeyallsvenskan" : series}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(meeting);
    }
    const limit = preview.historyMore ? Infinity : HISTORY_SHOWN;
    let left = limit;
    const archiveRows: TemplateResult[] = [];
    for (const [label, games] of groups) {
      if (left <= 0) break;
      archiveRows.push(html`<div class="pv-subhead">${label}</div>`);
      for (const meeting of games.slice(0, left)) {
        archiveRows.push(fixtureRow(ctx, meeting, through, { still: true }));
      }
      left -= games.length;
    }
    const searched = this.searched(history.seasons);

    return html`
      <div class="team-section">Inbördes möten</div>
      ${summary.games ? this.summary(summary, game) : nothing}
      ${thisSeason.length
        ? html`<div class="pv-subhead">Den här säsongen</div>
            ${thisSeason.map((meeting) => fixtureRow(ctx, meeting, through))}`
        : nothing}
      ${history.loading
        ? loading("Hämtar tidigare möten…", "games")
        : history.error
          ? html`<div class="recap-note">Tidigare säsonger gick inte att läsa: ${history.error}</div>`
          : archive.length
            ? html`${archiveRows}
              ${archive.length > HISTORY_SHOWN && !preview.historyMore
                ? html`<button class="stats-more" @click=${() => ctl.setPreview({ historyMore: true })}>
                    Visa fler (${archive.length - HISTORY_SHOWN} till)
                    <ha-icon icon="mdi:chevron-down"></ha-icon>
                  </button>`
                : nothing}`
            : html`<div class="recap-note">
                Inga möten ${searched ? `i ${searched}` : "tidigare säsonger"}.
              </div>`}
      ${archive.length && searched ? html`<div class="pv-source">Tidigare säsonger: ${searched}, ur förbundets arkiv</div>` : nothing}
    `;
  }

  /** "SHL och Hockeyallsvenskan sedan 2021/22", from the seasons searched. */
  private searched(seasons: string[] | undefined): string | null {
    if (!seasons?.length) return null;
    const years = seasons.map((s) => Number(String(s).slice(0, 4))).filter(Boolean);
    const leagues = [...new Set(seasons.map((s) => String(s).split(" ").slice(1).join(" ")))].map(
      (name) => (name === "HockeyAllsvenskan" ? "Hockeyallsvenskan" : name),
    );
    const since = Math.min(...years);
    return `${leagues.join(" och ")} sedan ${since}/${String(since + 1).slice(2)}`;
  }

  /** The two clubs' colours for a pair of bars; a club in the same colour as
   *  the other gives way to grey, or the two bars would read as one. */
  private colours(game: Row): [string, string] {
    const { ctl } = this.ctx;
    const home = ctl.clubColourOf(game.home_code);
    const away = ctl.clubColourOf(game.away_code);
    return [home, away === home ? "var(--secondary-text-color)" : away];
  }

  private summary(summary: ReturnType<typeof headToHead>, game: Row) {
    const [home, away] = this.colours(game);
    const total = summary.wins + summary.losses || 1;
    const share = (n: number) => (n / total) * 100;
    return html`
      <div class="stat pv-h2h">
        <div class="stat-values">
          <span class="stat-value ${summary.wins > summary.losses ? "lead" : ""}">${summary.wins}</span>
          <span class="stat-value ${summary.losses > summary.wins ? "lead" : ""}">${summary.losses}</span>
        </div>
        <div class="bar-track">
          <span class="bar-side home">
            <span class="bar-fill" style=${`width:${share(summary.wins)}%;background:${home}`}></span>
          </span>
          <span class="bar-side away">
            <span
              class="bar-fill"
              style=${`width:${share(summary.losses)}%;background:${away}`}
            ></span>
          </span>
        </div>
        <div class="stat-foot">
          <span class="stat-detail">${summary.goalsFor} mål</span>
          <span class="stat-label">
            Vinster, ${summary.games === 1 ? "senaste mötet" : `${summary.games} senaste mötena`}
          </span>
          <span class="stat-detail">${summary.goalsAgainst} mål</span>
        </div>
      </div>
      ${summary.overtime
        ? html`<div class="pv-source">
            ${summary.overtime === 1
              ? "Ett av mötena avgjordes"
              : `${summary.overtime} av mötena avgjordes`}
            i förlängning eller straffar
          </div>`
        : nothing}
    `;
  }

  // ---- The season in figures -------------------------------------------------

  private teamRows(data: Row): [StatsRow | undefined, StatsRow | undefined, StatsRow[]] {
    const stats = this.ctx.ctl.statsData?.season?.data;
    const teams: StatsRow[] = stats?.teams ?? [];
    const find = (code: unknown) => teams.find((row) => clubKey(row.team_code) === clubKey(code));
    return [find(data.game?.home_code), find(data.game?.away_code), teams];
  }

  private season(data: Row) {
    const { ctl, config } = this.ctx;
    if (config.show_stats === false) return nothing;
    const entry = ctl.statsData?.season;
    if (!entry?.data) {
      return entry?.loading
        ? html`<div class="team-section">Säsongen i siffror</div>${loading("Hämtar statistiken…", "table")}`
        : nothing;
    }
    const [home, away, teams] = this.teamRows(data);
    if (!home || !away) return nothing;
    const [homeColour, awayColour] = this.colours(data.game ?? {});
    const bars = COMPARE.filter(
      (key) => TEAM_METRICS[key] && statNumber(home[key]) !== null && statNumber(away[key]) !== null,
    ).map((key) => this.compare(key, TEAM_METRICS[key], home, away, teams, homeColour, awayColour));
    if (!bars.length) return nothing;
    return html`
      <div class="team-section">Säsongen i siffror</div>
      <div class="stats">${bars}</div>
    `;
  }

  // One figure, the two clubs either side of it: a bar each, the better one
  // lit whichever way better runs, and where each stands in the league.
  private compare(
    key: string,
    metric: Metric,
    home: StatsRow,
    away: StatsRow,
    teams: StatsRow[],
    homeColour: string,
    awayColour: string,
  ) {
    const percent = metric.kind === "pct";
    const a = statNumber(home[key]) as number;
    const b = statNumber(away[key]) as number;
    const total = a + b;
    const share = (value: number) =>
      percent ? Math.min(value, 100) : total ? (value / total) * 100 : 0;
    const asc = metric.dir === "asc";
    const lead = a === b ? null : (asc ? a < b : a > b) ? "home" : "away";
    const { ranked } = rankStats(teams, key, metric);
    const place = (row: StatsRow) => ranked.find((r) => r.row === row)?.rank;
    const where = (row: StatsRow) => {
      const rank = place(row);
      return rank ? `${ordinal(rank)} i ligan` : "";
    };
    return html`
      <div class="stat">
        <div class="stat-values">
          <span class="stat-value ${lead === "home" ? "lead" : ""}">${formatStat(a, metric.kind, true)}</span>
          <span class="stat-value ${lead === "away" ? "lead" : ""}">${formatStat(b, metric.kind, true)}</span>
        </div>
        <div class="bar-track">
          <span class="bar-side home">
            <span class="bar-fill" style=${`width:${share(a)}%;background:${homeColour}`}></span>
          </span>
          <span class="bar-side away">
            <span
              class="bar-fill"
              style=${`width:${share(b)}%;background:${awayColour}`}
            ></span>
          </span>
        </div>
        <div class="stat-foot">
          <span class="stat-detail">${where(home)}</span>
          <span class="stat-label">${metric.label}</span>
          <span class="stat-detail">${where(away)}</span>
        </div>
      </div>
    `;
  }

  // ---- Who to watch ------------------------------------------------------------

  private players(data: Row) {
    const { ctx } = this;
    const { ctl, config } = ctx;
    if (config.show_stats === false) return nothing;
    const stats = ctl.statsData?.season?.data;
    if (!stats) return nothing;
    const skaters: StatsRow[] = stats.skaters ?? [];
    const goalies: StatsRow[] = stats.goalies ?? [];
    const { ranked } = rankStats(skaters, "TP", SKATER_METRICS.TP);
    const boards = [data.game?.home_code, data.game?.away_code].map((code) => {
      const key = clubKey(code);
      const top = ranked.filter(({ row }) => clubKey(row.team_code) === key).slice(0, 3);
      // The goalkeeper who has played most, with enough games behind him to
      // be ranked; else whoever has played most.
      const keepers = goalies
        .filter((row) => clubKey(row.team_code) === key)
        .sort((x, y) => (Number(y.GPI ?? 0) - Number(x.GPI ?? 0)) || (Number(y.ok !== false) - Number(x.ok !== false)));
      return { code, side: code === data.game?.home_code ? data.home : data.away, top, keeper: keepers[0] };
    });
    if (!boards.some((board) => board.top.length || board.keeper)) return nothing;
    return html`
      <div class="team-section">Att hålla ögonen på</div>
      <div class="ts-leaders">
        ${boards.map(
          ({ code, side, top, keeper }) => html`
            <div class="ts-board">
              <span class="ts-board-title">${side?.team ?? code}</span>
              ${top.map(
                ({ row, rank }) => html`
                  <span class="ts-board-row">
                    <span class="lb-name">${playerLink(ctx, row.player, row.team_code)}</span>
                    <span class="lb-value">${row.G ?? 0}+${row.A ?? 0}=${row.TP ?? 0}</span>
                    <span class="ts-board-place">${rank ? ordinal(rank) : "–"}</span>
                  </span>
                `,
              )}
              ${keeper
                ? html`<span class="ts-board-row">
                    <span class="lb-name">${playerLink(ctx, keeper.player, keeper.team_code)}</span>
                    <span class="lb-value">${formatStat(keeper.SVS_perc, "pct", true)}</span>
                    <span class="ts-board-place">MV</span>
                  </span>`
                : nothing}
            </div>
          `,
        )}
      </div>
    `;
  }
}
