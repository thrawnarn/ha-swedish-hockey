/**
 * <hockey-recap-view>: a game's summary - the score, how it went, the clip,
 * the figures and everything that happened - read back from the league when a
 * played game is tapped.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { DECIDED_IN } from "../constants";
import { crowd, periodLabel } from "../format";
import { dayTitle } from "../time";
import type { Row } from "../types";
import { loading } from "../parts/loading";
import { scoreboard } from "../parts/scoreboard";
import { squadCompare } from "../parts/squads";
import { statBars } from "../parts/stat-bars";
import { timeline } from "../parts/timeline";

export class HockeyRecapView extends PartElement {
  private dayTitle(offset: number): string {
    return dayTitle(this.ctx.ctl.dayDate(offset), offset, this.ctx.locale);
  }


  protected override render() {
    const { ctx } = this;
    const { ctl, locale } = ctx;
    const { row, data, error, loading: busy } = ctl.recap ?? {};
    const back = html`
      <button class="recap-back" @click=${() => ctl.closeRecap()}>
        <ha-icon icon="mdi:chevron-left"></ha-icon>${ctl.previewOnTop()
          ? "Inför matchen"
          : ctl.team
          ? (ctl.team.row?.team ?? "Laget")
          : ctl.tableView === "live"
            ? this.dayTitle(ctl.day ?? 0)
            : "Tidigare matcher"}
      </button>
    `;
    if (busy) return html`${back}${loading("Hämtar matchen…", "hero")}`;
    if (error) return html`${back}<div class="recap-note">${error}</div>`;

    const game: Row = data?.game ?? {};
    const events: Row[] = Array.isArray(data?.events) ? data.events : [];
    const shots = data?.shots;
    const when = new Date(game.start ?? row?.start ?? "");
    const decidedIn = data?.decided_in ?? game.decided_in;
    // With the league's play-by-play down, the goals come from the game
    // record instead: the right teams and periods, but no scorer, no clock
    // and nothing else counted. Worth saying so rather than looking broken.
    const sparse =
      events.length > 0 &&
      events.every((event) => !event.player) &&
      !shots &&
      !(data?.stats?.length > 0);
    // A game being played has no result to report, so the period stands in
    // for it: the score above it is the one being played to.
    const live = game.in_progress
      ? game.intermission
        ? "Paus"
        : periodLabel(game.period) || "Pågår"
      : null;
    const meta = [
      Number.isNaN(when.getTime())
        ? null
        : when.toLocaleDateString(locale, { day: "numeric", month: "long" }),
      game.round ? `omgång ${game.round}` : null,
      game.venue,
      game.attendance ? `${crowd(game.attendance)} åskådare` : null,
    ].filter(Boolean);

    return html`
      ${back}
      ${scoreboard(ctx, {
        home: { code: game.home_code, name: game.home_team, logo: game.home_logo, score: game.home_score },
        away: { code: game.away_code, name: game.away_team, logo: game.away_logo, score: game.away_score },
        playing: Boolean(game.in_progress),
        status: game.won === true ? "Vinst" : game.won === false ? "Förlust" : "Slutresultat",
        outcome: game.in_progress ? "" : game.won === true ? "won" : game.won === false ? "lost" : "",
        clock: live ?? DECIDED_IN[decidedIn] ?? null,
        periodScores: data?.period_scores,
      })}
      ${meta.length ? html`<div class="recap-meta sb-meta">${meta.join(" · ")}</div>` : nothing}
      ${data?.highlight
        ? html`
            <a class="recap-highlight" href=${data.highlight.url} target="_blank" rel="noopener noreferrer">
              ${data.highlight.thumbnail
                ? html`<span class="recap-highlight-thumb">
                    <img src=${data.highlight.thumbnail} alt="" loading="lazy" />
                    <span class="highlight-play">▶</span>
                  </span>`
                : html`<span class="highlight-play">▶</span>`}
              <span class="recap-highlight-text">
                <span class="recap-highlight-title">Höjdpunkter</span>
                ${data.highlight.heading || data.highlight.subheading
                  ? html`<span class="log-detail">
                      ${[data.highlight.heading, data.highlight.subheading].filter(Boolean).join(" · ")}
                    </span>`
                  : nothing}
              </span>
            </a>
          `
        : nothing}
      ${statBars(ctx, data?.stats, game)}
      ${events.length
        ? html`${sparse
              ? html`<div class="recap-note">
                  Målen kommer från matchprotokollet – den detaljerade rapporten saknas just nu.
                </div>`
              : nothing}${timeline(ctx, events)}`
        : html`<div class="recap-note">Inget i protokollet.</div>`}
      ${squadCompare(ctx, game.home_code, game.away_code)}
    `;
  }
}
