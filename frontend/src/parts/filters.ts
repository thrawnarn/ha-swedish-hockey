/** The filter row along the foot of a view, and the chips in it. */

import { html, nothing, type TemplateResult } from "lit";
import type { FilterOption } from "../constants";
import type { Ctx } from "../context";
import type { Club } from "../controller";

// A view's filters, held along the foot of the panel while the list scrolls
// under them. The gap before the row takes whatever room a short list
// leaves, so it sits at the foot of a phone's screen either way. `busy` runs
// a line along its top edge while the view is read again.
export function filterBar(controls: TemplateResult, busy = false) {
  return html`
    <div class="filter-gap"></div>
    <div class="filter-bar ${busy ? "busy" : ""}" role="toolbar" aria-label="Filter">
      ${controls}
    </div>
  `;
}

// A choice of a few, as a chip saying what is chosen. The browser's own
// select lies over it unseen, so a tap opens the phone's own picker with
// every option written out in full.
export function filterSelect(
  label: string,
  value: string,
  options: FilterOption[],
  onChange: (value: string) => void,
) {
  const chosen = options.find(([id]) => id === value) ?? options[0];
  return html`
    <label class="filter-chip filter-select ${chosen === options[0] ? "" : "active"}">
      <span>${chosen[2] ?? chosen[1]}</span>
      <ha-icon icon="mdi:chevron-down"></ha-icon>
      <select
        aria-label=${label}
        @change=${(ev: Event) => onChange((ev.target as HTMLSelectElement).value)}
      >
        ${options.map(
          ([id, text]) => html`<option value=${id} ?selected=${id === chosen[0]}>${text}</option>`,
        )}
      </select>
    </label>
  `;
}

// The clubs chosen, on a button that opens the list to choose them from. A
// row of every club's crest took a line of its own and could only ever say
// one; this says up to two by name and more by count.
export function teamButton(ctx: Ctx, picker: string, clubs: Club[], chosen: string[]) {
  const picked = clubs.filter((club) => chosen.includes(club.key));
  const names = picked.map((club) => club.name).join(", ");
  return html`
    <button
      class="filter-chip team-pick ${picked.length ? "active" : ""}"
      aria-haspopup="dialog"
      title=${names || "Alla lag"}
      @click=${() => {
        ctx.ctl.picker = picker;
      }}
    >
      ${picked.length
        ? html`<span class="crest-stack">
            ${picked
              .slice(0, 3)
              .map((club) =>
                club.logo
                  ? html`<img src=${club.logo} alt="" loading="lazy" />`
                  : html`<span class="crest-blank"></span>`,
              )}
          </span>`
        : html`<ha-icon icon="mdi:shield-outline"></ha-icon>`}
      <span class="team-pick-label">
        ${!picked.length ? "Alla lag" : picked.length <= 2 ? names : `${picked.length} lag`}
      </span>
      <ha-icon icon="mdi:chevron-down"></ha-icon>
    </button>
  `;
}

export { nothing };
