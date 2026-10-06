/** Counting and wording for a game's preview. Pure: no DOM, no Lit. */

import type { Row } from "./types";

export interface HeadToHead {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  overtime: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** Played meetings counted from one club's side: this season's from the
 *  schedule and earlier ones from the archive, the same way. */
export function headToHead(meetings: Row[], teamCode: string): HeadToHead {
  const summary: HeadToHead = {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    overtime: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
  for (const game of meetings) {
    const home = game.home_score;
    const away = game.away_score;
    if (home === null || home === undefined || away === null || away === undefined) continue;
    const isHome = String(game.home_code) === String(teamCode);
    const ours = Number(isHome ? home : away);
    const theirs = Number(isHome ? away : home);
    summary.games += 1;
    summary.goalsFor += ours;
    summary.goalsAgainst += theirs;
    if (ours > theirs) summary.wins += 1;
    else if (ours < theirs) summary.losses += 1;
    else summary.draws += 1;
    if (String(game.decided_in ?? "FT").toUpperCase() !== "FT") summary.overtime += 1;
  }
  return summary;
}

/** This season's earlier meetings and those of finished seasons, newest
 *  first, each once: the archive and the league can both know a game. */
export function earlierMeetings(thisSeason: Row[], archive: Row[], before: string | undefined): Row[] {
  const cutoff = before ? new Date(before).getTime() : Infinity;
  const played = thisSeason.filter(
    (game) =>
      game.home_score !== null &&
      game.home_score !== undefined &&
      !game.this_game &&
      new Date(game.start).getTime() < cutoff,
  );
  const seen = new Set<string>();
  const day = (game: Row) => String(game.start ?? "").slice(0, 10);
  const all = [...played, ...archive].filter((game) => {
    const key = `${day(game)}|${game.home_code}|${game.away_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return all.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

/** "3 raka vinster" - a run worth saying, two games or more. */
export function streakText(streak: Row | null | undefined): string | null {
  if (!streak || !(streak.count >= 2)) return null;
  if (streak.kind === "win") return `${streak.count} raka vinster`;
  if (streak.kind === "loss") return `${streak.count} raka förluster`;
  return null;
}

/** Days between the last game and this one, as a reader would say it. */
export function restText(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (days <= 0) return "Samma dag";
  if (days === 1) return "1 dag – spelade dagen innan";
  return `${days} dagar`;
}

/** A record as the table writes it: wins, overtime wins, overtime losses,
 *  losses. */
export function recordText(record: Row | null | undefined): string | null {
  if (!record || !record.games) return null;
  return [record.wins, record.overtime_wins, record.overtime_losses, record.losses].join("–");
}

/** What a result was called from the club's side, as one letter or two. */
export const RESULT_LETTER: Record<string, string> = {
  win: "V",
  otwin: "ÖV",
  otloss: "ÖF",
  loss: "F",
  draw: "O",
};

/** "2025/26" from the archive's "2025-26". */
export function seasonLabel(season: unknown): string {
  return String(season ?? "").replace("-", "/");
}
