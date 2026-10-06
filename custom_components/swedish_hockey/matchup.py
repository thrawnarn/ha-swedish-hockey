"""Two clubs before they meet, worked out from the season in memory.

Where each stands is the table's business; this is how each has been
playing - its last games, at home and away, its record and its run - and what
happened the times the two have met this season. Pure functions over the
league's games, so the services and the table can share them and the tests
can hold them to account without Home Assistant.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import date, datetime
from typing import Any

from .api import Game, Team

# Three points for a win in regulation, two for one in overtime or a shootout,
# one for a loss there and none for a loss in regulation: both leagues' rule.
_POINTS = {"win": 3, "otwin": 2, "otloss": 1, "loss": 0, "draw": 1}


def outcome(game: Game, team_key: str) -> str | None:
    """Return how a played game went for one side.

    A win in overtime or a shootout is worth less than one in regulation and a
    loss there is worth more than none at all, so the four are kept apart.
    """
    if not game.has_result or not game.involves(team_key):
        return None
    is_home = game.home.key == team_key
    ours = game.home_score if is_home else game.away_score
    theirs = game.away_score if is_home else game.home_score
    extra = (game.decided_in or "FT").upper() not in ("FT", "")
    if ours == theirs:
        return "draw"
    if ours > theirs:
        return "otwin" if extra else "win"
    return "otloss" if extra else "loss"


def form_of(games: list[Game], team_key: str, count: int) -> list[dict[str, Any]]:
    """Return how a club's last few games went, oldest first."""
    form = []
    for game in games[-count:] if count else []:
        is_home = game.home.key == team_key
        ours = game.home_score if is_home else game.away_score
        theirs = game.away_score if is_home else game.home_score
        form.append(
            {
                "result": outcome(game, team_key),
                "start": game.start.isoformat(),
                "opponent": (game.away if is_home else game.home).key,
                "is_home": is_home,
                "score": f"{ours}-{theirs}",
                "decided_in": game.decided_in,
            }
        )
    return form


def record(games: Iterable[Game], team_key: str) -> dict[str, int]:
    """Return a club's record over some played games, as a table counts it."""
    counts = {"win": 0, "otwin": 0, "otloss": 0, "loss": 0, "draw": 0}
    goals_for = goals_against = 0
    for game in games:
        result = outcome(game, team_key)
        if result is None:
            continue
        counts[result] += 1
        is_home = game.home.key == team_key
        goals_for += (game.home_score if is_home else game.away_score) or 0
        goals_against += (game.away_score if is_home else game.home_score) or 0
    played = sum(counts.values())
    return {
        "games": played,
        "wins": counts["win"],
        "overtime_wins": counts["otwin"],
        "overtime_losses": counts["otloss"],
        "losses": counts["loss"],
        "goals_for": goals_for,
        "goals_against": goals_against,
        "points": sum(_POINTS[kind] * number for kind, number in counts.items()),
    }


def streak(games: list[Game], team_key: str) -> dict[str, Any] | None:
    """Return the run a club is on: how many wins, or losses, in a row.

    Overtime counts with the side it fell to - a shootout win continues a run
    of wins - since a run is about who came off the ice on top.
    """
    kind: str | None = None
    count = 0
    for game in reversed(games):
        result = outcome(game, team_key)
        if result is None:
            continue
        this = "win" if result in ("win", "otwin") else "loss" if result != "draw" else "draw"
        if kind is None:
            kind = this
        if this != kind:
            break
        count += 1
    return {"kind": kind, "count": count} if kind else None


def played_before(
    games: Iterable[Game], team_key: str, before: datetime
) -> list[Game]:
    """Return a club's played games before a moment, oldest first."""
    return sorted(
        (
            game
            for game in games
            if game.involves(team_key) and game.has_result and game.start < before
        ),
        key=lambda game: game.start,
    )


def team_summary(
    games: Iterable[Game],
    team: Team,
    before: datetime,
    *,
    local_date: Callable[[datetime], date],
    form_games: int = 5,
) -> dict[str, Any]:
    """Return how a club comes into a game: its form, records, run and rest."""
    games = list(games)
    played = played_before(games, team.key, before)
    home = [game for game in played if game.home.key == team.key]
    away = [game for game in played if game.away.key == team.key]
    last = played[-1] if played else None
    # Rest is the gap to the club's game before this one on the schedule,
    # played or not: a game in January is not "97 days of rest" from tonight.
    previous = max(
        (game.start for game in games if game.involves(team.key) and game.start < before),
        default=None,
    )
    return {
        "team_code": team.key,
        "team": team.name,
        "logo": team.logo,
        "color": team.color,
        "form": form_of(played, team.key, form_games),
        "home_form": form_of(home, team.key, form_games),
        "away_form": form_of(away, team.key, form_games),
        "record": record(played, team.key),
        "home_record": record(home, team.key),
        "away_record": record(away, team.key),
        "streak": streak(played, team.key),
        "last_game": (
            dict(form_of([last], team.key, 1)[0], opponent_name=(
                last.away if last.home.key == team.key else last.home
            ).name)
            if last
            else None
        ),
        # Days between the last game and this one: a club on the second night
        # of a back-to-back is not the club that has had a week off.
        "rest_days": (
            (local_date(before) - local_date(previous)).days if previous else None
        ),
    }


def meetings(games: Iterable[Game], one: str, other: str) -> list[Game]:
    """Return every game between two clubs, in the order they are played."""
    return sorted(
        (game for game in games if game.involves(one) and game.involves(other)),
        key=lambda game: game.start,
    )


def head_to_head(results: Iterable[dict[str, Any]], team_key: str) -> dict[str, Any]:
    """Count up played meetings from one club's side.

    Each meeting is a dict with home_code, home_score, away_score and
    decided_in - this season's from the schedule, earlier ones from the
    federation's archive - so both can be counted the same way.
    """
    summary = {
        "games": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "overtime": 0,
        "goals_for": 0,
        "goals_against": 0,
    }
    for game in results:
        home, away = game.get("home_score"), game.get("away_score")
        if home is None or away is None:
            continue
        is_home = game.get("home_code") == team_key
        ours, theirs = (home, away) if is_home else (away, home)
        summary["games"] += 1
        summary["goals_for"] += ours
        summary["goals_against"] += theirs
        if ours > theirs:
            summary["wins"] += 1
        elif ours < theirs:
            summary["losses"] += 1
        else:
            summary["draws"] += 1
        if (game.get("decided_in") or "FT").upper() not in ("FT", ""):
            summary["overtime"] += 1
    return summary
