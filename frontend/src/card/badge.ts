/**
 * <hockey-match-badge>: the same club as a chip among the view's badges - the
 * next fixture between games, the score while one is on.
 *
 * It is the card underneath: a tap opens the card's own dialog, with the
 * footer's buttons moved up into it as tabs, since there is no card face here
 * to carry them.
 */

import { html, nothing } from "lit";
import { onActivate } from "../base";
import { SHORT_DATE } from "../constants";
import { periodLabel } from "../format";
import { badgeStyles, cardStyles, phoneDialogStyles } from "../styles";
import { findTeams } from "../teams";
import { localeOf, relativeDay, timeFormat } from "../time";
import type { CardConfig, HassEntity, HomeAssistant, Row } from "../types";
import { HockeyMatchCard } from "./card";
import { barButtons, nextGameOf, resultIsRecent } from "./face";

export class HockeyMatchBadge extends HockeyMatchCard {
  /** The result the chip is showing, which is what a tap opens. */
  private shownResult: Row | null = null;

  static override styles = [cardStyles, badgeStyles, phoneDialogStyles];

  static override getConfigElement(): HTMLElement {
    return document.createElement("hockey-match-badge-editor");
  }

  static override getStubConfig(hass: HomeAssistant): CardConfig {
    const first = findTeams(hass)[0];
    return {
      type: "custom:hockey-match-badge",
      team: first?.code ?? first?.team ?? "",
    };
  }

  protected override render() {
    if (!this.hass || !this._config) return nothing;
    const { ctl } = this;
    const ids = ctl.ids;
    const live = ctl.state(ids.live);
    const next = ctl.state(ids.next);
    const isLive = live?.attributes?.in_progress === true;
    const lastResult: Row | null = next?.attributes?.last_result ?? null;
    const recent = !isLive && resultIsRecent(lastResult, Number(this._config.result_hours ?? 6));
    const showResult = isLive || recent;

    const { sources } = barButtons({ config: this._config, ctl }, live, ids, showResult, next);
    const ctx = this.makeCtx(sources);

    // What a tap opens: the summary of the result on show, if that is what
    // the chip is showing.
    this.shownResult = !isLive && recent ? lastResult : null;
    const content = isLive
      ? this.chipLive(live!)
      : recent
        ? this.chipResult(lastResult as Row)
        : this.chipNext(next);

    return html`
      <div
        class="chip ${isLive ? "is-live" : ""} ${content ? "" : "empty"}"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        @click=${() => this.openFromChip()}
        @keydown=${onActivate(() => this.openFromChip())}
      >
        ${content ??
        html`<ha-icon icon="mdi:hockey-sticks"></ha-icon>
          <span class="chip-text">Ingen match</span>`}
      </div>
      ${this.dialog(ctx)}
    `;
  }

  // While a game is on the dialog opens on it, on the summary of the result the
  // chip is showing after one, and otherwise on the table.
  // The rest is one tap away along the tabs.
  private openFromChip() {
    const { ctl } = this;
    ctl.newRequest();
    ctl.stopLive();
    ctl.recap = null;
    ctl.team = null;
    ctl.player = null;
    ctl.tableView = "table";
    if (ctl.state(ctl.ids.live)?.attributes?.in_progress === true) {
      ctl.panel = "game";
    } else if (this.shownResult) {
      // Opened over the day the game was played, which is where its back
      // button leads - today, or yesterday for a late game read after
      // midnight.
      const start = new Date(this.shownResult.start ?? "");
      const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      ctl.day = Number.isNaN(start.getTime())
        ? 0
        : Math.round((midnight(start).getTime() - midnight(new Date()).getTime()) / 86400000);
      ctl.panel = "table";
      ctl.tableView = "live";
      ctl.watchLive();
      ctl.loadRecap({ ...this.shownResult, latest: true });
    } else {
      ctl.panel = "table";
      // The chip shows the next game; a tap opens that game's preview, with
      // the table one tap back.
      const next = nextGameOf(ctl.state(ctl.ids.next));
      if (next) ctl.openPreview(next);
    }
  }

  private crests(a: Row, score: string) {
    return html`
      ${this.chipCrest(a.home_logo)}
      <span class="chip-text">
        ${a.home_code ?? a.home_team ?? ""}
        <span class="chip-score">${score}</span>
        ${a.away_code ?? a.away_team ?? ""}
      </span>
      ${this.chipCrest(a.away_logo)}
    `;
  }

  private chipCrest(src: string | undefined) {
    return src ? html`<img class="chip-crest" src=${src} alt="" loading="lazy" />` : nothing;
  }

  private chipLive(stateObj: HassEntity) {
    const a = stateObj.attributes ?? {};
    const text = String(a.period ?? "").replace(/^P/i, "");
    const period = /^[1-3]$/.test(text) ? `P${text}` : periodLabel(text);
    const clock = a.intermission ? "Paus" : this._config.show_clock !== false ? (a.clock ?? "") : "";
    const detail = [period, clock].filter(Boolean).join(" ");
    return html`
      <span class="chip-dot"></span>
      ${this.crests(a, String(stateObj.state).replace("-", "–"))}
      ${detail ? html`<span class="chip-detail">${detail}</span>` : nothing}
    `;
  }

  private chipResult(result: Row) {
    const extra = result.decided_in && result.decided_in !== "FT" ? ` ${result.decided_in}` : "";
    const outcome = result.won === true ? "won" : result.won === false ? "lost" : "";
    return html`
      ${this.crests(result, String(result.score ?? "").replace("-", "–"))}
      <span class="chip-detail ${outcome}">Slut${extra}</span>
    `;
  }

  private chipNext(stateObj: HassEntity | undefined) {
    if (!stateObj) return null;
    const start = new Date(stateObj.state);
    if (Number.isNaN(start.getTime())) return null;
    const locale = localeOf(this.hass);
    // Within the week the weekday says it; further out it needs the date.
    const soon = start.getTime() - Date.now() < 6 * 86400e3;
    const day =
      relativeDay(start, locale) ??
      start.toLocaleDateString(locale, soon ? { weekday: "short" } : SHORT_DATE);
    const time = start.toLocaleTimeString(locale, timeFormat(this.hass));
    return html`
      ${this.crests(stateObj.attributes ?? {}, "–")}
      <span class="chip-detail">${day} ${time}</span>
    `;
  }
}
