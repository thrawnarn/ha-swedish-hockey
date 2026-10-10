/**
 * <hockey-player-view>: a player's season - who he is, what he has put up,
 * and where each figure puts him in the league.
 */

import { html, nothing } from "lit";
import { onActivate, PartElement } from "../base";
import { formatStat, ordinal, plus } from "../format";
import { rankStats, STATS_KINDS } from "../stats-model";
import type { Row } from "../types";
import { clubKey } from "../teams";
import { badge, stat } from "../parts/common";
import { loading } from "../parts/loading";

export class HockeyPlayerView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const { ctl, config } = ctx;
    const { name, jersey, data, loading: busy, error } = ctl.player ?? {};
    const back = html`
      <button class="recap-back" @click=${() => ctl.closePlayer()}>
        <ha-icon icon="mdi:chevron-left"></ha-icon>${ctl.recap
          ? "Sammanfattning"
          : ctl.previewOnTop()
            ? "Inför matchen"
            : (ctl.team?.row?.team ?? (ctl.tableView === "stats" ? "Statistik" : "Tillbaka"))}
      </button>
    `;
    if (busy) return html`${back}${loading("Hämtar spelaren…", "hero")}`;
    if (error) return html`${back}<div class="recap-note">${error}</div>`;

    const stats: Row = data?.stats ?? {};
    const player: Row = data?.player ?? {};
    const profile: Row | null = data?.profile ?? null;
    const goalie = player.role === "goalkeeper";
    const shirt = profile?.jersey ?? jersey;
    // Everything the league knows about him that is not a number he has put up.
    const facts = profile
      ? [
          profile.age ? `${profile.age} år` : null,
          profile.height ? `${profile.height} cm` : null,
          profile.weight ? `${profile.weight} kg` : null,
          ({ L: "vänsterfattad", R: "högerfattad" } as Record<string, string>)[profile.shoots] ?? null,
          profile.country,
        ].filter(Boolean)
      : [];
    // The three that say most about a season go big in the header; the rest
    // are tiles beneath it.
    const headline: [string, unknown][] = goalie
      ? [
          ["Räddning %", stats.SVS_perc],
          ["Insläppta/match", stats.GAA],
          ["Matcher", stats.GP],
        ]
      : [
          ["Mål", stats.G],
          ["Assist", stats.A],
          ["Poäng", stats.TP],
        ];
    const tiles: [string, unknown][] = goalie
      ? [
          ["Räddningar", stats.SVS],
          ["Vinster", stats.W],
          ["Förluster", stats.L],
          ["Nollor", stats.SO],
          ["Speltid", stats.MIP],
        ]
      : [
          ["Matcher", stats.GP],
          ["+/-", plus(stats.PlusMinus)],
          ["Utv. min", stats.PIM],
          ["Skott", stats.SOG],
          ["Istid/match", stats.TOI_GP],
        ];

    const teamCode = ctl.player?.teamCode;
    const crest = ctl.crestOf(teamCode, player.team);
    const position = profile?.position ?? (goalie ? "Målvakt" : null);
    const enlarge = () => {
      ctl.photo = profile?.photo_large ?? profile?.photo;
    };
    return html`
      ${back}
      <div class="hero player-hero" style=${`--club: ${ctl.clubColourOf(teamCode)}`}>
        ${badge(crest, "hero-bg")}
        ${shirt ? html`<span class="hero-jersey" aria-hidden="true">${shirt}</span>` : nothing}
        <div class="hero-main">
          ${profile?.photo
            ? html`<img
                class="hero-photo"
                src=${profile.photo}
                alt=""
                loading="lazy"
                role="button"
                tabindex="0"
                title="Visa större"
                @click=${enlarge}
                @keydown=${onActivate(enlarge)}
              />`
            : html`<span class="hero-photo hero-shirt">${shirt ?? "?"}</span>`}
          <div class="hero-titles">
            ${position ? html`<span class="hero-kicker">${position}</span>` : nothing}
            <span class="hero-title">${player.name ?? name}</span>
            <span class="hero-sub">
              ${crest ? html`<img class="hero-mini-crest" src=${crest} alt="" />` : nothing}
              ${player.team ?? ""}${shirt ? ` · #${shirt}` : ""}
            </span>
            ${facts.length ? html`<span class="player-facts">${facts.join(" · ")}</span>` : nothing}
          </div>
        </div>
        ${headline.some(([, value]) => value !== null && value !== undefined && value !== "")
          ? html`<div class="hero-stats hero-headline">
              ${headline.map(([label, value]) => stat(label, value))}
            </div>`
          : nothing}
      </div>
      ${profile?.youth_team
        ? html`<div class="player-youth">Moderklubb: ${profile.youth_team}</div>`
        : nothing}
      ${this.earlierClubs(data?.career, teamCode, player.team)}
      <div class="team-stats player-stats">${tiles.map(([label, value]) => stat(label, value))}</div>
      ${config.show_stats !== false ? this.league(player.name ?? name, teamCode, goalie) : nothing}
      ${this.career(data?.career, goalie)}
    `;
  }

  // The clubs he has played for before this one, the latest first. A club is
  // his present one under any of its codes or its name: the career's code is
  // the stats system's, which is not always the schedule's.
  private earlierClubs(career: Row[] | undefined, teamCode: string, teamName: string) {
    const present = new Set([clubKey(teamCode), clubKey(teamName)].filter(Boolean));
    const seen = new Set<string>();
    const clubs: Row[] = [];
    for (const row of career ?? []) {
      const keys = [row.team_code, row.stat_net_team, row.team].map(clubKey);
      if (keys.some((key) => present.has(key))) continue;
      const key = clubKey(row.team);
      if (seen.has(key)) continue;
      seen.add(key);
      clubs.push(row);
    }
    if (!clubs.length) return nothing;
    return html`<div class="player-clubs">
      <span class="player-clubs-label">Tidigare klubbar:</span>
      ${clubs.map(
        (club) => html`<span class="player-club"
          >${club.logo ? html`<img src=${club.logo} alt="" loading="lazy" />` : nothing}${club.team}</span
        >`,
      )}
    </div>`;
  }

  // Season by season, as far back as the league's records go: the Swedish
  // leagues only, so a season abroad or in junior hockey is simply missing.
  private career(career: Row[] | undefined, goalie: boolean) {
    if (!career?.length) return nothing;
    const columns: [string, string][] = goalie
      ? [["GP", "M"], ["SVS_perc", "Rädd%"], ["GAA", "GAA"]]
      : [["GP", "M"], ["G", "Mål"], ["A", "Ass"], ["TP", "P"]];
    const cell = (row: Row, key: string) => {
      const value = row[key];
      if (value === null || value === undefined || value === "") return "–";
      return key === "SVS_perc" ? Number(value).toFixed(1) : value;
    };
    let previous: number | null = null;
    return html`
      <div class="team-section">Karriär</div>
      <div class="career ${goalie ? "goalie" : ""}">
        <div class="career-row head">
          <span>Säsong</span><span class="career-club">Klubb</span>
          ${columns.map(([, label]) => html`<span>${label}</span>`)}
        </div>
        ${career.map((row) => {
          // The season is written once, on its first line.
          const first = row.season !== previous;
          previous = row.season;
          return html`<div class="career-row ${first ? "new-season" : ""}">
            <span class="career-season">${first ? seasonLabel(row.season) : ""}</span>
            <span class="career-club">
              ${row.logo
                ? html`<img class="career-logo" src=${row.logo} alt="" loading="lazy" />`
                : html`<span class="career-logo"></span>`}
              <span class="career-names">
                <span class="career-team">${row.team}</span>
                ${row.competition ? html`<span class="career-comp">${row.competition}</span>` : nothing}
              </span>
            </span>
            ${columns.map(([key]) => html`<span class=${key === "TP" ? "career-points" : ""}>${cell(row, key)}</span>`)}
          </div>`;
        })}
      </div>
    `;
  }

  // The player's row in the league's statistics, once they have been read:
  // the figures his own read does not carry, and where each puts him.
  private league(name: string, teamCode: string, goalie: boolean) {
    const { ctl } = this.ctx;
    const row = ctl.playerStatsRow(name, teamCode, goalie);
    if (!row) return nothing;
    const kind = goalie ? "goalies" : "skaters";
    const rows = ctl.statsData?.season?.data?.[kind] ?? [];
    const metrics = STATS_KINDS[kind].metrics;
    const keys = goalie
      ? ["SVS_perc", "GAA", "SO", "W", "EV_SVS_perc", "PK_SVS_perc"]
      : ["TP", "G", "A", "TP_GP", "PPP", "GWG", "S_perc", "FO_perc", "Hits", "BKS", "PPTOI_GP", "CF_perc"];
    // What he does best first: ordered by how far up the league each figure
    // puts him, the ones he is not ranked at last.
    const items = keys
      .filter((key) => row[key] !== undefined && row[key] !== null)
      .map((key, index) => {
        const { ranked } = rankStats(rows, key, metrics[key]);
        const place = ranked.find((r) => r.row === row)?.rank;
        return { key, place, share: place ? place / ranked.length : 2, index };
      })
      .sort((x, y) => x.share - y.share || x.index - y.index);
    if (!items.length) return nothing;
    return html`
      <div class="team-section">I ligan</div>
      <div class="lr-grid">
        ${items.map(
          ({ key, place }) => html`
            <div class="lr-tile">
              <span class="lr-value">${formatStat(row[key], metrics[key].kind, true)}</span>
              <span class="lr-label">${metrics[key].label}</span>
              <span class="st-place ${place && place <= 10 ? "top" : ""}"
                >${place ? `${ordinal(place)} i ligan` : "Ej rankad"}</span
              >
            </div>
          `,
        )}
      </div>
    `;
  }
}

// A season goes by the year it began in; on screen it is both years, "25/26".
function seasonLabel(season: number): string {
  const two = (year: number) => String(year % 100).padStart(2, "0");
  return `${two(season)}/${two(season + 1)}`;
}
