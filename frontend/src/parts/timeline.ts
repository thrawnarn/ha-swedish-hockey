/** What happened in a game, period by period. */

import { html, nothing, type TemplateResult } from "lit";
import type { Ctx } from "../context";
import { periodLabel, recapIcon } from "../format";
import type { Row } from "../types";
import { playerLink } from "./links";

export function timeline(ctx: Ctx, events: Row[]) {
  const rows: TemplateResult[] = [];
  let period: unknown = null;
  for (const event of events) {
    if (event.period !== period) {
      rows.push(html`
        <div class="team-section ${period === null ? "" : "cut"}">
          ${periodLabel(event.period)}
        </div>
      `);
      period = event.period;
    }
    rows.push(recapEvent(ctx, event));
  }
  return rows;
}

// One row per event, whatever it was. A goal carries the score it made and
// who assisted; a penalty or a shootout attempt carries what it was. The
// shootout is stamped 00:00 throughout, so its clock is left off.
function recapEvent(ctx: Ctx, event: Row) {
  const icon = recapIcon(event);
  const goal = event.kind === "goal";
  const assists: string[] = Array.isArray(event.assists) ? event.assists : [];
  return html`
    <div class="log-row ${goal && event.ours ? "goal" : ""}">
      <span class="log-time">
        ${event.kind === "penalty_shot"
          ? ""
          : `${event.period ? `P${event.period}` : ""} ${event.time ?? ""}`}
      </span>
      <span class="log-icon">${icon}</span>
      <span class="log-text">
        <span class="log-main">
          ${goal && event.score ? `${event.score.replace("-", "–")} ` : ""}<span class="log-team"
            >${event.team_code ?? event.team_name ?? ""}</span
          >${playerLink(ctx, event.player, event.team_code)}${goal && event.strength
            ? ` (${event.strength})`
            : ""}
        </span>
        ${goal
          ? assists.length
            ? html`<span class="log-detail">
                ${assists.map(
                  (name, index) => html`${index ? ", " : ""}${playerLink(ctx, name, event.team_code)}`,
                )}
              </span>`
            : nothing
          : event.detail
            ? html`<span class="log-detail">${event.detail}</span>`
            : nothing}
      </span>
    </div>
  `;
}

const LOG_ICON: Record<string, string> = {
  goal: "🚨",
  penalty: "🟨",
  penalty_shot: "🎯",
  goalie_in: "🧤",
  goalie_out: "🚪",
};

const LOG_LABEL: Record<string, string> = {
  goalie_in: "Målvakt in",
  goalie_out: "Målvakt ut",
  penalty_shot: "Straff",
};

/** A row of the live sensor's own match log, as the events view lists it. */
export function logRow(e: Row) {
  const assists =
    Array.isArray(e.assists) && e.assists.length ? ` (${e.assists.join(", ")})` : "";
  const detail =
    e.kind === "goal"
      ? [e.score, e.detail].filter(Boolean).join(" ")
      : e.detail || LOG_LABEL[e.kind] || "";
  return html`
    <div class="log-row ${e.kind}">
      <span class="log-time">${e.period ? `P${e.period}` : ""} ${e.time ?? ""}</span>
      <span class="log-icon">${LOG_ICON[e.kind] ?? "•"}</span>
      <span class="log-text">
        <span class="log-main">${e.team_code ? `${e.team_code} ` : ""}${e.player ?? ""}${assists}</span>
        ${detail ? html`<span class="log-detail">${detail}</span>` : nothing}
      </span>
    </div>
  `;
}
