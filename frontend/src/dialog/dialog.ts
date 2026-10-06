/**
 * <hockey-dialog>: everything behind a tap on the card.
 *
 * A dialog rather than an expanding card: the table is fourteen rows and a
 * match log longer still, which on a phone pushes everything below the card
 * off the screen. <dialog> is the plain element - the browser puts it in the
 * top layer, so no dashboard grid or overflow can clip it, and Escape, the
 * backdrop and focus trapping come with it.
 *
 * The card renders this only while a view is open, so it opens itself as it
 * first draws; closing it - by Escape, the backdrop or the cross - resets the
 * controller, and the card stops rendering it.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";

interface Tab {
  id: string;
  icon: string;
  label: string;
  badge?: string | null;
}

export class HockeyDialog extends PartElement {
  protected override firstUpdated(): void {
    const dialog = this.querySelector<HTMLDialogElement>("dialog:not(.picker)");
    if (!dialog || dialog.open) return;
    // showModal is what puts it in the top layer; open it plainly if an old
    // browser cannot.
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  protected override render() {
    const { ctl } = this.ctx;
    const tight =
      ctl.player ||
      ctl.recap ||
      ctl.team ||
      ctl.preview ||
      ctl.panel === "events" ||
      ctl.panel === "results" ||
      ctl.panel === "game";
    return html`
      <dialog
        @cancel=${(ev: Event) => {
          // Escape closes the picture first, and the dialog only once there is
          // no picture left to close.
          if (ctl.photo) {
            ev.preventDefault();
            ctl.photo = null;
          }
        }}
        @close=${(ev: Event) => {
          // The club list is a dialog of its own inside this one; its close
          // is not this one's.
          if (ev.target !== ev.currentTarget) return;
          ctl.reset();
        }}
        @click=${(ev: Event) => {
          // A click that lands on the dialog itself is a click on the backdrop.
          if (ev.target === ev.currentTarget) (ev.currentTarget as HTMLDialogElement).close();
        }}
      >
        <button
          class="dialog-close"
          aria-label="Stäng"
          @click=${(ev: Event) =>
            (ev.currentTarget as HTMLElement).closest("dialog")?.close()}
        >
          ✕
        </button>
        ${ctl.photo
          ? html`<div
              class="photo-overlay"
              @click=${(ev: Event) => {
                ev.stopPropagation();
                ctl.photo = null;
              }}
            >
              <img src=${ctl.photo} alt="" />
            </div>`
          : nothing}
        ${ctl.picker ? html`<hockey-team-picker .ctx=${this.ctx}></hockey-team-picker>` : nothing}
        <div class="panel ${tight ? "tight" : ""}">${this.view()}</div>
        ${this.nav()}
      </dialog>
    `;
  }

  private view() {
    const { ctx } = this;
    const { ctl } = ctx;
    if (ctl.player) return html`<hockey-player-view .ctx=${ctx}></hockey-player-view>`;
    if (ctl.recap) return html`<hockey-recap-view .ctx=${ctx}></hockey-recap-view>`;
    // A preview and a club's page can be open together, one opened from the
    // other: whichever came second is on top.
    if (ctl.previewOnTop()) return html`<hockey-preview-view .ctx=${ctx}></hockey-preview-view>`;
    if (ctl.team) return html`<hockey-team-view .ctx=${ctx}></hockey-team-view>`;
    switch (ctl.panel) {
      case "game":
        return html`<hockey-game-view .ctx=${ctx}></hockey-game-view>`;
      case "events":
        return html`<hockey-events-view .ctx=${ctx}></hockey-events-view>`;
      case "table":
        return html`<hockey-league-view .ctx=${ctx}></hockey-league-view>`;
      case "results":
        return html`<hockey-results-view .ctx=${ctx}></hockey-results-view>`;
      default:
        return nothing;
    }
  }

  // The sections as a row of buttons in the dialog. The badge has no card face
  // to carry them, so it always shows them - along the top; the card shows
  // them only on a phone, where the dialog covers the card, and there they are
  // a tab bar along the bottom, as an app would have them.
  private nav() {
    const { ctl } = this.ctx;
    const tabs = this.tabs();
    if (tabs.length < 2) return nothing;
    const view = ctl.panel === "table" ? (ctl.tableView ?? "table") : null;
    const active = (id: string) =>
      !ctl.team &&
      !ctl.player &&
      !ctl.recap &&
      !ctl.preview &&
      (id === "game"
        ? ctl.panel === "game"
        : id === "today"
          ? view === "live"
          : id === "schedule" || id === "stats"
            ? view === id
            : view === "table");
    return html`
      <nav class="dialog-nav" aria-label="Avsnitt">
        ${tabs.map((tab) => this.tabButton(tab, active(tab.id)))}
      </nav>
    `;
  }

  // The game being played, if there is one, then the league: today's games,
  // the table and the schedule. The game's log and the team's earlier results
  // live inside these - the log under the score, the results back along the
  // schedule - so they are not tabs of their own.
  private tabs(): Tab[] {
    const { ctl, config } = this.ctx;
    const standings = ctl.state(ctl.ids.standings)?.attributes;
    const liveGames = Number(standings?.live_games ?? 0);
    const hasLiveTable = Array.isArray(standings?.live_table) && standings.live_table.length > 0;
    const playing = ctl.state(ctl.ids.live)?.attributes?.in_progress === true;
    return [
      playing && { id: "game", icon: "mdi:scoreboard", label: "Match" },
      {
        id: "today",
        icon: "mdi:calendar-today",
        label: "Matcher",
        badge: liveGames ? String(liveGames) : null,
      },
      config.show_table !== false && {
        id: "table",
        icon: "mdi:podium",
        label: "Tabell",
        badge: hasLiveTable ? "LIVE" : null,
      },
      { id: "schedule", icon: "mdi:calendar-month", label: "Spelschema" },
      config.show_stats !== false && {
        id: "stats",
        icon: "mdi:chart-box-outline",
        label: "Statistik",
      },
    ].filter(Boolean) as Tab[];
  }

  private tabButton(tab: Tab, active: boolean) {
    return html`
      <button
        class="bar-button ${active ? "active" : ""}"
        aria-current=${active ? "page" : nothing}
        @click=${() => this.ctx.ctl.openTab(tab.id)}
      >
        <ha-icon icon=${tab.icon}></ha-icon>
        <span>${tab.label}</span>
        ${tab.badge ? html`<span class="bar-badge">${tab.badge}</span>` : nothing}
      </button>
    `;
  }
}
