/** Figures, names and colours as the card writes them. Pure: no DOM, no Lit. */

import { POSITIONS, TABLE_CUTS, type Position } from "./constants";
import type { Metric, Row } from "./types";

// A figure as a Swedish page writes it: a decimal comma, a crowd in groups of
// three. With `unit`, a percentage says so; a column head says it for a table.
export function formatStat(value: unknown, kind?: Metric["kind"], unit = false): string {
  if (value === null || value === undefined || value === "") return "–";
  const number = Number(value);
  switch (kind) {
    case "pct":
      return Number.isFinite(number)
        ? `${number.toFixed(1).replace(".", ",")}${unit ? " %" : ""}`
        : String(value);
    case "dec":
      return Number.isFinite(number) ? number.toFixed(2).replace(".", ",") : String(value);
    case "dec1":
      return Number.isFinite(number) ? number.toFixed(1).replace(".", ",") : String(value);
    case "pm":
      return number > 0 ? `+${number}` : String(value);
    case "crowd":
      return Number.isFinite(number)
        ? String(Math.round(number)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
        : String(value);
    default:
      return String(value);
  }
}

// A figure as a number to sort and rank by: "18:41" of ice time is seconds.
export function statNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.includes(":")) {
    return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 1:a, 2:a, 3:e … 11:e, 12:e, 21:a - the way Swedish writes a place.
export function ordinal(n: number): string {
  const tens = n % 100;
  const last = n % 10;
  return `${n}:${(last === 1 || last === 2) && tens !== 11 && tens !== 12 ? "a" : "e"}`;
}

// "Tyler Kelleher" as "T. Kelleher", for a narrow column.
export function shortName(name: unknown): string {
  const parts = String(name ?? "").trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

// A club's own colour, kept off the extremes: several play in near-black or
// near-white, which disappears into one theme or the other.
export function clubColour(hex: unknown, fallback: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  let [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const mix = (channel: number, towards: number, amount: number) =>
    Math.round(channel + (towards - channel) * amount);
  if (luminance < 0.22) {
    [r, g, b] = [mix(r, 255, 0.45), mix(g, 255, 0.45), mix(b, 255, 0.45)];
  } else if (luminance > 0.82) {
    [r, g, b] = [mix(r, 0, 0.3), mix(g, 0, 0.3), mix(b, 0, 0.3)];
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// A player the league has no profile for still belongs somewhere: the stats
// tables at least say which of them keep goal.
export const positionOf = (player: Row): Position =>
  POSITIONS[String(player.position_code ?? "").toUpperCase()] ??
  (player.role === "goalkeeper" ? POSITIONS.GK : { letter: "", group: "other" });

const RECAP_ICON: Record<string, string> = {
  goal: "🚨",
  penalty: "🟨",
  goalie_in: "🧤",
  goalie_out: "🚪",
};

// A shootout attempt is worth telling apart at a glance: the same siren as any
// other goal when it goes in, a plain cross when it does not.
export const recapIcon = (event: Row): string =>
  event.kind === "penalty_shot"
    ? event.scored
      ? "🚨"
      : "❌"
    : (RECAP_ICON[event.kind] ?? "•");

// The feed numbers the three periods and names what follows - and not always
// the same way: a shootout is "SO" in one game and "PSO" in the next.
export function periodLabel(period: unknown): string {
  const text = String(period ?? "").trim().toUpperCase();
  if (!text) return "";
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    if (number <= 3) return `Period ${number}`;
    return number === 4 ? "Förlängning" : "Straffar";
  }
  if (text.includes("SO")) return "Straffar";
  if (text.includes("OT") || text.includes("EXT")) return "Förlängning";
  return text;
}

export const isCut = (rank: unknown): boolean => TABLE_CUTS.includes(Number(rank) - 1);

// Which stretch of the table between two cuts a rank falls in: 0 above the
// first, and so on. The table colours each stretch at its left edge.
export const zoneOf = (rank: unknown): number | null => {
  const n = Number(rank);
  if (!n) return null;
  const zone = TABLE_CUTS.findIndex((cut) => n <= cut);
  return zone === -1 ? TABLE_CUTS.length : zone;
};

// 13950 reads better as 13 950, the way Swedish writes a crowd.
export function crowd(value: unknown): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** A goal difference or plus/minus, with its sign. */
export function plus(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return Number(value) > 0 ? `+${value}` : String(value);
}

/** Decimal odds as a Swedish page writes them: 1,38. */
export function formatOdds(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2).replace(".", ",") : "–";
}

/** What a set of odds says each outcome's chance is, in whole per cent: one
 *  over each price, scaled so the three add up to a hundred - the
 *  bookmaker's margin taken out. */
export function impliedChances(prices: number[]): number[] {
  const inverse = prices.map((price) => (Number(price) > 0 ? 1 / Number(price) : 0));
  const total = inverse.reduce((sum, value) => sum + value, 0);
  return total ? inverse.map((value) => Math.round((value / total) * 100)) : prices.map(() => 0);
}
