/** Svenska Spel's odds on a game still to come. */

import { html, nothing } from "lit";
import type { Ctx } from "../context";
import { formatOdds, impliedChances } from "../format";
import type { Row } from "../types";

/** Whether a game has odds to show, and the card is showing odds. */
export function hasOdds(ctx: Ctx, odds: Row | null | undefined): odds is Row {
  return (
    ctx.config.show_odds !== false &&
    Boolean(odds) &&
    [odds!.home, odds!.draw, odds!.away].every((price) => Number(price) > 0)
  );
}

const title = (odds: Row) =>
  `Odds från ${odds.source ?? "Svenska Spel"}${odds.market ? `, ${odds.market.toLowerCase()}` : ""}`;

/** The three prices on one line: 1 1,38  X 5,80  2 6,75. */
export function oddsLine(ctx: Ctx, odds: Row | null | undefined, cls = "odds") {
  if (!hasOdds(ctx, odds)) return nothing;
  return html`<span class=${cls} title=${title(odds)}>
    <span class="odds-mark">1</span> ${formatOdds(odds.home)}
    <span class="odds-mark">X</span> ${formatOdds(odds.draw)}
    <span class="odds-mark">2</span> ${formatOdds(odds.away)}
  </span>`;
}

/** The three outcomes as tiles, each with what its price says its chance is. */
export function oddsBlock(ctx: Ctx, game: Row) {
  const odds = game.odds;
  if (!hasOdds(ctx, odds)) return nothing;
  const chances = impliedChances([odds.home, odds.draw, odds.away]);
  const tiles: [string, string, unknown, number][] = [
    ["1", game.home_team ?? "Hemma", odds.home, chances[0]],
    ["X", "Oavgjort", odds.draw, chances[1]],
    ["2", game.away_team ?? "Borta", odds.away, chances[2]],
  ];
  const favourite = Math.max(...chances);
  return html`
    <div class="pv-odds" title=${title(odds)}>
      ${tiles.map(
        ([mark, label, price, chance]) => html`
          <div class="pv-odds-tile ${chance === favourite ? "favourite" : ""}">
            <span class="pv-odds-label"><span class="odds-mark">${mark}</span> ${label}</span>
            <span class="pv-odds-price">${formatOdds(price)}</span>
            <span class="pv-odds-chance">${chance} %</span>
          </div>
        `,
      )}
    </div>
    <div class="pv-source">
      Odds från ${odds.source ?? "Svenska Spel"}${odds.market ? `, ${odds.market.toLowerCase()}` : ""}.
      Procenten är vad oddsen säger om chansen, med spelbolagets marginal borträknad.
    </div>
  `;
}
