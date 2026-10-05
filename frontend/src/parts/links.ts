/** Clubs and players wherever they are named: each leads to its own page. */

import { html, nothing, type TemplateResult } from "lit";
import { onActivate } from "../base";
import type { Ctx } from "../context";

// A club wherever it is named in a list: crest and name, both leading to
// that club's page.
export function teamLink(ctx: Ctx, code: string | undefined, name?: string, logo?: string) {
  const label = name ?? code ?? "";
  if (!code) return html`<span class="fixture-team">${label}</span>`;
  const open = () => ctx.ctl.openTeamByCode(code, name, logo);
  return html`<span
    class="fixture-team tappable"
    role="button"
    tabindex="0"
    title=${`Visa ${label}`}
    @click=${(ev: Event) => {
      ev.stopPropagation();
      open();
    }}
    @keydown=${onActivate((ev) => {
      ev.stopPropagation();
      open();
    })}
    >${logo ? html`<img class="fixture-logo" src=${logo} alt="" loading="lazy" />` : nothing}${label}</span
  >`;
}

// Scorers and assists both lead to the player behind them.
export function playerLink(
  ctx: Ctx,
  name: string | null | undefined,
  teamCode: string | undefined,
  label: string | TemplateResult | null | undefined = name,
) {
  if (!name) return nothing;
  const open = () => ctx.ctl.openPlayer(name, teamCode);
  return html`<span
    class="player-link"
    role="button"
    tabindex="0"
    @click=${(ev: Event) => {
      ev.stopPropagation();
      open();
    }}
    @keydown=${onActivate((ev) => {
      ev.stopPropagation();
      open();
    })}
    >${label}</span
  >`;
}
