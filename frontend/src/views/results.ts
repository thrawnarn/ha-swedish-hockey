/**
 * <hockey-results-view>: the team's earlier games. The sensor's five are
 * drawn at once; the service's ten, with their clips, replace them when they
 * arrive.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { fixtureRow } from "../parts/fixture";

export class HockeyResultsView extends PartElement {
  protected override render() {
    const { ctx } = this;
    const { ctl } = ctx;
    return html`<div class="view-heading">Tidigare matcher</div>
      ${(ctl.results?.games ?? ctx.sources.results ?? []).map((game: any) =>
        fixtureRow(ctx, game, ctl.teamRef()),
      )}
      ${ctl.results?.error ? html`<div class="recap-note">${ctl.results.error}</div>` : nothing}`;
  }
}
