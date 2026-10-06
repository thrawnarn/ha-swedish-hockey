/**
 * <hockey-match-card>: live score while a game is on, next fixture otherwise.
 *
 * Visual language borrowed from shl-card: two faded club badges bleeding off
 * the top corners, the badges again either side of a centred detail column.
 * A tap on anything in it opens the dialog, which is its own element; this
 * one owns the controller every part is drawn from.
 */

import { html, LitElement, nothing, type PropertyValues } from "lit";
import { onActivate } from "../base";
import { DEFAULTS } from "../constants";
import type { Ctx, Sources } from "../context";
import { HockeyController } from "../controller";
import { cardStyles, phoneDialogStyles } from "../styles";
import { findTeams } from "../teams";
import { localeOf } from "../time";
import type { CardConfig, HomeAssistant, Row } from "../types";
import { badge } from "../parts/common";
import {
  barButtons,
  footer,
  nextGameOf,
  lastGoal,
  liveMiddle,
  nextMiddle,
  resultIsRecent,
  resultMiddle,
  sideButton,
} from "./face";

export class HockeyMatchCard extends LitElement {
  declare hass: HomeAssistant;
  protected declare _config: CardConfig;
  /** The face's own choice between a held result and the next game, pinned to
   *  the result it was made about. */
  protected declare _view: { id: string | null; choice: "next" | "result" } | null;

  readonly ctl = new HockeyController(this);

  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
    _view: { state: true },
  };

  static override styles = [cardStyles, phoneDialogStyles];

  static getConfigElement(): HTMLElement {
    return document.createElement("hockey-match-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): CardConfig {
    return {
      type: "custom:hockey-match-card",
      team: findTeams(hass)[0]?.team ?? "",
    };
  }

  /** The configuration the controller reads, defaults filled in. */
  get cardConfig(): CardConfig {
    return this._config;
  }

  setConfig(config: CardConfig): void {
    if (!config?.team && !config?.live_entity && !config?.next_entity) {
      throw new Error("Pick a team");
    }
    this._config = { ...DEFAULTS, ...config };
  }

  getCardSize(): number {
    return 5;
  }

  getGridOptions() {
    return { rows: 4, columns: 12, min_rows: 3, min_columns: 6 };
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ctl.stopLive();
  }

  protected override willUpdate(changed: PropertyValues): void {
    // Found once per render: the answer walks the whole entity registry, and
    // every part asks for it.
    if (this.hass && this._config) this.ctl.findIds();
    super.willUpdate(changed);
  }

  /** What every part is handed for this render. */
  protected makeCtx(sources: Sources): Ctx {
    return {
      hass: this.hass,
      config: this._config,
      ctl: this.ctl,
      locale: localeOf(this.hass),
      sources,
    };
  }

  protected dialog(ctx: Ctx) {
    return this.ctl.panel ? html`<hockey-dialog .ctx=${ctx}></hockey-dialog>` : nothing;
  }

  protected override render() {
    if (!this.hass || !this._config) return nothing;
    const { ctl } = this;
    const ids = ctl.ids;
    const live = ctl.state(ids.live);
    const next = ctl.state(ids.next);

    // The live sensor keeps the last final score on show between games, so
    // "is there data" is not the question - in_progress is.
    const isLive = live?.attributes?.in_progress === true;

    // After the whistle the result stays up for a while, with an arrow across
    // to the next fixture. _view pins the choice once the user has made one.
    const holdHours = Number(this._config.result_hours ?? 6);
    const lastResult: Row | null = next?.attributes?.last_result ?? null;
    const recent = !isLive && resultIsRecent(lastResult, holdHours);
    // Pinned to the result it was made about: a choice to skip one game's
    // score must not hide the next game's.
    const pinned = this._view?.id === (lastResult?.start ?? null) ? this._view?.choice : null;
    const showResult = isLive || (recent && pinned !== "next");
    const canToggle = recent;

    // A held result is drawn from last_result on the next-game sensor, so the
    // live sensor is only the source while a game is actually being played.
    const source = isLive ? live : next;
    const showingHeldResult = showResult && !isLive && lastResult;

    // Kept for the dialog: on a phone it covers the card, so the same
    // buttons go along its bottom as tabs.
    const { buttons, sources } = barButtons({ config: this._config, ctl }, live, ids, showResult, next);
    const ctx = this.makeCtx(sources);

    if (!source) {
      return html`<ha-card class="pad">
        No entities found for ${this._config.team || "(no team set)"}
      </ha-card>`;
    }
    if (!showingHeldResult && (source.state === "unavailable" || source.state === "unknown")) {
      return html`<ha-card class="pad">
        ${isLive ? "Live scoring" : "Next game"} is unavailable
      </ha-card>`;
    }

    const a = showingHeldResult ? (lastResult as Row) : (source.attributes ?? {});
    return html`
      <ha-card>
        ${this._config.title || canToggle
          ? html`<div class="title">
              <span>${this._config.title ?? ""}</span>
              ${canToggle ? this.toggle(showResult, lastResult?.start ?? null) : nothing}
            </div>`
          : nothing}
        <div class="card">
          ${badge(a.home_logo, "home-bg")} ${badge(a.away_logo, "away-bg")}
          <div class="content">
            ${sideButton(ctx, a.home_code, a.home_team, a.home_logo)}
            ${this.middle(
              ctx,
              isLive
                ? liveMiddle(ctx, live!)
                : showResult
                  ? resultMiddle(ctx, lastResult, live)
                  : nextMiddle(ctx, next),
              isLive || showResult ? null : nextGameOf(next),
            )}
            ${sideButton(ctx, a.away_code, a.away_team, a.away_logo)}
          </div>
          ${isLive ? lastGoal(live!) : nothing}
        </div>
        ${footer(ctx, buttons)} ${this.dialog(ctx)}
      </ha-card>
    `;
  }

  // Between games the middle of the face is the next game, and a tap on it
  // opens that game's preview.
  private middle(ctx: Ctx, content: unknown, game: Row | null) {
    if (!game) return html`<div class="middle">${content}</div>`;
    const open = () => this.ctl.openPreview(game);
    return html`<div
      class="middle tappable"
      role="button"
      tabindex="0"
      title="Inför matchen"
      @click=${open}
      @keydown=${onActivate(open)}
    >
      ${content}
    </div>`;
  }

  private toggle(showingResult: boolean, resultId: string | null) {
    const label = showingResult ? "Visa nästa match" : "Visa resultatet";
    return html`
      <button
        class="view-toggle"
        title=${label}
        aria-label=${label}
        @click=${() => {
          this._view = { id: resultId, choice: showingResult ? "next" : "result" };
        }}
      >
        ${showingResult ? "›" : "‹"}
      </button>
    `;
  }
}
