/**
 * <hockey-team-view>: one club's page - where it stands, its games, its squad
 * and its statistics against the rest of the league.
 */

import { html, nothing } from "lit";
import { onActivate, PartElement } from "../base";
import { POSITION_GROUPS, ROSTER_SORT } from "../constants";
import { formatStat, ordinal, plus, positionOf, statNumber } from "../format";
import { rankStats, STATS_KINDS, TEAM_METRICS, TEAM_STAT_GROUPS } from "../stats-model";
import { clubKey } from "../teams";
import type { Row, StatsRow } from "../types";
import { badge, form, stat } from "../parts/common";
import { fixtureRow } from "../parts/fixture";
import { playerLink } from "../parts/links";
import { loading } from "../parts/loading";
import { placeClass, statsWho } from "../parts/stats";
import { newsWhen, timeFormat } from "../time";
import { scrollToNext } from "./scroll";

// A squad's figures, each read the way it is said: "184,4 cm".
const SQUAD_FIGURES: [key: string, label: string, unit: string][] = [
  ["height", "Snittlängd", "cm"],
  ["weight", "Snittvikt", "kg"],
  ["age", "Snittålder", "år"],
];
const SQUAD_GROUPS: [key: string, label: string][] = [
  ["gk", "Målvakter"],
  ["d", "Backar"],
  ["f", "Forwards"],
];
const SQUAD_ENDS: [key: string, label: string, unit: string][] = [
  ["tallest", "Längst", "cm"],
  ["shortest", "Kortast", "cm"],
  ["heaviest", "Tyngst", "kg"],
  ["lightest", "Lättast", "kg"],
  ["oldest", "Äldst", "år"],
  ["youngest", "Yngst", "år"],
];

const decimal = (value: unknown, digits = 1) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits).replace(".", ",")
    : "–";

interface Group {
  id: string;
  label: string | null;
  players: Row[];
}

export class HockeyTeamView extends PartElement {
  protected override updated(): void {
    // Reaching back for earlier games moves the list under the reader; put
    // them back at the next game.
    const team = this.ctx.ctl.team;
    if (team?.scrollToNext && team.tab === "schedule" && scrollToNext(this)) {
      this.ctx.ctl.scrolledToNext("team");
    }
  }

  protected override render() {
    const { ctx } = this;
    const { ctl, config } = ctx;
    const team = ctl.team ?? {};
    const { row, error } = team;
    const tab = team.tab ?? "overview";
    const back = html`
      <button class="recap-back" @click=${() => ctl.closeTeam()}>
        <ha-icon icon="mdi:chevron-left"></ha-icon>${ctl.tableView === "live"
          ? "Matcher"
          : ctl.tableView === "schedule"
            ? "Spelschema"
            : ctl.tableView === "stats"
              ? "Statistik"
              : "Tabell"}
      </button>
    `;

    const record =
      row.wins != null && row.losses != null
        ? [row.wins, row.overtime_wins ?? 0, row.overtime_losses ?? 0, row.losses].join("–")
        : null;
    const goals =
      row.goals_for != null && row.goals_against != null
        ? `${row.goals_for}–${row.goals_against}`
        : null;

    return html`
      ${back}
      <div class="hero" style=${`--club: ${ctl.clubColourOf(row.team_code)}`}>
        ${badge(row.logo, "hero-bg")}
        <div class="hero-main">
          ${badge(row.logo, "hero-crest")}
          <div class="hero-titles">
            ${row.rank
              ? html`<span class="hero-kicker as-written">${row.rank}:a i tabellen</span>`
              : nothing}
            <span class="hero-title">${row.team ?? row.team_code}</span>
            ${row.form?.length
              ? html`<span class="hero-form" title="Senaste matcherna">${form(ctx, row.form)}</span>`
              : nothing}
          </div>
          ${row.points != null
            ? html`<div class="hero-big">
                <span class="hero-big-value">${row.points}</span>
                <span class="hero-big-label">poäng</span>
              </div>`
            : nothing}
        </div>
        <div class="hero-stats team-hero-stats">
          ${stat("Matcher", row.games_played)} ${stat("V–ÖV–ÖF–F", record)} ${stat("Mål", goals)}
          ${stat("Målskillnad", plus(row.goal_difference))}
        </div>
      </div>

      <div class="switch team-tabs">
        ${(
          [
            ["overview", "Översikt"],
            ["schedule", "Spelschema"],
            ["roster", "Trupp"],
            config.show_stats !== false && ["stats", "Statistik"],
            ["news", "Nyheter"],
          ].filter(Boolean) as [string, string][]
        ).map(
          ([id, label]) => html`
            <button
              class=${tab === id ? "active" : ""}
              aria-pressed=${tab === id ? "true" : "false"}
              @click=${() => ctl.openTeamTab(id)}
            >
              ${label}
            </button>
          `,
        )}
      </div>

      ${error ? html`<div class="recap-note">${error}</div>` : nothing}
      ${tab === "overview" ? this.overview(team) : nothing}
      ${tab === "schedule" ? this.schedule(team) : nothing}
      ${tab === "roster" ? this.roster(team) : nothing}
      ${tab === "stats" ? this.stats(team) : nothing}
      ${tab === "news" ? this.news(team) : nothing}
    `;
  }

  private overview(team: Row) {
    const { row, next, results, loading: busy } = team;
    if (busy) return loading("Hämtar laget…");
    return html`
      ${next?.length
        ? html`
            <div class="team-section">Nästa matcher</div>
            ${next.map((game: Row) => fixtureRow(this.ctx, game, row.team_code))}
          `
        : nothing}
      ${results?.length
        ? html`
            <div class="team-section">Senaste matcher</div>
            ${results.map((game: Row) => fixtureRow(this.ctx, game, row.team_code))}
          `
        : nothing}
    `;
  }

  private schedule(team: Row) {
    const { row, season, seasonLoading, seasonError, nextIndex, seasonBefore } = team;
    if (seasonLoading) return loading("Hämtar spelschemat…", "games");
    if (seasonError) return html`<div class="recap-note">${seasonError}</div>`;
    if (!season?.length) return html`<div class="recap-note">Inget spelschema.</div>`;
    return [
      seasonBefore
        ? nothing
        : html`
            <button class="schedule-back" @click=${() => this.ctx.ctl.loadTeamSeason(200)}>
              ▲ Visa tidigare matcher
            </button>
          `,
      ...season.map((game: Row, index: number) =>
        fixtureRow(this.ctx, game, row.team_code, { isNext: index === nextIndex }),
      ),
    ];
  }

  // ---- News -------------------------------------------------------------------

  // What the club's own site and the papers have written, newest first. Each
  // opens where it was published; the integration only knows the headline.
  private news(team: Row) {
    const { locale, hass } = this.ctx;
    const { news, newsLoading, newsError } = team;
    if (newsLoading) return loading("Hämtar nyheterna…", "table");
    if (newsError) return html`<div class="recap-note">${newsError}</div>`;
    if (!news?.length) return html`<div class="recap-note">Inga nyheter den senaste månaden.</div>`;
    return html`
      ${news.map(
        (item: Row) => html`
          <a class="news-row" href=${item.url} target="_blank" rel="noopener noreferrer">
            <span class="news-title">${item.title}</span>
            <span class="news-meta"
              >${[item.source, newsWhen(item.published, locale, timeFormat(hass))]
                .filter(Boolean)
                .join(" · ")}</span
            >
          </a>
        `,
      )}
      <div class="pv-source">Från klubbens sajt och tidningarna, via Google News</div>
    `;
  }

  // ---- The squad --------------------------------------------------------------

  // The squad in figures goes above the list, and stays when the list is
  // not to be had: the SHL publishes no player statistics, but its squads
  // can still be measured.
  private roster(team: Row) {
    return html`${this.squad(team.row?.team_code)}${this.rosterList(team)}`;
  }

  private rosterList(team: Row) {
    const { ctl } = this.ctx;
    const { row, roster, rosterLoading, rosterError } = team;
    if (rosterLoading) return loading("Hämtar truppen…", "table");
    if (rosterError) return html`<div class="recap-note">${rosterError}</div>`;
    if (!roster?.length) return html`<div class="recap-note">Ingen trupp.</div>`;

    const grouped = team.group === true;
    const groups: Group[] = grouped
      ? POSITION_GROUPS.map((group) => ({
          ...group,
          players: roster.filter((player: Row) => positionOf(player).group === group.id),
        })).filter((group) => group.players.length)
      : [{ id: "all", label: null, players: roster }];

    return html`
      <div class="switch">
        <button
          class=${grouped ? "" : "active"}
          aria-pressed=${grouped ? "false" : "true"}
          @click=${() => ctl.setTeam({ group: false })}
        >
          Hela truppen
        </button>
        <button
          class=${grouped ? "active" : ""}
          aria-pressed=${grouped ? "true" : "false"}
          @click=${() => ctl.setTeam({ group: true })}
        >
          Per position
        </button>
      </div>
      ${groups.map((group) => this.rosterTable(team, group, row.team_code))}
    `;
  }

  // ---- The squad in figures ------------------------------------------------------

  // Height, weight and age against the other clubs: a place, and a bar from
  // the league's lowest to its highest with the league's average marked.
  // First is the tallest, heaviest or oldest, which is neither good nor bad,
  // so the places are not coloured as the statistics' are.
  private squad(code: string | undefined) {
    const { data, loading: busy } = this.ctx.ctl.squads ?? {};
    if (!data) return busy ? loading("Mäter truppen…", "table") : nothing;
    const teams: Row[] = data.teams ?? [];
    const ours = teams.find((t) => clubKey(t.team_code) === clubKey(code));
    if (!ours?.players) return nothing;
    const league: Row = data.league ?? {};
    const colour = this.ctx.ctl.clubColourOf(code);
    const { left = 0, right = 0 } = ours.shoots ?? {};
    const unknown = ours.players - left - right;
    return html`
      <div class="team-section">Truppen i siffror</div>
      ${SQUAD_FIGURES.map(([key, label, unit]) =>
        this.squadRow(teams, ours, league, key, label, unit, colour),
      )}
      <div class="sq-table">
        <span class="sq-head"></span>
        <span class="sq-head">Antal</span>
        ${SQUAD_FIGURES.map(([, , unit]) => html`<span class="sq-head">${unit}</span>`)}
        ${SQUAD_GROUPS.map(([key, label]) => {
          const group = ours.positions?.[key];
          if (!group?.players) return nothing;
          const theirs = league.positions?.[key] ?? {};
          return html`
            <span class="sq-label">${label}</span>
            <span>${group.players}</span>
            ${SQUAD_FIGURES.map(
              ([figure, name, unit]) =>
                html`<span title=${`${name} i serien: ${decimal(theirs[figure])} ${unit}`}
                  >${decimal(group[figure])}</span
                >`,
            )}
          `;
        })}
      </div>
      <div class="ts-leaders">
        <div class="ts-board">
          <span class="ts-board-title">Ytterligheter</span>
          ${SQUAD_ENDS.map(([key, label, unit]) => {
            const end = ours[key];
            if (!end?.player) return nothing;
            return html`
              <span class="ts-board-row">
                <span class="lb-name"
                  ><span class="sq-end">${label}</span> ${playerLink(
                    this.ctx,
                    end.player,
                    ours.team_code,
                  )}</span
                >
                <span class="lb-value"
                  >${unit === "år" ? decimal(end.value) : end.value} ${unit}</span
                >
              </span>
            `;
          })}
        </div>
        <div class="ts-board">
          <span class="ts-board-title">Ursprung</span>
          ${(ours.countries ?? []).map(
            (country: Row) => html`
              <span class="ts-board-row">
                <span class="lb-name">${country.name ?? country.country}</span>
                <span class="lb-value">${country.players}</span>
              </span>
            `,
          )}
          <span class="ts-board-title sq-subtitle">Fattning</span>
          <span class="ts-board-row">
            <span class="lb-name">Vänster</span><span class="lb-value">${left}</span>
          </span>
          <span class="ts-board-row">
            <span class="lb-name">Höger</span><span class="lb-value">${right}</span>
          </span>
          ${unknown > 0
            ? html`<span class="ts-board-row sq-unknown">
                <span class="lb-name">Okänd</span><span class="lb-value">${unknown}</span>
              </span>`
            : nothing}
        </div>
      </div>
    `;
  }

  private squadRow(
    teams: Row[],
    ours: Row,
    league: Row,
    key: string,
    label: string,
    unit: string,
    colour: string,
  ) {
    const value = ours[key];
    if (typeof value !== "number") return nothing;
    const values = teams.map((t) => t[key]).filter((v): v is number => typeof v === "number");
    const low = Math.min(...values);
    const span = Math.max(...values) - low;
    const along = (v: number) => (span ? Math.min(1, Math.max(0, (v - low) / span)) : 1);
    const mean = typeof league[key] === "number" ? league[key] : null;
    const place = ours.ranks?.[key];
    return html`
      <div class="ts-row" title=${`Serien: ${decimal(mean)} ${unit}`}>
        <span class="ts-label">${label}</span>
        <span class="ts-value">${decimal(value)} ${unit}</span>
        <span class="st-place">${place ? ordinal(place) : ""}</span>
        <span class="ts-track">
          <span
            class="ts-fill"
            style=${`width: ${(along(value) * 100).toFixed(1)}%; background: ${colour}`}
          ></span>
          ${mean !== null
            ? html`<span class="ts-mean" style=${`left: ${(along(mean) * 100).toFixed(1)}%`}></span>`
            : nothing}
        </span>
      </div>
    `;
  }

  // Each table sorts on its own: what a goalkeeper is worth reading by is not
  // what a forward is.
  private rosterTable(team: Row, group: Group, teamCode: string) {
    const { ctl } = this.ctx;
    const sort = team.sorts?.[group.id] ?? ROSTER_SORT;
    const goalies = group.id === "gk";
    const columns = goalies
      ? [
          ["player", "Målvakt"],
          ["GP", "M"],
          ["SVS_perc", "Rädd%"],
          ["SO", "N"],
          ["GAA", "GAA"],
        ]
      : [
          ["player", "Spelare"],
          ["GP", "M"],
          ["G", "Mål"],
          ["A", "A"],
          ["TP", "P"],
        ];
    return html`
      ${group.label ? html`<div class="team-section">${group.label}</div>` : nothing}
      <div class="roster-row head">
        ${columns.map(
          ([key, label]) => html`
            <span
              class="roster-sort ${sort.key === key ? "active" : ""}"
              role="button"
              tabindex="0"
              @click=${() => ctl.sortRoster(group.id, key)}
              @keydown=${onActivate(() => ctl.sortRoster(group.id, key))}
              >${label}${sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span
            >
          `,
        )}
      </div>
      ${this.sorted(group.players, sort, group.id !== "all").map((player) =>
        this.rosterRow(player, teamCode),
      )}
    `;
  }

  private sorted(roster: Row[], sort: { key: string; dir: string }, mixed = false): Row[] {
    const sign = sort.dir === "asc" ? 1 : -1;
    const byName = (a: Row, b: Row) =>
      String(a.player ?? "").localeCompare(String(b.player ?? ""), "sv");
    const compare = (a: Row, b: Row) =>
      sort.key === "player"
        ? sign * byName(a, b)
        : sign * (Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0)) || byName(a, b);
    // In one undivided list the goalkeepers keep to the foot of it: the goals
    // and assists columns carry their save percentage instead, so they have
    // nothing to sort against the skaters with. A table of their own has no
    // such problem.
    if (mixed) return [...roster].sort(compare);
    return [
      ...roster.filter((player) => player.role !== "goalkeeper").sort(compare),
      ...roster.filter((player) => player.role === "goalkeeper").sort(compare),
    ];
  }

  // A goalkeeper is on the same list, but points say nothing about one, so the
  // columns carry their save percentage instead.
  private rosterRow(player: Row, teamCode: string) {
    const goalie = player.role === "goalkeeper";
    const position = positionOf(player);
    return html`
      <div class="roster-row">
        <span class="roster-name">
          ${player.photo
            ? html`<img class="roster-photo" src=${player.photo} alt="" loading="lazy" />`
            : html`<span class="roster-photo empty"></span>`}
          <span class="roster-position ${position.group}" title=${player.position ?? ""}>
            ${position.letter}
          </span>
          <span class="roster-number">${player.jersey ?? ""}</span>
          ${playerLink(this.ctx, player.player, teamCode)}
        </span>
        <span>${player.GP ?? ""}</span>
        ${goalie
          ? html`<span class="roster-goalie">${player.SVS_perc ?? ""}%</span>
              <span>${player.SO ?? ""}</span>
              <span class="roster-points">${player.GAA ?? ""}</span>`
          : html`<span>${player.G ?? ""}</span>
              <span>${player.A ?? ""}</span>
              <span class="roster-points">${player.TP ?? ""}</span>`}
      </div>
    `;
  }

  // ---- The club's statistics --------------------------------------------------

  // Each figure against the other clubs: its place, and a bar from the
  // league's worst to its best with the average marked. Always the season -
  // a club's page is about its season.
  private stats(team: Row) {
    const { ctl } = this.ctx;
    const { data, loading: busy, error } = ctl.statsData?.season ?? {};
    if (!data) {
      return busy || !error
        ? loading("Hämtar statistiken…", "table")
        : html`<div class="recap-note">${error}</div>`;
    }
    const code = team.row?.team_code;
    const teams: StatsRow[] = data.teams ?? [];
    const row = teams.find((t) => clubKey(t.team_code) === clubKey(code));
    if (!row) return html`<div class="recap-note">Ingen statistik för laget.</div>`;
    const colour = ctl.clubColourOf(code);
    return html`
      ${TEAM_STAT_GROUPS.map((group) => {
        const keys = group.keys.filter(
          (key) => TEAM_METRICS[key] && row[key] !== undefined && row[key] !== null,
        );
        if (!keys.length) return nothing;
        return html`
          <div class="team-section">${group.label}</div>
          ${keys.map((key) => this.statRow(teams, row, key, colour))}
        `;
      })}
      ${this.leaders(data, code)}
    `;
  }

  private statRow(teams: StatsRow[], row: StatsRow, key: string, colour: string) {
    const metric = TEAM_METRICS[key];
    const { ranked } = rankStats(teams, key, metric);
    const place = ranked.find((r) => r.row === row)?.rank;
    const values = ranked.map((r) => statNumber(r.row[key]) as number);
    const value = statNumber(row[key]) as number;
    // From the worst to the best, whichever way round better is.
    const best = values[0];
    const worst = values[values.length - 1];
    const span = best - worst;
    const along = (v: number) => (span ? Math.min(1, Math.max(0, (v - worst) / span)) : 1);
    const mean = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    return html`
      <div
        class="ts-row"
        title=${`Ligasnitt ${formatStat(
          mean,
          metric.kind && ["pct", "dec", "crowd"].includes(metric.kind) ? metric.kind : "dec1",
          true,
        )}`}
      >
        <span class="ts-label">${metric.label}</span>
        <span class="ts-value">${formatStat(row[key], metric.kind, true)}</span>
        <span class="st-place ${placeClass(place, teams.length)}"
          >${place ? ordinal(place) : ""}</span
        >
        <span class="ts-track">
          <span
            class="ts-fill"
            style=${`width: ${(along(value) * 100).toFixed(1)}%; background: ${colour}`}
          ></span>
          <span class="ts-mean" style=${`left: ${(along(mean) * 100).toFixed(1)}%`}></span>
        </span>
      </div>
    `;
  }

  // The club's own best at what a player is judged by, each with his place
  // among the whole league.
  private leaders(data: Row, code: string) {
    const key = clubKey(code);
    const boards = (
      [
        ["skaters", "TP"],
        ["skaters", "G"],
        ["skaters", "A"],
        ["skaters", "PlusMinus"],
        ["skaters", "TOI_GP"],
        ["goalies", "SVS_perc"],
      ] as ["skaters" | "goalies", string][]
    )
      .map(([kind, s]) => {
        const metric = STATS_KINDS[kind].metrics[s];
        const { ranked, rest } = rankStats(data?.[kind], s, metric);
        const ours = [...ranked, ...rest]
          .filter(({ row }) => clubKey(row.team_code) === key)
          .slice(0, 3);
        return ours.length ? { kind, stat: s, metric, ours } : null;
      })
      .filter(Boolean) as {
      kind: string;
      stat: string;
      metric: (typeof TEAM_METRICS)[string];
      ours: { row: StatsRow; rank: number | null }[];
    }[];
    if (!boards.length) return nothing;
    return html`
      <div class="team-section">Lagets bästa</div>
      <div class="ts-leaders">
        ${boards.map(
          ({ kind, stat: s, metric, ours }) => html`
            <div class="ts-board">
              <span class="ts-board-title">${metric.label}</span>
              ${ours.map(
                ({ row, rank }) => html`
                  <span class="ts-board-row">
                    <span class="lb-name">${statsWho(this.ctx, kind, row)}</span>
                    <span class="lb-value">${formatStat(row[s], metric.kind, true)}</span>
                    <span class="ts-board-place">${rank ? ordinal(rank) : "–"}</span>
                  </span>
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }
}
