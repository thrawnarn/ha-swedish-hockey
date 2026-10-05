/** The league table, a row per club. */

import { html, nothing } from "lit";
import { onActivate } from "../base";
import type { Ctx } from "../context";
import { isCut, plus, zoneOf } from "../format";
import type { TableRow } from "../types";
import { form, move } from "./common";

export function tableRows(ctx: Ctx, table: TableRow[] | null | undefined, live = false) {
  return html`
    <div class="table">
      <div class="table-row head">
        <span>#</span><span>Lag</span><span>M</span><span>+/-</span><span>P</span>
        <span class="table-form">Form</span>
      </div>
      ${(table ?? []).map((r) => {
        const open = () => ctx.ctl.openTeam(r);
        return html`
          <div
            class="table-row tappable ${r.is_self ? "self" : ""} ${isCut(r.rank)
              ? "cut"
              : ""} zone-${zoneOf(r.rank) ?? "none"}"
            role="button"
            tabindex="0"
            @click=${open}
            @keydown=${onActivate(open)}
          >
            <span class="table-rank">
              ${r.rank ?? ""}${live ? move(r.rank_change) : nothing}
            </span>
            <span class="table-team">
              ${r.logo
                ? html`<img class="table-logo" src=${r.logo} alt="" loading="lazy" />`
                : html`<span class="table-logo"></span>`}
              <span class="table-name">${r.team ?? r.team_code}</span>
              ${live && r.live ? html`<span class="playing" title="Spelar nu"></span>` : nothing}
            </span>
            <span>${r.games_played ?? ""}</span>
            <span>${plus(r.goal_difference)}</span>
            <span class="table-points">${r.points ?? ""}</span>
            <span class="table-form">${form(ctx, r.form)}</span>
          </div>
        `;
      })}
    </div>
  `;
}
