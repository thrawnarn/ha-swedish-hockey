/**
 * <hockey-league-view>: the league - today's games, the table, the schedule
 * and the statistics - under a switch between them.
 *
 * Where the dialog has its tab bar the tabs choose the view, and the switch
 * is hidden for a heading; the card's dialog on a wide screen has no tab
 * bar, and the switch is how it gets around. Its Live button only exists
 * while something is being played.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import type { TableView } from "../controller";

export class HockeyLeagueView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const { ctl, config, sources } = ctx;
    const view = ctl.tableView ?? "table";
    const tab = (id: TableView, label: string, badge: number | null = null) => html`
      <button
        class=${view === id ? "active" : ""}
        aria-pressed=${view === id ? "true" : "false"}
        @click=${() => ctl.showTableView(id)}
      >
        ${label}${badge ? html`<span class="switch-badge">${badge}</span>` : nothing}
      </button>
    `;
    return html`
      <div class="switch section-switch">
        ${sources.liveGames ? tab("live", "Live", sources.liveGames) : nothing}
        ${tab("table", "Tabell")} ${tab("schedule", "Spelschema")}
        ${config.show_stats !== false ? tab("stats", "Statistik") : nothing}
      </div>
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
