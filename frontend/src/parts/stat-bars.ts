/** A game's statistics, one bar per figure split between the two sides. */

import { html, nothing } from "lit";
import { KEY_STATS, STAT_LABELS } from "../constants";
import type { Ctx } from "../context";
import { clubColour } from "../format";
import type { Row } from "../types";

// Each stat as one bar split between the sides, so who had the better of it
// reads without doing the arithmetic. Everything counted from the events;
// face-offs and hits are not in either league's feed, so they are not here.
// Shots and penalty minutes say most about a game at a glance; the rest
// waits behind a button, so the match log is not pushed off the screen.
export function statBars(ctx: Ctx, stats: Row[] | undefined | null, game: Row = {}) {
  if (!stats?.length) return nothing;
  const { ctl } = ctx;
  const home = clubColour(game.home_color, "var(--primary-color)");
  const away = clubColour(game.away_color, "var(--secondary-text-color)");
  const first = stats.filter((s) => KEY_STATS.has(s.key));
  const rest = stats.filter((s) => !KEY_STATS.has(s.key));
  // A game with none of the key stats shows what it has rather than a
  // button and nothing above it.
  const shown = ctl.statsOpen || !first.length ? stats : first;
  return html`
    <div class="stats">
      ${shown.map((s) => statBar(s, home, away))}
      ${first.length && rest.length
        ? html`<button
            class="stats-more"
            aria-expanded=${ctl.statsOpen ? "true" : "false"}
            @click=${() => {
              ctl.statsOpen = !ctl.statsOpen;
            }}
          >
            ${ctl.statsOpen ? "Visa mindre" : `Visa mer statistik (${rest.length})`}
            <ha-icon icon=${ctl.statsOpen ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>
          </button>`
        : nothing}
    </div>
  `;
}

// Two scales, as a league's own stat sheet uses: a count is drawn against
// the two sides added together, a percentage against a hundred. Drawing a
// percentage against the pair would make 14% against 33% look like a third
// of the bar, which is not what either number means.
function statBar(s: Row, homeColour: string, awayColour: string) {
  const percent = s.kind === "percent";
  const home = Number(s.home ?? 0);
  const away = Number(s.away ?? 0);
  const total = home + away;
  const share = (value: number) =>
    percent ? Math.min(value, 100) : total ? (value / total) * 100 : 0;
  const shown = (value: number) => (percent ? `${value.toFixed(1).replace(".", ",")} %` : value);
  return html`
    <div class="stat">
      <div class="stat-values">
        <span class="stat-value ${home > away ? "lead" : ""}">${shown(home)}</span>
        <span class="stat-value ${away > home ? "lead" : ""}">${shown(away)}</span>
      </div>
      <div class="bar-track">
        <span class="bar-side home">
          <span class="bar-fill" style=${`width:${share(home)}%;background:${homeColour}`}></span>
        </span>
        <span class="bar-side away">
          <span class="bar-fill" style=${`width:${share(away)}%;background:${awayColour}`}></span>
        </span>
      </div>
      <div class="stat-foot">
        <span class="stat-detail">${s.home_detail ?? ""}</span>
        <span class="stat-label">${STAT_LABELS[s.key] ?? s.key}</span>
        <span class="stat-detail">${s.away_detail ?? ""}</span>
      </div>
    </div>
  `;
}
