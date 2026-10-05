/** Pieces of the statistics shared by the Statistik tab, a club's page and a
 *  player's page. */

import { html } from "lit";
import { onActivate } from "../base";
import type { Ctx } from "../context";
import { shortName } from "../format";
import { clubKey } from "../teams";
import type { Row, StatsRow } from "../types";
import { playerLink } from "./links";

// A club's crest, from the statistics' own club rows or the table.
export function statsLogo(ctx: Ctx, code: unknown, data: Row | undefined): string | null {
  const key = clubKey(code);
  const row = (data?.teams ?? []).find((team: Row) => clubKey(team.team_code) === key);
  return row?.logo ?? ctx.ctl.crestOf(code);
}

export function statsCrest(ctx: Ctx, code: unknown, data: Row | undefined, cls: string) {
  const logo = statsLogo(ctx, code, data);
  return logo
    ? html`<img class=${cls} src=${logo} alt="" loading="lazy" />`
    : html`<span class=${cls}></span>`;
}

// Who a row is about, leading to them: a player to his page, a club to its
// statistics. A narrow column takes "T. Kelleher" for "Tyler Kelleher".
export function statsWho(ctx: Ctx, kind: string, row: StatsRow) {
  if (kind === "teams") {
    const open = (ev: Event) => {
      ev.stopPropagation();
      ctx.ctl.openTeamByCode(row.team_code, row.team, row.logo, "stats");
    };
    return html`<span
      class="player-link"
      role="button"
      tabindex="0"
      @click=${open}
      @keydown=${onActivate(open)}
      >${row.team ?? row.team_code}</span
    >`;
  }
  return playerLink(
    ctx,
    row.player,
    row.team_code,
    html`<span class="full-name">${row.player}</span><span class="short-name"
        >${shortName(row.player)}</span
      >`,
  );
}

// A place near the top of the league reads green, near the foot red.
export function placeClass(place: number | null | undefined, count: number): string {
  if (!place || !count) return "";
  if (place <= Math.max(1, Math.round(count / 4))) return "top";
  if (place > count - Math.max(1, Math.round(count / 4))) return "bottom";
  return "";
}
