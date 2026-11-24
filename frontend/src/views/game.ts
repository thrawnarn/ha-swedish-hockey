/**
 * <hockey-game-view>: the game being played, read straight off the live
 * sensor: it is pushed to the card on every change, so the score in the header
 * moves without a fetch. Once the whistle has gone the sensor keeps the
 * final, and the header says so instead of LIVE.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { periodLabel } from "../format";
import { clubKey } from "../teams";
import type { Row } from "../types";
import { tv } from "../parts/common";
import { scoreboard } from "../parts/scoreboard";
import { squadCompare } from "../parts/squads";
import { statBars } from "../parts/stat-bars";
import { timeline } from "../parts/timeline";

export class HockeyGameView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const { ctl } = ctx;
    const live = ctl.state(ctl.ids.live);
    const a: Row = live?.attributes ?? {};
    if (!live || !a.home_team) {
      return html`<div class="recap-note">Ingen match pågår.</div>`;
    }
    const [home, away] = String(live.state ?? "").split("-");
    const playing = a.in_progress === true;
    const period = periodLabel(a.period);
    const status = playing
      ? [a.intermission ? `Paus efter ${period.toLowerCase()}` : period, a.intermission ? "" : a.clock]
          .filter(Boolean)
          .join(" · ")
      : a.decided_in && a.decided_in !== "FT"
        ? `Slut (${a.decided_in})`
        : "Slut";
    const pp = a.powerplay;
    const shots = a.shots;
    // The sensor carries the pairs ready made, with the federation's sheet in
    // them; the shots alone are the fallback for a sensor from before that.
    const stats =
      Array.isArray(a.stats) && a.stats.length
        ? a.stats
        : shots
          ? [
              { key: "shots_on_goal", home: shots.home, away: shots.away },
              shots.home_total || shots.away_total
                ? { key: "shot_attempts", home: shots.home_total, away: shots.away_total }
                : null,
              shots.home_blocked || shots.away_blocked
                ? { key: "blocked", home: shots.home_blocked, away: shots.away_blocked }
                : null,
            ].filter((s) => s && Number(s.home ?? 0) + Number(s.away ?? 0) > 0)
          : [];
    // The sensor does not mark which goals were ours; the club it follows is
    // the home side when is_home says so.
    const ours = clubKey(a.is_home ? a.home_code : a.away_code);
    const events = (Array.isArray(a.events) ? a.events : []).map((event: Row) => ({
      ...event,
      ours: clubKey(event.team_code) === ours,
    }));
    return html`
      ${scoreboard(ctx, {
        home: { code: a.home_code, name: a.home_team, logo: a.home_logo, score: home },
        away: { code: a.away_code, name: a.away_team, logo: a.away_logo, score: away },
        playing,
        status: playing ? null : status,
        clock: playing ? status : null,
        periodScores: a.period_scores,
        extra: html`
          ${playing && pp
            ? html`<div class="sb-pp" title=${pp.until ? `Till ${pp.until}` : nothing}>
                Powerplay ${pp.team_name ?? ""} ${pp.advantage ?? ""}
              </div>`
            : nothing}
          ${tv(ctx, a.tv_channels)}
        `,
      })}
      ${statBars(ctx, stats as Row[], a)}
      ${events.length ? timeline(ctx, events) : html`<div class="recap-note">Inget har hänt än.</div>`}
      ${squadCompare(ctx, a.home_code, a.away_code)}
    `;
  }
}
