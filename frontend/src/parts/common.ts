/** Small pieces drawn all over the card: crests, stat tiles, form, TV. */

import { html, nothing } from "lit";
import { SHORT_DATE } from "../constants";
import type { Ctx } from "../context";
import type { Row } from "../types";

/** A crest, or an empty box the same size where there is none. */
export function badge(src: string | null | undefined, cls: string) {
  return src
    ? html`<img class=${cls} src=${src} alt="" loading="lazy" />`
    : html`<div class=${`${cls} placeholder`}></div>`;
}

export function stat(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return nothing;
  return html`
    <div class="stat">
      <span class="stat-value">${value}</span>
      <span class="stat-label">${label}</span>
    </div>
  `;
}

// Five games of form, oldest first. Overtime is kept apart from regulation:
// a win there is worth less and a loss there is not worth nothing.
export function form(ctx: Ctx, games: Row[] | undefined) {
  return (games ?? []).map((game) => {
    const when = new Date(game.start ?? "");
    const date = Number.isNaN(when.getTime())
      ? ""
      : `${when.toLocaleDateString(ctx.locale, SHORT_DATE)} · `;
    return html`<span
      class="form-pip ${game.result}"
      title=${`${date}${game.is_home ? "" : "borta "}${game.opponent} ${game.score}${
        game.decided_in && game.decided_in !== "FT" ? ` (${game.decided_in})` : ""
      }`}
    ></span>`;
  });
}

/** How far a club has moved in the live table. */
export function move(change: number | null | undefined) {
  if (!change) return nothing;
  const up = change > 0;
  return html`<span class="move ${up ? "up" : "down"}"
    >${up ? "▲" : "▼"}${Math.abs(change)}</span
  >`;
}

// Where to watch, from tv.nu: the broadcast channel first, then streaming.
// Absent until tv.nu lists the game, which it does about a week ahead.
export function tv(ctx: Ctx, channels: unknown) {
  if (ctx.config.show_tv === false) return nothing;
  if (!Array.isArray(channels) || !channels.length) return nothing;
  const text = channels.join(" · ");
  return html`<div class="tv" title=${text}>
    <ha-icon icon="mdi:television-classic"></ha-icon><span>${text}</span>
  </div>`;
}
