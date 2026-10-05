/**
 * <hockey-team-picker>: the list of clubs a filter row's team button opens.
 *
 * A modal of its own, over the dialog it was opened from: the browser stacks
 * the two, and Escape closes the top one. A tick applies at once - the list
 * behind it narrows as the club is chosen - so "Klar" only has to close it.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { clubKey } from "../teams";

export class HockeyTeamPicker extends PartElement {
  protected override firstUpdated(): void {
    const picker = this.querySelector<HTMLDialogElement>("dialog.picker");
    if (!picker || picker.open) return;
    if (picker.showModal) picker.showModal();
    else picker.setAttribute("open", "");
  }

  protected override render() {
    const { ctl } = this.ctx;
    const spec = ctl.pickerSpec();
    if (!spec) return nothing;
    const { title, clubs, chosen, set } = spec;
    const ours = clubKey(ctl.teamRef());
    // Read at the tap, not at the render: two taps can land between renders.
    const toggle = (key: string) => {
      const now = ctl.pickerSpec()?.chosen ?? [];
      set(now.includes(key) ? now.filter((k) => k !== key) : [...now, key]);
    };
    return html`
      <dialog
        class="picker"
        aria-label=${title}
        @close=${() => {
          ctl.picker = null;
        }}
        @click=${(ev: Event) => {
          if (ev.target === ev.currentTarget) (ev.currentTarget as HTMLDialogElement).close();
        }}
      >
        <div class="picker-head">
          <span class="picker-title">${title}</span>
          <span class="picker-count">
            ${chosen.length ? `${chosen.length} av ${clubs.length} lag valda` : "Alla lag"}
          </span>
        </div>
        <div class="picker-list" role="group" aria-label="Lag">
          ${clubs.map((club, index) => {
            const on = chosen.includes(club.key);
            // Opened on the first club rather than on the list around them,
            // which Chrome would otherwise give the focus to as a scroller.
            return html`
              <button
                class="picker-row ${on ? "on" : ""}"
                role="checkbox"
                aria-checked=${on ? "true" : "false"}
                ?autofocus=${index === 0}
                @click=${() => toggle(club.key)}
              >
                ${club.logo
                  ? html`<img class="picker-crest" src=${club.logo} alt="" loading="lazy" />`
                  : html`<span class="picker-crest"></span>`}
                <span class="picker-name">${club.name}</span>
                ${club.key === ours ? html`<span class="picker-ours">Ditt lag</span>` : nothing}
                <span class="picker-check"><ha-icon icon="mdi:check"></ha-icon></span>
              </button>
            `;
          })}
        </div>
        <div class="picker-foot">
          <button class="picker-clear" ?disabled=${!chosen.length} @click=${() => set([])}>
            Rensa
          </button>
          <button
            class="picker-done"
            @click=${(ev: Event) => (ev.currentTarget as HTMLElement).closest("dialog")?.close()}
          >
            Klar
          </button>
        </div>
      </dialog>
    `;
  }
}
