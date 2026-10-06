/**
 * <hockey-league-view>: the league - today's games, the table, the schedule
 * or the statistics, whichever the dialog's tabs have chosen.
 *
 * It used to carry a switch of its own along the top, for the card's dialog
 * on a wide screen, which had no tabs; the tabs are down the side there now,
 * so the tabs choose the view everywhere.
 */

import { html } from "lit";
import { PartElement } from "../base";

export class HockeyLeagueView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const view = ctx.ctl.tableView ?? "table";
    return html`
      ${view === "live"
        ? html`<hockey-today-view .ctx=${ctx}></hockey-today-view>`
        : view === "schedule"
          ? html`<hockey-schedule-view .ctx=${ctx}></hockey-schedule-view>`
          : view === "stats"
            ? html`<hockey-stats-view .ctx=${ctx}></hockey-stats-view>`
            : html`<hockey-table-view .ctx=${ctx}></hockey-table-view>`}
    `;
  }
}
