/**
 * <hockey-today-view>: a day's games across the league, today's with the
 * score as it stands. The arrows, or a swipe, step a day either way.
 */

import { html, nothing } from "lit";
import { PartElement } from "../base";
import { DATE } from "../constants";
import { dayTitle, timeFormat } from "../time";
import { fixtureRow } from "../parts/fixture";
import { loading } from "../parts/loading";

interface Swipe {
  x: number;
  y: number;
  dx: number;
  horizontal: boolean | null;
}

export class HockeyTodayView extends PartElement {
  private swipe: Swipe | null = null;

  private dayTitle(offset: number): string {
    return dayTitle(this.ctx.ctl.dayDate(offset), offset, this.ctx.locale);
  }


  private async step(step: number) {
    this.ctx.ctl.stepDay(step);
    // The new day comes in from the side it was asked for from.
    await this.ctx.ctl.settled();
    this.querySelector<HTMLElement>(".day-body")?.animate?.(
      [
        { transform: `translateX(${step > 0 ? 40 : -40}px)`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 200, easing: "ease-out" },
    );
  }

  protected override render() {
    const { ctx } = this;
    const { ctl, locale, hass } = ctx;
    const offset = ctl.day ?? 0;
    const current = ctl.tonight?.day === offset ? ctl.tonight : {};
    const { games, loading: busy, error, updated } = current ?? {};
    const subtitle =
      Math.abs(offset) <= 1
        ? ctl.dayDate(offset).toLocaleDateString(locale, { weekday: "long", ...DATE })
        : null;
    // Today's scores are read again every minute; the bar says so while
    // they are, with what was there before still on show.
    const bar = html`
      <div class="day-bar ${busy && games ? "busy" : ""}">
        <button class="day-step" aria-label="Föregående dag" @click=${() => this.step(-1)}>
          <ha-icon icon="mdi:chevron-left"></ha-icon>
        </button>
        <div class="day-title">
          <span>${this.dayTitle(offset)}</span>
          ${subtitle ? html`<span class="day-sub">${subtitle}</span>` : nothing}
        </div>
        <button class="day-step" aria-label="Nästa dag" @click=${() => this.step(1)}>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
      </div>
    `;
    let body;
    if (busy && !games) body = loading("Hämtar matcherna…", "games");
    else if (error && !games) body = html`<div class="recap-note">${error}</div>`;
    else if (!games?.length) body = html`<div class="recap-note">Inga matcher den här dagen.</div>`;
    else {
      body = html`
        ${games.map((game: any) =>
          fixtureRow(ctx, game, null, {
            hideDate: true,
            markSelf: true,
            live: offset === 0,
            ended: true,
          }),
        )}
        ${updated && offset === 0
          ? html`<div class="live-updated">
              Uppdaterad ${updated.toLocaleTimeString(locale, timeFormat(hass))}
            </div>`
          : nothing}
      `;
    }
    // The day's games follow a finger sideways, and a long enough swipe turns
    // to the day before or after, as the arrows do.
    return html`
      ${bar}
      <div
        class="day-body"
        @touchstart=${{ handleEvent: (ev: TouchEvent) => this.swipeStart(ev), passive: true }}
        @touchmove=${{ handleEvent: (ev: TouchEvent) => this.swipeMove(ev), passive: true }}
        @touchend=${(ev: TouchEvent) => this.swipeEnd(ev)}
        @touchcancel=${(ev: TouchEvent) => this.swipeEnd(ev, true)}
      >
        ${body}
      </div>
    `;
  }

  private swipeStart(ev: TouchEvent) {
    if (ev.touches.length !== 1) {
      this.swipe = null;
      return;
    }
    const t = ev.touches[0];
    this.swipe = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null };
  }

  private swipeMove(ev: TouchEvent) {
    const swipe = this.swipe;
    if (!swipe) return;
    const t = ev.touches[0];
    const dx = t.clientX - swipe.x;
    const dy = t.clientY - swipe.y;
    // The first clear movement decides: up and down is the page scrolling and
    // is left alone for the rest of the touch.
    if (swipe.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipe.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    }
    if (!swipe.horizontal) return;
    swipe.dx = dx;
    const body = ev.currentTarget as HTMLElement;
    body.style.transition = "none";
    body.style.transform = `translateX(${dx * 0.5}px)`;
    body.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 600));
  }

  private swipeEnd(ev: TouchEvent, cancelled = false) {
    const swipe = this.swipe;
    this.swipe = null;
    const body = ev.currentTarget as HTMLElement;
    if (!swipe?.horizontal) return;
    const width = body.getBoundingClientRect().width || 300;
    const turn = !cancelled && Math.abs(swipe.dx) > Math.min(80, width * 0.22);
    if (turn) {
      body.style.transition = "";
      body.style.transform = "";
      body.style.opacity = "";
      this.step(swipe.dx < 0 ? 1 : -1);
      return;
    }
    // Not far enough: back where it was.
    body.style.transition = "transform 0.18s ease-out, opacity 0.18s ease-out";
    body.style.transform = "";
    body.style.opacity = "";
  }
}
