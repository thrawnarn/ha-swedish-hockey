/**
 * <hockey-stats-view>: the league's statistics - the leaders, then every
 * skater, goalkeeper and club in tables that sort - with which games they
 * cover, and whose, in the filter row along the foot.
 */

import { html, nothing } from "lit";
import { onActivate, PartElement } from "../base";
import { POSITION_FILTERS } from "../constants";
import { formatStat, ordinal, positionOf, statNumber } from "../format";
import {
  rankStats,
  SKATER_METRICS,
  STATS_COLUMNS,
  STATS_KINDS,
  STATS_LEADERS,
  STATS_PAGE,
  STATS_SCOPES,
  STATS_SECTIONS,
  TEAM_METRICS,
  type StatsKind,
} from "../stats-model";
import { clubKey } from "../teams";
import { timeFormat } from "../time";
import type { Metric, Ranked, Row, StatsRow } from "../types";
import { badge } from "../parts/common";
import { filterBar, filterSelect, teamButton } from "../parts/filters";
import { loading } from "../parts/loading";
import { placeClass, statsCrest, statsWho } from "../parts/stats";
import { toTop } from "./scroll";

export class HockeyStatsView extends PartElement {
  protected override render() {
    const { ctl } = this.ctx;
    const scope = ctl.statsScope();
    const { data, loading: busy, error } = ctl.statsData?.[scope] ?? {};
    const section = ctl.stats?.section ?? "leaders";
    let body;
    if (!data) {
      body =
        busy || !error
          ? loading("Hämtar statistiken…", section === "leaders" ? "cards" : "table")
          : html`<div class="recap-note">${error}</div>`;
    } else if (section === "leaders") {
      body = this.leaders(data);
    } else {
      body = this.table(section as StatsKind, data);
    }
    return html`
      <div class="switch st-sections">
        ${STATS_SECTIONS.map(
          ([id, label]) => html`
            <button
              class=${section === id ? "active" : ""}
              aria-pressed=${section === id ? "true" : "false"}
              @click=${() => {
                ctl.setStats({ section: id, more: STATS_PAGE });
                toTop(this, ctl.settled());
              }}
            >
              ${label}
            </button>
          `,
        )}
      </div>
      ${error && data ? html`<div class="recap-note">${error}</div>` : nothing}
      ${body} ${this.foot(data)} ${this.bar(section, data, Boolean(busy && data))}
    `;
  }

  // When the figures were read, and where the league keeps the rest.
  private foot(data: Row | undefined) {
    const { locale, hass } = this.ctx;
    const updated = data?.updated ? new Date(data.updated) : null;
    const time =
      updated && !Number.isNaN(updated.getTime())
        ? updated.toLocaleTimeString(locale, timeFormat(hass))
        : null;
    if (!time && !data?.stats_url) return nothing;
    return html`
      <div class="st-foot">
        ${time ? html`<span>Uppdaterad ${time}</span>` : nothing}
        ${data?.stats_url
          ? html`<a class="st-source" href=${data.stats_url} target="_blank" rel="noopener noreferrer"
              >Mer statistik hos ligan
              <ha-icon icon="mdi:open-in-new"></ha-icon
            ></a>`
          : nothing}
      </div>
    `;
  }

  // Which games the figures cover, for every section; and for the lists of
  // players, which clubs and - for skaters - which position. A league that
  // cannot be asked for the last few games says so in its answer, and from
  // then on the choice is not offered. A stale copy being read again runs
  // the row's busy line rather than hiding what is on show.
  private bar(section: string, data: Row | undefined, busy: boolean) {
    const { ctx } = this;
    const { ctl } = ctx;
    const scope = ctl.statsScope();
    const known = Object.values(ctl.statsData ?? {}).find((entry) => entry?.data)?.data;
    const scopes = STATS_SCOPES.filter(
      (s) => !s.needs || known?.scopes?.[s.needs] !== false || s.id === scope,
    );
    const filters = ctl.stats?.filters?.[section] ?? {};
    const players = section === "skaters" || section === "goalies";
    const positions =
      section === "skaters" &&
      (data?.skaters ?? []).some((row: StatsRow) => positionOf(row).group !== "other");
    return filterBar(
      html`
        ${filterSelect(
          "Vilka matcher statistiken gäller",
          scope,
          scopes.map((s) => [s.id, s.label, s.short]),
          (value) => {
            ctl.setStats({ scope: value, more: STATS_PAGE });
            ctl.loadStats(value);
          },
        )}
        ${players && data?.teams?.length
          ? teamButton(ctx, section, ctl.clubsOf(data.teams), filters.teams ?? [])
          : nothing}
        ${positions
          ? filterSelect("Position", filters.position ?? "", POSITION_FILTERS, (value) =>
              ctl.setStatsFilter(section, { position: value || null }),
            )
          : nothing}
      `,
      busy,
    );
  }

  // ---- Leaders --------------------------------------------------------------

  // The followed club first, as the league sees it; then a row of cards for
  // each kind, the best five at each figure, a swipe along to the next.
  private leaders(data: Row) {
    return html`
      ${this.ours(data)}
      ${(Object.entries(STATS_LEADERS) as [StatsKind, string[]][]).map(([kind, keys]) => {
        const cards = keys
          .map((key) => this.leaderCard(kind, key, data))
          .filter((card) => card !== nothing);
        if (!cards.length) return nothing;
        return html`
          <div class="lb-head">
            <span class="team-section">${STATS_KINDS[kind].label}</span>
            <span class="lb-arrows">
              <button
                class="lb-arrow"
                aria-label="Bläddra bakåt"
                @click=${(ev: Event) => this.scrollLeaders(ev, -1)}
              >
                <ha-icon icon="mdi:chevron-left"></ha-icon>
              </button>
              <button
                class="lb-arrow"
                aria-label="Bläddra framåt"
                @click=${(ev: Event) => this.scrollLeaders(ev, 1)}
              >
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            </span>
          </div>
          <div class="lb-track">${cards}</div>
        `;
      })}
    `;
  }

  private scrollLeaders(ev: Event, step: number) {
    const track = (ev.currentTarget as HTMLElement).closest(".lb-head")?.nextElementSibling;
    if (!track) return;
    const card = track.querySelector(".lb-card");
    const width = card ? card.getBoundingClientRect().width + 10 : track.clientWidth * 0.8;
    track.scrollBy({ left: step * width, behavior: "smooth" });
  }

  private leaderCard(kind: StatsKind, key: string, data: Row) {
    const { ctx } = this;
    const metric = STATS_KINDS[kind].metrics[key];
    const { ranked } = rankStats(data?.[kind], key, metric);
    if (!ranked.length) return nothing;
    const ours = clubKey(ctx.ctl.teamRef());
    const [first, ...rest] = ranked.slice(0, 5);
    const self = (row: StatsRow) => (clubKey(row.team_code) === ours ? "self" : "");
    return html`
      <div class="lb-card">
        <button class="lb-title" @click=${() => this.openTable(kind, key)}>
          <span>${metric.label}</span>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
        <div class="lb-top ${self(first.row)}">
          ${kind !== "teams" && first.row.photo
            ? html`<img
                class="lb-photo"
                src=${first.row.photo}
                alt=""
                loading="lazy"
                style=${`--club: ${ctx.ctl.clubColourOf(first.row.team_code)}`}
              />`
            : statsCrest(ctx, first.row.team_code, data, "lb-photo crest")}
          <span class="lb-top-text">
            <span class="lb-top-name">${statsWho(ctx, kind, first.row)}</span>
            <span class="lb-top-team">
              ${kind === "teams"
                ? `${first.row.GP ?? ""} matcher`
                : html`${statsCrest(ctx, first.row.team_code, data, "lb-mini")}${first.row.team ??
                  first.row.team_code}`}
            </span>
          </span>
          <span class="lb-top-value"
            >${formatStat(first.row[key], metric.kind)}${metric.kind === "pct"
              ? html`<span class="lb-unit">%</span>`
              : nothing}</span
          >
        </div>
        ${rest.map(
          ({ row, rank }) => html`
            <div class="lb-row ${self(row)}">
              <span class="lb-rank">${rank}</span>
              ${statsCrest(ctx, row.team_code, data, "lb-crest")}
              <span class="lb-name">${statsWho(ctx, kind, row)}</span>
              <span class="lb-value">${formatStat(row[key], metric.kind, true)}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  // The followed club as the league sees it: where it stands at the figures
  // that say most about a team, and its best player's place among everyone.
  private ours(data: Row) {
    const { ctx } = this;
    const key = clubKey(ctx.ctl.teamRef());
    const teams: StatsRow[] = data?.teams ?? [];
    const row = teams.find((team) => clubKey(team.team_code) === key);
    if (!row) return nothing;
    const tiles = ["PP_perc", "PK_perc", "GF_GP", "GA_GP", "SVS_perc", "FO_perc"]
      .filter((s) => row[s] !== undefined && row[s] !== null)
      .map((s) => {
        const metric = TEAM_METRICS[s];
        const place = rankStats(teams, s, metric).ranked.find((r) => r.row === row)?.rank;
        return { stat: s, metric, place };
      });
    const scorer = rankStats(data?.skaters, "TP", SKATER_METRICS.TP).ranked.find(
      ({ row: player }) => clubKey(player.team_code) === key,
    );
    const open = () => ctx.ctl.openTeamByCode(row.team_code, row.team, row.logo, "stats");
    return html`
      <div
        class="st-ours tappable"
        role="button"
        tabindex="0"
        style=${`--club: ${ctx.ctl.clubColourOf(row.team_code)}`}
        @click=${open}
        @keydown=${onActivate(open)}
      >
        ${badge(row.logo, "hero-bg")}
        <div class="st-ours-head">
          ${badge(row.logo, "st-ours-crest")}
          <span class="st-ours-title">${row.team ?? row.team_code} i ligan</span>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        <div class="st-ours-tiles">
          ${tiles.map(
            ({ stat, metric, place }) => html`
              <span class="st-ours-tile">
                <span class="st-ours-value">${formatStat(row[stat], metric.kind, true)}</span>
                <span class="st-ours-label">${metric.short}</span>
                ${place
                  ? html`<span class="st-place ${placeClass(place, teams.length)}"
                      >${ordinal(place)}</span
                    >`
                  : nothing}
              </span>
            `,
          )}
        </div>
        ${scorer
          ? html`<div class="st-ours-foot">
              Bäst i laget: ${scorer.row.player}, ${scorer.row.TP} poäng –
              ${ordinal(scorer.rank as number)} i ligan
            </div>`
          : nothing}
      </div>
    `;
  }

  // ---- Tables ---------------------------------------------------------------

  // From a leader card into the whole list, sorted on what the card was for
  // and with the columns that figure is in.
  private openTable(kind: StatsKind, key: string) {
    const { ctl } = this.ctx;
    const groups = STATS_COLUMNS[kind];
    const group = groups.find((g) => g.columns.includes(key)) ?? groups[0];
    ctl.setStats({
      section: kind,
      groups: { ...(ctl.stats?.groups ?? {}), [kind]: group.id },
      sorts: { ...(ctl.stats?.sorts ?? {}), [kind]: { key } },
      more: STATS_PAGE,
    });
    toTop(this, ctl.settled());
  }

  private table(kind: StatsKind, data: Row) {
    const { ctx } = this;
    const { ctl } = ctx;
    const metrics = STATS_KINDS[kind].metrics;
    const all: StatsRow[] = data?.[kind] ?? [];
    const has = (key: string) => all.some((row) => row[key] !== undefined && row[key] !== null);
    // A league that does not publish a figure loses its column, and a group
    // with nothing left in it goes too.
    const groups = STATS_COLUMNS[kind]
      .map((group) => ({ ...group, columns: group.columns.filter(has) }))
      .filter((group) => group.columns.length);
    if (!all.length || !groups.length) {
      return html`<div class="recap-note">Ingen statistik.</div>`;
    }
    const group = groups.find((g) => g.id === ctl.stats?.groups?.[kind]) ?? groups[0];
    const { columns } = group;

    // Sorted on what was asked for while it is on screen, else on what the
    // group is about. Tapping a heading again turns the order round.
    const asked = ctl.stats?.sorts?.[kind];
    const key =
      asked && columns.includes(asked.key)
        ? asked.key
        : columns.includes(group.sort)
          ? group.sort
          : columns[0];
    const metric: Partial<Metric> = metrics[key] ?? {};
    const natural = metric.dir ?? "desc";
    const dir = asked?.key === key && asked.dir ? asked.dir : natural;

    // Places are always the league's - best first, among every club -
    // however the list is turned or narrowed, so a club's own players keep
    // the places they hold in the league and the leader is 1 from either end.
    const filters = ctl.stats?.filters?.[kind] ?? {};
    const teams = new Set(filters.teams ?? []);
    const keep = (row: StatsRow) =>
      (!teams.size || teams.has(clubKey(row.team_code))) &&
      (!filters.position || positionOf(row).group === filters.position);
    const league = rankStats(all, key, metric, natural);
    const ranked = league.ranked.filter(({ row }) => keep(row));
    const rest = league.rest.filter(({ row }) => keep(row));
    const missing: Ranked[] = all
      .filter((row) => keep(row) && statNumber(row[key]) === null)
      .map((row) => ({ row, rank: null }));
    let list: Ranked[] = [...ranked, ...rest];
    if (dir !== natural) list = [...ranked].reverse().concat([...rest].reverse());
    list = list.concat(missing);
    const limit = ctl.stats?.more ?? STATS_PAGE;
    const shown = list.slice(0, limit);
    const firstShort = rest.length ? ranked.length : -1;

    // The followed club stands out in a list of everyone; in a list of
    // nobody else there is nothing for it to stand out from.
    const ours = teams.size === 1 ? null : clubKey(ctl.teamRef());
    const width = (k: string) =>
      ({ time: "3.2em", pct: "3.2em", dec: "3em", dec1: "3em", crowd: "3.8em" } as Record<string, string>)[
        metrics[k]?.kind ?? ""
      ] ?? "2.4em";
    const grid = `grid-template-columns: 1.7em minmax(0, 1fr) ${columns.map(width).join(" ")}`;
    const sortBy = (column: string) => {
      const columnNatural = metrics[column]?.dir ?? "desc";
      const next = column === key ? (dir === "asc" ? "desc" : "asc") : columnNatural;
      ctl.setStats({
        sorts: { ...(ctl.stats?.sorts ?? {}), [kind]: { key: column, dir: next } },
      });
    };

    return html`
      ${groups.length > 1
        ? html`<div class="st-groups" role="toolbar" aria-label="Kolumner">
            ${groups.map(
              (g) => html`
                <button
                  class="filter-chip ${g.id === group.id ? "active" : ""}"
                  aria-pressed=${g.id === group.id ? "true" : "false"}
                  @click=${() =>
                    ctl.setStats({
                      groups: { ...(ctl.stats?.groups ?? {}), [kind]: g.id },
                    })}
                >
                  ${g.label}
                </button>
              `,
            )}
          </div>`
        : nothing}
      <div class="st-table">
        <div class="st-row head" style=${grid}>
          <span>#</span>
          <span>${kind === "teams" ? "Lag" : kind === "goalies" ? "Målvakt" : "Spelare"}</span>
          ${columns.map(
            (column) => html`
              <span
                class="roster-sort ${column === key ? "active" : ""}"
                role="button"
                tabindex="0"
                title=${metrics[column]?.label ?? column}
                @click=${() => sortBy(column)}
                @keydown=${onActivate(() => sortBy(column))}
                >${metrics[column]?.short ?? column}${column === key
                  ? html`<span class="st-arrow">${dir === "asc" ? "▲" : "▼"}</span>`
                  : nothing}</span
              >
            `,
          )}
        </div>
        ${shown.map(
          ({ row, rank }, index) => html`
            ${index === firstShort && dir === natural
              ? html`<div class="st-short">
                  Under ligans gräns för att rankas i ${(metric.label ?? "").toLowerCase()}
                </div>`
              : nothing}
            <div
              class="st-row ${clubKey(row.team_code) === ours ? "self" : ""} ${rank === null
                ? "unranked"
                : ""}"
              style=${grid}
            >
              <span class="st-rank">${rank ?? ""}</span>
              <span class="st-name">
                ${statsCrest(ctx, row.team_code, data, "st-crest")} ${statsWho(ctx, kind, row)}
              </span>
              ${columns.map(
                (column) => html`<span class=${column === key ? "sorted" : ""}
                  >${formatStat(row[column], metrics[column]?.kind)}</span
                >`,
              )}
            </div>
          `,
        )}
      </div>
      ${list.length ? nothing : html`<div class="recap-note">Ingen i urvalet.</div>`}
      ${list.length > shown.length
        ? html`<button
            class="stats-more st-more"
            @click=${() => ctl.setStats({ more: limit + STATS_PAGE * 2 })}
          >
            Visa fler (${list.length - shown.length} till)
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </button>`
        : nothing}
      <div class="st-legend">
        ${columns.map((column) => `${metrics[column]?.short} ${metrics[column]?.label}`).join(" · ")}
      </div>
    `;
  }
}

