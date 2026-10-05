/** The head of a game, being played or over. */

import { html, nothing, type TemplateResult } from "lit";
import { onActivate } from "../base";
import type { Ctx } from "../context";
import { badge } from "./common";

export interface Side {
  code?: string;
  name?: string;
  logo?: string;
  score?: unknown;
}

export interface ScoreboardOptions {
  home: Side;
  away: Side;
  playing?: boolean;
  status?: string | null;
  outcome?: string;
  clock?: string | null;
  periodScores?: unknown;
  extra?: TemplateResult | typeof nothing;
}

// The two clubs either side of the score, their crests faded in behind. Over
// the score is what kind of score it is - LIVE, or how it went for the team -
// and under it the period being played, or how a finished game was decided.
export function scoreboard(ctx: Ctx, options: ScoreboardOptions) {
  const {
    home,
    away,
    playing = false,
    status = null,
    outcome = "",
    clock = null,
    periodScores = null,
    extra = nothing,
  } = options;
  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  const side = (team: Side, mine: number, theirs: number) => {
    const open = () => ctx.ctl.openTeamByCode(team.code as string, team.name, team.logo);
    return html`
      <div
        class="sb-team ${team.code ? "tappable" : ""} ${mine > theirs ? "lead" : ""}"
        role=${team.code ? "button" : nothing}
        tabindex=${team.code ? "0" : nothing}
        title=${team.code ? `Visa ${team.name ?? team.code}` : nothing}
        @click=${team.code ? open : nothing}
        @keydown=${team.code ? onActivate(open) : nothing}
      >
        ${badge(team.logo, "sb-crest")}
        <span class="sb-name">${team.name ?? team.code ?? ""}</span>
      </div>
    `;
  };
  const shown = (value: unknown) =>
    value === null || value === undefined || value === "" ? "–" : value;
  return html`
    <div class="scoreboard ${playing ? "playing-now" : "over"} ${outcome}">
      ${badge(home.logo, "sb-bg home")}
      ${badge(away.logo, "sb-bg away")}
      <div class="sb-row">
        ${side(home, homeScore, awayScore)}
        <div class="sb-centre">
          <span class="sb-status">
            ${playing ? html`<span class="dot"></span>LIVE` : status}
          </span>
          <span class="sb-score">
            <span class=${homeScore > awayScore ? "lead" : ""}>${shown(home.score)}</span>
            <span class="sb-dash">–</span>
            <span class=${awayScore > homeScore ? "lead" : ""}>${shown(away.score)}</span>
          </span>
          ${clock ? html`<span class="sb-clock">${clock}</span>` : nothing}
          ${periodScoresLine(periodScores)}
        </div>
        ${side(away, awayScore, homeScore)}
      </div>
      ${extra}
    </div>
  `;
}

// Goals period by period, home first, from the federation's sheet.
function periodScoresLine(scores: unknown) {
  if (!Array.isArray(scores) || scores.length < 2) return nothing;
  return html`<span class="sb-periods" title="Mål per period">
    ${scores.map((score) => String(score).replace("-", "–")).join(" · ")}
  </span>`;
}
