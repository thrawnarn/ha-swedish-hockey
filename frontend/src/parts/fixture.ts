/** One line of a schedule: when, who, and the score once there is one. */

import { html, nothing, type TemplateResult } from "lit";
import { onActivate } from "../base";
import { SHORT_DATE } from "../constants";
import type { Ctx } from "../context";
import { clubKey } from "../teams";
import { timeFormat } from "../time";
import type { Game } from "../types";
import { teamLink } from "./links";
import { hasOdds, oddsLine } from "./odds";

export interface FixtureOptions {
  isNext?: boolean;
  hideDate?: boolean;
  markSelf?: boolean;
  live?: boolean;
  /** A row that opens nothing: a game from the archive has no summary to
   *  read back. */
  still?: boolean;
}

// A result row already knows whose win it was; a fixture is written from no
// team's point of view, so the club whose page this is decides.
export function outcomeFor(game: Game, teamCode: string | null | undefined, played: boolean) {
  if (!played || !teamCode) return null;
  const ours = clubKey(teamCode);
  const home = clubKey(game.home_code) === ours;
  if (!home && clubKey(game.away_code) !== ours) return null;
  const mine = Number(home ? game.home_score : game.away_score);
  const theirs = Number(home ? game.away_score : game.home_score);
  return mine === theirs ? null : mine > theirs;
}

// A game that has been played opens its own summary; one still to come opens
// its preview.
export function fixtureRow(
  ctx: Ctx,
  game: Game,
  teamCode: string | null | undefined,
  options: FixtureOptions = {},
) {
  const { isNext = false, hideDate = false, markSelf = false, live = false, still = false } = options;
  const { locale, hass, ctl } = ctx;
  const when = new Date(game.start ?? "");
  const played = game.home_score !== null && game.home_score !== undefined;
  const extra = game.decided_in && game.decided_in !== "FT" ? game.decided_in : "";
  // In a league-wide list there is no club to see the game through, and no
  // colour for how it went.
  const won = game.won ?? outcomeFor(game, teamCode, played);
  // A recap is read through one of the sides; with no club in mind, the home
  // side does as well as any.
  const through = teamCode || game.home_code;
  const ours = clubKey(ctl.teamRef());
  const self =
    markSelf && (clubKey(game.home_code) === ours || clubKey(game.away_code) === ours);
  // Two lines, a side each, with its goals at the end: the side ahead reads
  // in full and the other one steps back.
  const home = Number(game.home_score);
  const away = Number(game.away_score);
  const lead = !played || home === away ? null : home > away ? "home" : "away";
  const outcome = won === true ? "won" : won === false ? "lost" : "";
  // Under the sides: where it is played, and on which channel while it is
  // still to come.
  const meta: TemplateResult[] = [];
  if (game.venue) meta.push(html`<span>${game.venue}</span>`);
  if ((!played || live) && game.tv_channels?.length && ctx.config.show_tv !== false) {
    meta.push(html`<span class="fixture-tv">
      <ha-icon icon="mdi:television-classic"></ha-icon>${game.tv_channels.join(" · ")}
    </span>`);
  }
  // A game still to come has the bookmaker's odds once betting has opened.
  const odds = !played && hasOdds(ctx, game.odds) ? game.odds : null;
  const tappable = !still && (played || Boolean(game.game_id));
  const open = played ? () => ctl.loadRecap(game, through) : () => ctl.openPreview(game);
  return html`
    <div
      class="fixture-row ${isNext ? "next" : ""} ${tappable ? "tappable" : ""} ${self ? "self" : ""}"
      role=${tappable ? "button" : nothing}
      tabindex=${tappable ? "0" : nothing}
      title=${tappable && !played ? "Inför matchen" : nothing}
      @click=${tappable ? open : nothing}
      @keydown=${tappable ? onActivate(open) : nothing}
    >
      <span class="fixture-when">
        ${live && game.in_progress
          ? html`<span class="fixture-live"><span class="playing"></span>P${game.period ?? ""}</span>`
          : Number.isNaN(when.getTime())
            ? ""
            : hideDate
              ? when.toLocaleTimeString(locale, timeFormat(hass))
              : html`${when.toLocaleDateString(locale, SHORT_DATE)}<span class="fixture-clock"
                    >${when.toLocaleTimeString(locale, timeFormat(hass))}</span
                  >`}
      </span>
      <span class="fixture-side home ${lead === "home" ? "lead" : ""}">
        ${teamLink(ctx, game.home_code, game.home_team, game.home_logo)}
      </span>
      <span class="fixture-goals home ${lead === "home" ? "lead" : ""} ${outcome}">
        ${played ? game.home_score : ""}
      </span>
      <span class="fixture-side away ${lead === "away" ? "lead" : ""}">
        ${teamLink(ctx, game.away_code, game.away_team, game.away_logo)}
      </span>
      <span class="fixture-goals away ${lead === "away" ? "lead" : ""} ${outcome}">
        ${played ? game.away_score : ""}
      </span>
      ${meta.length || extra || game.highlight || odds
        ? html`<span class="fixture-meta">
            <span class="fixture-detail">${meta}</span>
            <span class="fixture-extra">
              ${odds ? oddsLine(ctx, odds) : nothing} ${extra}
              ${game.highlight
                ? html`<a
                    class="fixture-clip"
                    href=${game.highlight.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Höjdpunkter"
                    @click=${(ev: Event) => ev.stopPropagation()}
                    ><ha-icon icon="mdi:play-circle-outline"></ha-icon></a
                  >`
                : nothing}
            </span>
          </span>`
        : nothing}
    </div>
  `;
}
