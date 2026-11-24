/**
 * The two squads of a game side by side - height, weight, age and how many
 * are Swedes - on every game's page: before it, during it and after it.
 */

import { html, nothing } from "lit";
import type { Ctx } from "../context";
import { ordinal } from "../format";
import { clubKey } from "../teams";
import type { Row } from "../types";
import { loading } from "./loading";

// None of these is better either way, so neither side is lit.
const SQUAD: [key: string, label: string, unit: string][] = [
  ["height", "Snittlängd", "cm"],
  ["weight", "Snittvikt", "kg"],
  ["age", "Snittålder", "år"],
];

const decimal = (value: number) => value.toFixed(1).replace(".", ",");

// Two clubs a centimetre apart would fill half the bar each if drawn
// against their sum, so each bar runs from the league's lowest club to its
// highest; a sliver is left at the low end so the lowest still shows.
export function squadCompare(ctx: Ctx, homeCode: unknown, awayCode: unknown) {
  const { ctl } = ctx;
  const entry = ctl.squads;
  if (!entry?.data) {
    return entry?.loading
      ? html`<div class="team-section">Trupperna</div>${loading("Mäter trupperna…", "table")}`
      : nothing;
  }
  const teams: Row[] = entry.data.teams ?? [];
  const find = (code: unknown) => teams.find((row) => clubKey(row.team_code) === clubKey(code));
  const home = find(homeCode);
  const away = find(awayCode);
  if (!home?.players || !away?.players) return nothing;
  // A club in the same colour as the other gives way to grey, or the two
  // bars would read as one.
  const homeColour = ctl.clubColourOf(homeCode);
  const awayColour =
    ctl.clubColourOf(awayCode) === homeColour
      ? "var(--secondary-text-color)"
      : ctl.clubColourOf(awayCode);
  const bar = (
    label: string,
    a: number,
    b: number,
    shown: (v: number) => string,
    share: (v: number) => number,
    foot: [string, string],
  ) => html`
    <div class="stat">
      <div class="stat-values">
        <span class="stat-value">${shown(a)}</span>
        <span class="stat-value">${shown(b)}</span>
      </div>
      <div class="bar-track">
        <span class="bar-side home">
          <span class="bar-fill" style=${`width:${share(a).toFixed(1)}%;background:${homeColour}`}></span>
        </span>
        <span class="bar-side away">
          <span class="bar-fill" style=${`width:${share(b).toFixed(1)}%;background:${awayColour}`}></span>
        </span>
      </div>
      <div class="stat-foot">
        <span class="stat-detail">${foot[0]}</span>
        <span class="stat-label">${label}</span>
        <span class="stat-detail">${foot[1]}</span>
      </div>
    </div>
  `;
  const rows = SQUAD.filter(
    ([key]) => typeof home[key] === "number" && typeof away[key] === "number",
  ).map(([key, label, unit]) => {
    const values = teams.map((t) => t[key]).filter((v): v is number => typeof v === "number");
    const low = Math.min(...values);
    const span = Math.max(...values) - low;
    const share = (v: number) => 8 + 92 * (span ? Math.min(1, Math.max(0, (v - low) / span)) : 1);
    const where = (row: Row) => (row.ranks?.[key] ? `${ordinal(row.ranks[key])} i ligan` : "");
    return bar(label, home[key], away[key], (v) => `${decimal(v)} ${unit}`, share, [
      where(home),
      where(away),
    ]);
  });
  // Where the players come from, as a share of each squad.
  const swedes = (row: Row) => (100 * Number(row.home_grown ?? 0)) / row.players;
  rows.push(
    bar("Svenska spelare", swedes(home), swedes(away), (v) => `${Math.round(v)} %`, (v) => v, [
      `${home.home_grown ?? 0} av ${home.players}`,
      `${away.home_grown ?? 0} av ${away.players}`,
    ]),
  );
  return html`
    <div class="team-section">Trupperna</div>
    <div class="stats squads">${rows}</div>
  `;
}
