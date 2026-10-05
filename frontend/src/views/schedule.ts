/**
 * <hockey-schedule-view>: the league's season, opened at the next game, with
 * the clubs to show along the foot.
 */

import { html, type TemplateResult } from "lit";
import { PartElement } from "../base";
import { clubKey } from "../teams";
import { relativeDay } from "../time";
import { fixtureRow } from "../parts/fixture";
import { filterBar, nothing, teamButton } from "../parts/filters";
import { loading } from "../parts/loading";
import { scrollToNext } from "./scroll";

export class HockeyScheduleView extends PartElement {
  protected override updated(): void {
    // A season runs from August to March, and the part worth seeing first is
    // the part that has not happened. Done after rendering, since the row
    // has to exist before it can be scrolled to.
    if (this.ctx.ctl.schedule?.scrollToNext && scrollToNext(this)) {
      this.ctx.ctl.scrolledToNext("schedule");
    }
  }

  // The clubs to choose from, along the foot of the list: everybody's games,
  // or the games of the clubs chosen.
  private bar() {
    const { ctl } = this.ctx;
    const clubs = ctl.scheduleClubs();
    if (!clubs.length) return nothing;
    return filterBar(teamButton(this.ctx, "schedule", clubs, ctl.schedule?.teams ?? []));
  }

  private dayLabel(when: Date): string {
    const { locale } = this.ctx;
    if (Number.isNaN(when.getTime())) return "";
    return (
      relativeDay(when, locale) ??
      when.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })
    );
  }

  protected override render() {
    const { ctx } = this;
    const { loading: busy, error, nextIndex, teams = [] } = ctx.ctl.schedule ?? {};
    if (busy) return loading("Hämtar spelschema…");
    if (error) return html`<div class="recap-note">${error}</div>`;
    // Each game keeps its place in the whole list, so the next one can still
    // be found once the list is narrowed to some clubs: the first of their
    // games from there on.
    const wanted = new Set<string>(teams);
    const games = (ctx.ctl.schedule?.games ?? [])
      .map((game: any, index: number) => ({ game, index }))
      .filter(
        ({ game }: { game: any }) =>
          !wanted.size || wanted.has(clubKey(game.home_code)) || wanted.has(clubKey(game.away_code)),
      );
    const next =
      nextIndex == null
        ? null
        : (games.find(({ index }: { index: number }) => index >= nextIndex)?.index ?? null);
    if (!games.length) {
      return html`<div class="recap-note">
          ${wanted.size ? "Inga matcher för de valda lagen." : "Inga matcher i schemat."}
        </div>
        ${this.bar()}`;
    }

    const rows: unknown[] = [];
    let day: string | null = null;
    for (const { game, index } of games) {
      const when = new Date(game.start);
      const stamp = Number.isNaN(when.getTime()) ? "" : when.toDateString();
      if (stamp !== day) {
        day = stamp;
        rows.push(html`<div class="team-section">${this.dayLabel(when)}</div>`);
      }
      rows.push(fixtureRow(ctx, game, null, { isNext: index === next, hideDate: true, markSelf: true }));
    }
    rows.push(this.bar());
    return rows as TemplateResult[];
  }
}
