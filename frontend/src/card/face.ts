/**
 * The card's face: the two clubs either side of the score, the next game or
 * the result, and the buttons along its foot.
 */

import { html, nothing } from "lit";
import { onActivate } from "../base";
import { DATE, WEEKDAY } from "../constants";
import type { BarButton, Ctx, Sources } from "../context";
import type { EntityIds, HassEntity, Row } from "../types";
import { relativeDay, timeFormat } from "../time";
import { badge, tv } from "../parts/common";

export function resultIsRecent(result: Row | null, hours: number): boolean {
  if (!result || !(hours > 0)) return false;
  // The schedule carries the real end time; fall back to three hours after
  // puck drop, which is about when a game with overtime is done.
  const ended = result.ended_at
    ? new Date(result.ended_at).getTime()
    : result.start
      ? new Date(result.start).getTime() + 3 * 3600e3
      : NaN;
  if (Number.isNaN(ended)) return false;
  return Date.now() - ended < hours * 3600e3;
}

// Either side of the fixture leads to that club's page. The code is what is
// acted on - the same club is printed as "Leksand" in one payload and
// "Leksands IF" in the next, so the name is only ever the label.
export function sideButton(ctx: Ctx, code?: string, name?: string, logo?: string) {
  const side = html`
    ${badge(logo, "crest")}
    <div class="team-name">${name ?? ""}</div>
  `;
  if (!code) return html`<div class="team">${side}</div>`;
  const open = () => ctx.ctl.openTeamByCode(code, name, logo);
  return html`
    <div
      class="team tappable"
      role="button"
      tabindex="0"
      title=${`Visa ${name ?? code}`}
      @click=${open}
      @keydown=${onActivate(open)}
    >
      ${side}
    </div>
  `;
}

export function liveMiddle(ctx: Ctx, stateObj: HassEntity) {
  const a = stateObj.attributes ?? {};
  const period = a.period ? String(a.period).replace(/^P/i, "") : null;
  const pp = a.powerplay;
  const showPp = ctx.config.show_powerplay !== false;
  // Between periods the clock is frozen on the last event of the period that
  // has just ended, so say what is actually happening instead.
  const state = a.intermission ? "Paus" : ctx.config.show_clock !== false ? (a.clock ?? "") : "";
  return html`
    <div class="live-badge"><span class="dot"></span>LIVE</div>
    <div class="score">${stateObj.state}</div>
    ${shots(ctx, stateObj)}
    ${period || state
      ? html`<div class="period">
          ${period ? `Period ${period}` : ""}${period && state ? " · " : ""}${state}
        </div>`
      : nothing}
    ${showPp && pp
      ? html`<div class="pp" title=${`Till ${pp.until ?? ""}`}>
          ${pp.advantage} ${pp.team_name ?? ""}
        </div>`
      : nothing}
    ${tv(ctx, a.tv_channels)}
  `;
}

export function resultMiddle(ctx: Ctx, result: Row | null, live: HassEntity | undefined) {
  if (!result) return nothing;
  const won = result.won;
  const extra = result.decided_in && result.decided_in !== "FT" ? result.decided_in : null;
  return html`
    <div class="final ${won === true ? "won" : won === false ? "lost" : ""}">
      ${won === true ? "VINST" : won === false ? "FÖRLUST" : "SLUTRESULTAT"}
    </div>
    <div class="score">${result.score}</div>
    ${shots(ctx, live)}
    ${extra ? html`<div class="period">${extra}</div>` : nothing}
  `;
}

export function nextMiddle(ctx: Ctx, stateObj: HassEntity | undefined) {
  const start = new Date(stateObj?.state ?? "");
  if (!stateObj || Number.isNaN(start.getTime())) {
    return html`<div class="score">-</div>`;
  }
  const { locale } = ctx;
  const a = stateObj.attributes ?? {};
  return html`
    <div class="kickoff">${start.toLocaleTimeString(locale, timeFormat(ctx.hass))}</div>
    <div class="weekday">
      ${relativeDay(start, locale) ?? start.toLocaleDateString(locale, WEEKDAY)}
    </div>
    <div class="date">${start.toLocaleDateString(locale, DATE)}</div>
    ${a.venue ? html`<div class="venue">${a.venue}</div>` : nothing}
    ${tv(ctx, a.tv_channels)}
  `;
}

// Shots only ever come from the live sensor, so a held result shows the
// numbers of the game that has just finished - the same source the event log
// behind the footer button uses.
export function shots(ctx: Ctx, stateObj: HassEntity | undefined) {
  if (ctx.config.show_shots === false) return nothing;
  const s = stateObj?.attributes?.shots;
  if (!s) return nothing;
  const home = Number(s.home ?? 0);
  const away = Number(s.away ?? 0);
  if (!(home + away > 0)) return nothing;
  const homeTotal = Number(s.home_total ?? 0);
  const awayTotal = Number(s.away_total ?? 0);
  const a = stateObj?.attributes ?? {};
  const sides = `${a.home_code ?? a.home_team ?? "hemma"} ${home} - ${a.away_code ?? a.away_team ?? "borta"} ${away}`;
  const title =
    homeTotal || awayTotal
      ? `Skott på mål: ${sides}. Skottförsök ${homeTotal}-${awayTotal}`
      : `Skott på mål: ${sides}`;
  return html`<div class="shots" title=${title}>(skott ${home}-${away})</div>`;
}

export function lastGoal(stateObj: HassEntity) {
  const a = stateObj.attributes ?? {};
  const scorer = a.last_goal_scorer;
  const team = a.last_goal_team;
  if (!scorer && !team) return nothing;
  const assists: string[] = Array.isArray(a.last_goal_assists) ? a.last_goal_assists : [];
  // PP is a power play goal, BP one scored a man down.
  const strength = a.last_goal_strength;
  const code = a.last_goal_team_code;
  return html`
    <div class="footer">
      <div class="footer-line">
        ${a.last_goal_time ? html`<span class="clock">${a.last_goal_time}</span>` : nothing}
        <span>
          ${code && scorer ? html`<span class="log-team">${code}</span>` : nothing}${scorer || team}
        </span>
        ${strength
          ? html`<span class="strength" title=${strength === "PP" ? "Powerplaymål" : "Boxplaymål"}
              >(${strength})</span
            >`
          : nothing}
      </div>
      ${assists.length ? html`<div class="assists">${assists.join(", ")}</div>` : nothing}
    </div>
  `;
}

/** What the footer offers, and the data behind each view. The badge asks the
 *  same question to fill the row of buttons along the top of its dialog. */
export function barButtons(
  ctx: Pick<Ctx, "config" | "ctl">,
  live: HassEntity | undefined,
  ids: EntityIds,
  showResult: boolean,
  next: HassEntity | undefined,
): { buttons: BarButton[]; sources: Sources } {
  const cfg = ctx.config;
  // The log stays available on a held result - you have just watched it.
  const events = showResult ? live?.attributes?.events : null;
  const results = next?.attributes?.recent_results;
  const standings = ctx.ctl.state(ids.standings)?.attributes;
  const table = standings?.table;
  // Published only while games are being played, so its presence is what
  // says there is anything to toggle between.
  const liveTable = standings?.live_table;
  const hasLive = Array.isArray(liveTable) && liveTable.length > 0;

  const liveGames = Number(standings?.live_games ?? 0);
  const buttons = (
    [
      {
        id: "live",
        side: "left",
        icon: "mdi:broadcast",
        label: "Live",
        badge: liveGames ? String(liveGames) : null,
        show: liveGames > 0,
      },
      {
        id: "events",
        side: "left",
        icon: "mdi:hockey-puck",
        label: "Händelser",
        badge: Array.isArray(events) && events.length ? String(events.length) : null,
        show: cfg.show_events !== false && Array.isArray(events) && events.length > 0,
      },
      {
        id: "table",
        side: "right",
        icon: "mdi:podium",
        label: "Tabell",
        badge: hasLive ? "LIVE" : null,
        show: cfg.show_table !== false && ((Array.isArray(table) && table.length > 0) || hasLive),
      },
      {
        id: "results",
        side: "right",
        icon: "mdi:history",
        label: "Tidigare",
        badge: null,
        show: cfg.show_results !== false && Array.isArray(results) && results.length > 0,
      },
    ] as BarButton[]
  ).filter((b) => b.show);

  return {
    buttons,
    sources: { events, table, liveTable: hasLive ? liveTable : null, results, liveGames },
  };
}

export function barButton(ctx: Ctx, b: BarButton) {
  return html`
    <button
      class="bar-button"
      aria-haspopup="dialog"
      @click=${() => ctx.ctl.openBarButton(b.id)}
    >
      <ha-icon icon=${b.icon}></ha-icon>
      <span>${b.label}</span>
      ${b.badge ? html`<span class="bar-badge">${b.badge}</span>` : nothing}
    </button>
  `;
}

export function footer(ctx: Ctx, buttons: BarButton[]) {
  if (!buttons.length) return nothing;
  return html`<div class="footer-bar">
    <div class="bar-group">
      ${buttons.filter((b) => b.side === "left").map((b) => barButton(ctx, b))}
    </div>
    <div class="bar-group">
      ${buttons.filter((b) => b.side === "right").map((b) => barButton(ctx, b))}
    </div>
  </div>`;
}
