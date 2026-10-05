/** <hockey-events-view>: the live sensor's match log, as the footer's
 *  "Händelser" button opens it. */

import { html } from "lit";
import { PartElement } from "../base";
import { logRow } from "../parts/timeline";

export class HockeyEventsView extends PartElement {
  protected override render() {
    return html`<div class="view-heading">Händelser</div>${(this.ctx.sources.events ?? []).map((e) =>
        logRow(e),
      )}`;
  }
}
