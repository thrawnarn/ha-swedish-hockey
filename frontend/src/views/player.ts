/**
 * <hockey-player-view>: a player's season - who he is, what he has put up,
 * and where each figure puts him in the league.
 */

import { html, nothing } from "lit";
import { onActivate, PartElement } from "../base";
import { formatStat, ordinal, plus } from "../format";
import { rankStats, STATS_KINDS } from "../stats-model";
import type { Row } from "../types";
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
      <div class="team-stats player-stats">${tiles.map(([label, value]) => stat(label, value))}</div>
      ${config.show_stats !== false ? this.league(player.name ?? name, teamCode, goalie) : nothing}
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
