/**
 * <hockey-table-view>: the league table - live while games are played, or
 * over the last few games - with its choices in the filter row beneath.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { TABLE_PERIODS } from "../constants";
import type { TableRow } from "../types";
import { filterBar, filterSelect } from "../parts/filters";
import { loading } from "../parts/loading";
import { tableRows } from "../parts/standings";

export class HockeyTableView extends PartElement {
  // The live table counts whatever is being played right now into the
  // official one. It only exists while a game is on, and the toggle with it.
  // Which of the two tables is being shown: the live one whenever there is
  // one, unless it has been switched off in the filter row.
  private liveOn(liveTable: TableRow[] | null): boolean {
    return liveTable != null && this.ctx.ctl.liveTable !== false;
  }

  protected override render() {
    const { ctx } = this;
    const { ctl, sources } = ctx;
    const { table, liveTable } = sources;
    const live = this.liveOn(liveTable);
    return html`
      ${ctl.trend?.last ? this.trend() : tableRows(ctx, live ? liveTable : table, live)}
      ${filterBar(html`
        ${filterSelect("Tabellens omfattning", String(ctl.trend?.last ?? 0), TABLE_PERIODS, (value) =>
          ctl.loadTrend(Number(value)),
        )}
        ${liveTable != null && !ctl.trend?.last ? this.liveToggle(liveTable) : nothing}
      `)}
    `;
  }

  private trend() {
    const { loading: busy, error, table } = this.ctx.ctl.trend ?? {};
    if (busy) return loading("Räknar formtabell…", "table");
    if (error) return html`<div class="recap-note">${error}</div>`;
    if (!table?.length) return html`<div class="recap-note">Inga spelade matcher.</div>`;
    return tableRows(this.ctx, table);
  }

  // The live/official switch sits beside the period in the filter row, out
  // of the way of the standings themselves.
  private liveToggle(liveTable: TableRow[] | null) {
    const live = this.liveOn(liveTable);
    return html`
      <button
        class="filter-chip live-chip ${live ? "active" : ""}"
        aria-pressed=${live ? "true" : "false"}
        title=${live ? "Med pågående matcher" : "Officiella tabellen"}
        @click=${() => {
          this.ctx.ctl.liveTable = !live;
        }}
      >
        <span class="live-dot"></span>Live
      </button>
    `;
  }
}
