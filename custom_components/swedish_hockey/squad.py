"""Who the clubs' players are, on average: height, weight, age and the rest.

Pure: handed every squad in the league (`LeagueClient.async_squad_profiles`)
and a way to find the integration's club for each, it answers `get_squads`.
Every club is measured against the others, so the whole league is always
worked out even when one club is asked about.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterable
from datetime import date
from typing import Any

from .api import Team

# What the averages are taken over. A goalkeeper is a third of what they are
# about, so the positions are told apart as well as put together.
FIGURES = ("height", "weight", "age")
POSITION_GROUPS = ("gk", "d", "f")
_GROUP_OF = {
    "GK": "gk",
    "G": "gk",
    "D": "d",
    "LD": "d",
    "RD": "d",
    "F": "f",
    "LW": "f",
    "RW": "f",
    "CE": "f",
    "C": "f",
}
# A zero, or a weight typed into the height, is a gap in the record rather
# than a player; outside these it is left out of the averages.
_PLAUSIBLE = {"height": (150, 220), "weight": (55, 150), "age": (14, 50)}

# Hockeyallsvenskan writes countries in three letters, the SHL in two.
_ALPHA2 = {
    "SWE": "SE", "FIN": "FI", "CAN": "CA", "USA": "US", "NOR": "NO",
    "DEN": "DK", "DNK": "DK", "CZE": "CZ", "SVK": "SK", "LAT": "LV",
    "LVA": "LV", "GER": "DE", "DEU": "DE", "SUI": "CH", "CHE": "CH",
    "AUT": "AT", "RUS": "RU", "BLR": "BY", "FRA": "FR", "SLO": "SI",
    "SVN": "SI", "KAZ": "KZ", "UKR": "UA", "EST": "EE", "LTU": "LT",
    "GBR": "GB", "ITA": "IT", "POL": "PL", "HUN": "HU", "NED": "NL",
    "NLD": "NL", "JPN": "JP", "AUS": "AU", "ISL": "IS", "CRO": "HR",
    "HRV": "HR", "SRB": "RS", "ROU": "RO",
}
_COUNTRY_NAMES = {
    "SE": "Sverige", "FI": "Finland", "CA": "Kanada", "US": "USA",
    "NO": "Norge", "DK": "Danmark", "CZ": "Tjeckien", "SK": "Slovakien",
    "LV": "Lettland", "DE": "Tyskland", "CH": "Schweiz", "AT": "Österrike",
    "RU": "Ryssland", "BY": "Belarus", "FR": "Frankrike", "SI": "Slovenien",
    "KZ": "Kazakstan", "UA": "Ukraina", "EE": "Estland", "LT": "Litauen",
    "GB": "Storbritannien", "IT": "Italien", "PL": "Polen", "HU": "Ungern",
    "NL": "Nederländerna", "JP": "Japan", "AU": "Australien", "IS": "Island",
    "HR": "Kroatien", "RS": "Serbien", "RO": "Rumänien",
}
HOME_COUNTRY = "SE"


def country_code(value: Any) -> str | None:
    """Return a country as its two-letter code, whichever way it was written."""
    text = str(value or "").strip().upper()
    if not text:
        return None
    return _ALPHA2.get(text, text)


def country_name(code: str | None) -> str | None:
    """Return a country's Swedish name, or its code when there is none here."""
    return _COUNTRY_NAMES.get(code, code) if code else None


def age_on(birth_date: Any, today: date) -> float | None:
    """Return someone's age in years, with the part year, from an ISO date."""
    try:
        born = date.fromisoformat(str(birth_date)[:10])
    except (TypeError, ValueError):
        return None
    return (today - born).days / 365.2425


def _player(profile: dict[str, Any], today: date) -> dict[str, Any]:
    """Return the parts of a profile the averages are made of."""
    figures: dict[str, float | None] = {
        "height": profile.get("height"),
        "weight": profile.get("weight"),
        "age": age_on(profile.get("birth_date"), today),
    }
    for key, (low, high) in _PLAUSIBLE.items():
        value = figures[key]
        if not isinstance(value, (int, float)) or not low <= value <= high:
            figures[key] = None
    shoots = str(profile.get("shoots") or "").strip()[:1].upper()
    return {
        **figures,
        "name": profile.get("name"),
        "group": _GROUP_OF.get(str(profile.get("position_code") or "").upper()),
        "shoots": shoots if shoots in ("L", "R") else None,
        "country": country_code(profile.get("country")),
    }


def _means(players: list[dict[str, Any]]) -> dict[str, Any]:
    """Return how many players there are and their average figures."""
    result: dict[str, Any] = {"players": len(players)}
    for key in FIGURES:
        values = [p[key] for p in players if p[key] is not None]
        result[key] = round(sum(values) / len(values), 1) if values else None
    return result


def _extreme(
    players: list[dict[str, Any]], key: str, *, highest: bool
) -> dict[str, Any] | None:
    """Return the player at one end of a figure, and the figure."""
    known = [p for p in players if p[key] is not None and p["name"]]
    if not known:
        return None
    pick = (max if highest else min)(known, key=lambda p: p[key])
    value = pick[key]
    return {
        "player": pick["name"],
        "value": round(value, 1) if key == "age" else value,
    }


def _club(players: list[dict[str, Any]]) -> dict[str, Any]:
    """Return one club's squad in figures."""
    shoots = Counter(p["shoots"] for p in players if p["shoots"])
    countries = Counter(p["country"] for p in players if p["country"])
    return {
        **_means(players),
        "positions": {
            group: _means([p for p in players if p["group"] == group])
            for group in POSITION_GROUPS
            if any(p["group"] == group for p in players)
        },
        "shoots": {"left": shoots.get("L", 0), "right": shoots.get("R", 0)},
        "home_grown": countries.get(HOME_COUNTRY, 0),
        "countries": [
            {"country": code, "name": country_name(code), "players": count}
            for code, count in sorted(countries.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "tallest": _extreme(players, "height", highest=True),
        "shortest": _extreme(players, "height", highest=False),
        "heaviest": _extreme(players, "weight", highest=True),
        "lightest": _extreme(players, "weight", highest=False),
        "oldest": _extreme(players, "age", highest=True),
        "youngest": _extreme(players, "age", highest=False),
    }


def squad_figures(
    profiles: Iterable[dict[str, Any]],
    find: Callable[..., Team | None],
    today: date,
) -> dict[str, Any]:
    """Return every club's squad in figures, each placed against the others.

    `find` is handed the club spellings a profile carries and returns the
    integration's team, or None for a player whose club is not in the league.
    A place of 1 is the tallest, heaviest or oldest - which says nothing about
    which is better, so nothing here does either.
    """
    clubs: dict[str, tuple[Team, list[dict[str, Any]]]] = {}
    everyone: list[dict[str, Any]] = []
    for profile in profiles:
        team = find(profile.get("team"), profile.get("team_name"))
        if team is None:
            continue
        player = _player(profile, today)
        clubs.setdefault(team.key, (team, []))[1].append(player)
        everyone.append(player)

    teams = [
        {"team_code": team.key, "team": team.name, "logo": team.logo, **_club(players)}
        for team, players in clubs.values()
    ]
    for key in FIGURES:
        ranked = sorted(
            (row for row in teams if row[key] is not None),
            key=lambda row: -row[key],
        )
        for row in teams:
            row.setdefault("ranks", {})[key] = None
        for place, row in enumerate(ranked, 1):
            # Level clubs share a place, as they do in the tables.
            if place > 1 and row[key] == ranked[place - 2][key]:
                place = ranked[place - 2]["ranks"][key]
            row["ranks"][key] = place
    teams.sort(key=lambda row: row["team"])

    countries = Counter(p["country"] for p in everyone if p["country"])
    shoots = Counter(p["shoots"] for p in everyone if p["shoots"])
    return {
        "teams": teams,
        "league": {
            **_means(everyone),
            "positions": {
                group: _means([p for p in everyone if p["group"] == group])
                for group in POSITION_GROUPS
            },
            "shoots": {"left": shoots.get("L", 0), "right": shoots.get("R", 0)},
            "home_grown": countries.get(HOME_COUNTRY, 0),
            "clubs": len(teams),
        },
    }
