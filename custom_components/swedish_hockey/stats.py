"""A game's stats as pairs to draw side by side, for the card and the recap."""

from __future__ import annotations

import re
from typing import Any

from .api import Game, LiveGame, club_key, parse_score
from .swehockey import GameSheet

_PENALTY_MINUTES = re.compile(r"(\d+)\s*min", re.IGNORECASE)


def _side_of(code: Any, game: Game) -> str | None:
    """Return "home" or "away" for a club code in this game."""
    wanted = club_key(code)
    if not wanted:
        return None
    if wanted == club_key(game.home.key):
        return "home"
    if wanted == club_key(game.away.key):
        return "away"
    return None


def _by_period(values: tuple[int | None, ...]) -> str | None:
    """Return a split by period as "7 · 9 · 4", leaving out periods not played."""
    played = [str(value) for value in values if value is not None]
    return " · ".join(played) if len(played) > 1 else None


def game_stats(
    live: LiveGame, game: Game, sheet: GameSheet | None = None
) -> list[dict[str, Any]]:
    """Return the game's stats, each as a pair with how to read it.

    A count is read against the two sides added together; a percentage against
    a hundred, with the fraction it came from alongside. The play-by-play
    gives what it can count - attempts, blocks, the power plays as goals over
    chances. The federation's game sheet, when there is one, is the official
    record of the rest: shots, saves and penalty minutes split by period, the
    two percentages and the time each side had the extra man. Where both have
    a number the sheet's is used, so a save percentage always agrees with the
    saves beside it.
    """
    stats: list[dict[str, Any]] = []
    home = sheet.home if sheet else None
    away = sheet.away if sheet else None

    def count(key: str, home_value: Any, away_value: Any, **details: Any) -> None:
        stats.append(
            {"key": key, "kind": "count", "home": home_value, "away": away_value}
            | {name: value for name, value in details.items() if value}
        )

    def percent(key: str, home_value: Any, away_value: Any, **details: Any) -> None:
        stats.append(
            {
                "key": key,
                "kind": "percent",
                "home": home_value or 0,
                "away": away_value or 0,
            }
            | {name: value for name, value in details.items() if value}
        )

    shots = live.shots
    if home and away and home.shots is not None and away.shots is not None:
        count(
            "shots_on_goal",
            home.shots,
            away.shots,
            home_detail=_by_period(home.shots_by_period),
            away_detail=_by_period(away.shots_by_period),
        )
    elif shots is not None:
        count("shots_on_goal", shots.home, shots.away)
    if shots is not None:
        count("shot_attempts", shots.home_total, shots.away_total)
        if shots.home_blocked or shots.away_blocked:
            # A block belongs to the side that stood in the way, which is the
            # other one from the side whose attempt it was.
            count("blocked", shots.away_blocked, shots.home_blocked)
    if home and away and home.shooting_pct is not None:
        percent("shooting_pct", home.shooting_pct, away.shooting_pct)

    if home and away and home.saves is not None and away.saves is not None:
        count(
            "saves",
            home.saves,
            away.saves,
            home_detail=_by_period(home.saves_by_period),
            away_detail=_by_period(away.saves_by_period),
        )
        if home.save_pct is not None:
            percent("save_pct", home.save_pct, away.save_pct)
    elif shots is not None:
        scored = parse_score(live.score) or (0, 0)
        count("saves", max(shots.away - scored[1], 0), max(shots.home - scored[0], 0))

    minutes = {"home": 0, "away": 0}
    penalties = {"home": 0, "away": 0}
    powerplay = {"home": 0, "away": 0}
    shorthanded = {"home": 0, "away": 0}
    for event in live.events:
        side = _side_of(event.team_code, game)
        if side is None:
            continue
        if event.kind == "penalty":
            penalties[side] += 1
            if match := _PENALTY_MINUTES.search(event.detail or ""):
                minutes[side] += int(match.group(1))
        elif event.kind == "goal" and event.strength == "PP":
            powerplay[side] += 1
        elif event.kind == "goal" and event.strength == "BP":
            shorthanded[side] += 1

    # A side's power plays are the other side's penalties.
    chances = {"home": penalties["away"], "away": penalties["home"]}
    pp_time = {
        "home": home.powerplay_time if home else None,
        "away": away.powerplay_time if away else None,
    }

    def pp_detail(side: str) -> str | None:
        parts = []
        if chances[side]:
            parts.append(f"{powerplay[side]}/{chances[side]}")
        if pp_time[side] and pp_time[side] != "00:00":
            parts.append(pp_time[side])
        return " · ".join(parts) or None

    # Counting penalties takes a major and the misconduct that came with it as
    # two chances; the sheet knows them for one, so its percentage wins, and
    # the time with the extra man stands beside it in place of the fraction.
    if home and away and home.powerplay_pct is not None and away.powerplay_pct is not None:
        if any(pp_time[side] not in (None, "00:00") for side in pp_time) or any(
            chances.values()
        ):
            percent(
                "powerplay",
                home.powerplay_pct,
                away.powerplay_pct,
                home_detail=pp_time["home"] if pp_time["home"] != "00:00" else None,
                away_detail=pp_time["away"] if pp_time["away"] != "00:00" else None,
            )
    elif any(chances.values()):
        percent(
            "powerplay",
            round(powerplay["home"] / chances["home"] * 100, 1) if chances["home"] else 0,
            round(powerplay["away"] / chances["away"] * 100, 1) if chances["away"] else 0,
            home_detail=pp_detail("home"),
            away_detail=pp_detail("away"),
        )
    if any(shorthanded.values()):
        count("shorthanded_goals", shorthanded["home"], shorthanded["away"])

    if home and away and home.penalty_minutes is not None and away.penalty_minutes is not None:
        if home.penalty_minutes or away.penalty_minutes:
            count(
                "penalty_minutes",
                home.penalty_minutes,
                away.penalty_minutes,
                home_detail=_by_period(home.penalty_minutes_by_period),
                away_detail=_by_period(away.penalty_minutes_by_period),
            )
    elif any(minutes.values()):
        count("penalty_minutes", minutes["home"], minutes["away"])
    return stats
