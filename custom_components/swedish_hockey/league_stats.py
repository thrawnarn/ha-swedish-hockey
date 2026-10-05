"""The league's statistics: every skater, goalkeeper and club, one shape for both.

Both leagues keep their numbers in the same statnet system and publish them a
category at a time - points in one table, power play in the next, face-offs in
a third - under column names that differ a little between the two sites. Each
table is read here, every row pinned to its player or club, and the columns
renamed onto one set of keys:

* skaters: GP G A TP TP_GP PIM PlusMinus SOG S_perc PPG PPP SHG GWG ENG GFG
  A1 Hits BKS TOI_GP PPTOI_GP SHTOI_GP FO FOW FO_perc CF_perc PDO
* goalies: GP GPI W L SO SVS GA SOGA SVS_perc GAA MIP EV_SVS_perc PK_SVS_perc
* teams: GP W L OTW OTL SOW SOL PTS PTS_GP GF GA GD GF_GP GA_GP first_goal
  PPG PPO PP_perc PP_time PPGA PK_perc TSH PK_time SHG SHGA ST_perc ENG ENGA
  PIM PIM_GP minors majors SOG SOG_GP S_perc SOGA SOGA_GP SVS_perc BKS Hits
  FO FOW FO_perc CF_perc FF_perc PDO ATT_avg ATT_total ATT_GP

Percentages are numbers out of a hundred, times are "mm:ss" as the league
writes them, and a figure the league does not publish is left out rather than
sent as nothing. A rate only means something past a minimum - a forward who
has taken two face-offs and won both is not the league's best - and the league
says who has reached it: `S_perc_ok`, `FO_perc_ok` and a goalie's `ok`.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

from homeassistant.util import dt as dt_util

from .api import (
    HockeyApiError,
    LeagueClient,
    Team,
    club_key,
    match_team,
    season_year,
)
from .const import LEAGUE_HOCKEYALLSVENSKAN, LEAGUE_SHL

_LOGGER = logging.getLogger(__name__)

# The tables move once a game is over and not otherwise, and a statistics
# page is read in bursts - opened, sorted, a player looked at - so ten minutes
# keeps a burst to one read without leaving last night's numbers up for long.
STATS_TTL = 600
# A score of reads for the whole league; a few at a time is plenty quick and
# is no flood against a site that serves its own pages from the same API.
_PARALLEL = 5

# Each league's tables, and the columns kept from each. The first table of a
# kind is the one a row has to be in: the rest only add columns to it.
_HA_TABLES: dict[str, list[tuple[str, dict[str, str]]]] = {
    "skaters": [
        (
            "skaters/summary",
            {
                "GP": "GP",
                "G": "G",
                "A": "A",
                "TP": "TP",
                "TP_GP": "TPPG",
                "PIM": "PIM",
                "GWG": "GWG",
                "PPG": "PPG",
                "SOG": "SOG",
                "Hits": "Hits",
                "BKS": "BKS",
                "PlusMinus": "PlusMinus",
                "TOI_GP": "TOI_GP",
            },
        ),
        (
            "skaters/points",
            {"A1": "Assists.A1", "PPP": "PP.TP", "SHG": "PK.G", "EQP": "EQ.TP"},
        ),
        ("skaters/goals", {"ENG": "ENG", "GFG": "GFG"}),
        ("skaters/offensive", {"S_perc": "SG_perc", "S_perc_ok": "ValidRanking"}),
        (
            "skaters/faceoffs",
            {"FO": "FO", "FOW": "FOW", "FO_perc": "FO_perc", "FO_perc_ok": "ValidRanking"},
        ),
        ("skaters/time_on_ice", {"PPTOI_GP": "PPTOI_GP", "SHTOI_GP": "SHTOI_GP"}),
        ("skaters/corsi_fenwick_pdo", {"CF_perc": "Corsi.CF_perc", "PDO": "PDO.PDO"}),
    ],
    "goalies": [
        (
            "goalies/summary",
            {
                "GP": "GP",
                "GPI": "GPI",
                "W": "W",
                "L": "L",
                "SO": "SO",
                "SVS": "SVS",
                "GA": "GA",
                "SVS_perc": "SVS_perc",
                "GAA": "GAA",
                "MIP": "MIP",
                "ok": "ValidRanking",
            },
        ),
        (
            "goalies/game_strength",
            {
                "EV_SVS_perc": "EvenStrength.SVS_perc",
                "PK_SVS_perc": "PenaltyKill.SVS_perc",
            },
        ),
        ("goalies/defensive", {"SOGA": "SOGA"}),
    ],
    "teams": [
        (
            "teams/results",
            {
                "GP": "GP",
                "W": "W",
                "L": "L",
                "OTW": "OTW",
                "OTL": "OTL",
                "SOW": "SOW",
                "SOL": "SOL",
                "PTS": "Points",
                "PTS_GP": "P_GP",
                "GF": "G",
                "GA": "GA",
                "GF_GP": "GPG",
                "GA_GP": "GAPG",
                "first_goal": "GFG",
            },
        ),
        # The goals table files the goals let in against the man advantage
        # under the side that had it - PowerPlay.GA is the opponents' power
        # play goals - where the power play and penalty kill tables file them
        # under the side that let them in. Those two are taken from the
        # tables where the meaning is not in doubt.
        (
            "teams/goals",
            {
                "PPG": "PowerPlay.PPG",
                "SHG": "PenaltyKill.G",
                "ENG": "EmptyNet.G",
                "ENGA": "EmptyNet.GA",
            },
        ),
        (
            "teams/power_play",
            {
                "PPO": "PowerPlay.OPP",
                "PP_perc": "PowerPlay.PP_perc",
                "PP_time": "PowerPlay.TPP",
                "SHGA": "PowerPlay.GA",
                "ST_perc": "ST_perc",
            },
        ),
        (
            "teams/penalty_kill",
            {
                "TSH": "PenaltyKill.OPP",
                "PK_perc": "PenaltyKill.PK_perc",
                "PK_time": "PenaltyKill.TSH",
                "PPGA": "PenaltyKill.GA",
            },
        ),
        (
            "teams/penalties",
            {"PIM": "PIM", "minors": "MIN_2", "majors": "MIN_5", "GM": "GM", "MP": "MP"},
        ),
        ("teams/offensive", {"SOG": "SOG", "S_perc": "SEFF"}),
        (
            "teams/defensive",
            {"SOGA": "SOGA", "SVS_perc": "SVS_perc", "BKS": "BKS", "Hits": "Hits"},
        ),
        ("teams/faceoffs", {"FO": "FO", "FOW": "FOW", "FO_perc": "FO_perc"}),
        (
            "teams/corsi_fenwick_pdo",
            {"CF_perc": "Corsi.CF_perc", "FF_perc": "Fenwick.FF_perc", "PDO": "PDO.PDO"},
        ),
        (
            "teams/attendance",
            {"ATT_avg": "home.AVG", "ATT_total": "home.TOTAL", "ATT_GP": "home.GP"},
        ),
    ],
}

_SHL_TABLES: dict[str, list[tuple[str, dict[str, str]]]] = {
    "skaters": [
        (
            "players_summary",
            {
                "GP": "GP",
                "G": "G",
                "A": "A",
                "TP": "TP",
                "TP_GP": "TPPG",
                "PIM": "PIM",
                "GWG": "GWG",
                "PPG": "PPG",
                "SOG": "SOG",
                "Hits": "Hits",
                "BKS": "BkS",
                "PlusMinus": "PlusMinus",
                "TOI_GP": "TOI_GP",
            },
        ),
        (
            "players_point",
            {"A1": "AFirsts", "PPP": "PPTP", "SHG": "SHG", "EQP": "EQTP"},
        ),
        ("players_goal", {"ENG": "ENG", "GFG": "GFG"}),
        ("players_shot", {"S_perc": "SGPerc", "S_perc_ok": "ValidRanking"}),
        (
            "players_faceoff",
            {"FO": "FO", "FOW": "FOW", "FO_perc": "FOPerc", "FO_perc_ok": "ValidRanking"},
        ),
        ("players_timeOnIce", {"PPTOI_GP": "PPTOI_GP", "SHTOI_GP": "SHTOI_GP"}),
    ],
    "goalies": [
        (
            "goalkeepers_summary",
            {
                "GP": "GP",
                "GPI": "GPI",
                "W": "W",
                "L": "L",
                "SO": "SO",
                "SVS": "SVS",
                "GA": "GA",
                "SVS_perc": "SVSPerc",
                "GAA": "GAA",
                "MIP": "MIP",
                "ok": "ValidRanking",
            },
        ),
        (
            "goalkeepers_strength",
            {"EV_SVS_perc": "ESSVSPerc", "PK_SVS_perc": "SHSVSPerc"},
        ),
    ],
    "teams": [
        (
            "teams_result",
            {
                "GP": "GP",
                "W": "W",
                "L": "L",
                "OTW": "OTW",
                "OTL": "OTL",
                "SOW": "SOW",
                "SOL": "SOL",
                "PTS": "Points",
                "PTS_GP": "P_GP_format",
                "GF": "G",
                "GA": "GA",
                "GF_GP": "GPG",
                "GA_GP": "GAPG",
                "first_goal": "GFG",
            },
        ),
        (
            "teams_goal",
            {
                "PPG": "PPG",
                "SHGA": "SHGA",
                "SHG": "SHG",
                "PPGA": "PPGA",
                "ENG": "ENG",
                "ENGA": "ENGA",
            },
        ),
        (
            "teams_powerplay",
            {"PPO": "PPOpp", "PP_perc": "PPPerc", "PP_time": "PPTime", "ST_perc": "STPerc"},
        ),
        (
            "teams_penaltyKilling",
            {"TSH": "PKOpp", "PK_perc": "PKPerc", "PK_time": "PKTime"},
        ),
        (
            "teams_penalty",
            {"PIM": "PIM", "minors": "Minor", "majors": "Major", "GM": "GM", "MP": "MP"},
        ),
        ("teams_shotsForward", {"SOG": "SOG", "S_perc": "SEff"}),
        (
            "teams_shotsAgainst",
            {"SOGA": "SOGA", "SVS_perc": "SVSPerc", "BKS": "BkS", "Hits": "Hits"},
        ),
        ("teams_faceoff", {"FO": "FO", "FOW": "FOW", "FO_perc": "FOPerc"}),
        (
            "teams_attendance",
            {"ATT_avg": "AttAvgHome", "ATT_total": "AttTotalHome", "ATT_GP": "GPHome"},
        ),
    ],
}

# Where to read on past what the card shows.
_STATS_URLS = {
    LEAGUE_HOCKEYALLSVENSKAN: "https://hockeyallsvenskan.se/pages/stats",
    LEAGUE_SHL: "https://www.shl.se/statistik",
}

# Rates read per game from the totals, for the clubs: a club that has played
# a game more than the next should not lead on that alone.
_PER_GAME = {"PIM_GP": "PIM", "SOG_GP": "SOG", "SOGA_GP": "SOGA"}


def _dig(row: dict[str, Any], path: str) -> Any:
    """Return a value from a row by a dotted path into its nested blocks."""
    value: Any = row
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _number(value: Any) -> Any:
    """Return a figure as a number, or as the league wrote it for a time.

    Counts come as numbers and rates as strings ("17.86", "2.14"); a time
    ("18:41", "2:38:18") is kept as written. Anything empty is None.
    """
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value, 2)
    text = str(value).strip()
    if not text or text == "-":
        return None
    if ":" in text:
        return text
    try:
        number = float(text.replace(",", "."))
    except ValueError:
        return text
    return int(number) if number.is_integer() and "." not in text else round(number, 2)


def _per_game(total: Any, games: Any) -> float | None:
    """Return a total spread over the games it came from."""
    if not isinstance(total, (int, float)) or not isinstance(games, int) or games <= 0:
        return None
    return round(total / games, 2)


class _Clubs:
    """Find the integration's team for the codes and names a stats row uses.

    The stats system and the schedule do not always agree on a club's code -
    "MoDo" and "MODO", "MORA" and "MIK" - so every spelling a row offers is
    tried, the code first, and what was found is remembered.
    """

    def __init__(self, teams: dict[str, Team]) -> None:
        self._teams = teams
        self._found: dict[str, Team | None] = {}

    def find(self, *candidates: Any) -> Team | None:
        for candidate in candidates:
            if candidate is None or not str(candidate).strip():
                continue
            key = club_key(str(candidate))
            if key not in self._found:
                self._found[key] = match_team(self._teams, str(candidate))
            if (team := self._found[key]) is not None:
                return team
        return None


def _identity(league: str, kind: str, row: dict[str, Any]) -> tuple[str, list[Any], dict[str, Any]]:
    """Return who a row is about: a name, the club spellings, and what else it says.

    A club's row has no name of its own beyond the club, so its name is its
    first spelling.
    """
    if league == LEAGUE_SHL:
        info = row.get("info") if isinstance(row.get("info"), dict) else {}
        if kind == "teams":
            names = info.get("teamNames") or {}
            clubs = [
                info.get("teamCode"),
                info.get("id"),
                names.get("code"),
                names.get("long"),
                names.get("short"),
            ]
            return str(clubs[0] or clubs[1] or ""), clubs, {}
        team = info.get("team") or {}
        clubs = [
            info.get("teamCode"),
            team.get("code"),
            team.get("siteDisplayName"),
            team.get("name"),
        ]
        extra = {
            "jersey": info.get("number"),
            "position_code": info.get("position"),
        }
        name = info.get("fullName") or " ".join(
            part for part in (info.get("firstName"), info.get("lastName")) if part
        )
        return str(name or ""), clubs, extra
    if kind == "teams":
        return str(row.get("team_code") or ""), [row.get("team_code")], {}
    return str(row.get("player") or ""), [row.get("team"), row.get("stat_net_team")], {}


async def async_league_statistics(
    client: LeagueClient,
    teams: dict[str, Team],
    location: str = "all",
    last: int | None = None,
) -> dict[str, Any]:
    """Read every statistics table for the league and return them as one.

    A table that cannot be read costs only its own columns; a kind of row with
    no table at all comes back empty. Only when nothing at all can be read is
    that an error.
    """
    league = client.league
    if last and league == LEAGUE_SHL:
        raise NotImplementedError("SHL statistics cover the season or home/away")
    spec = _SHL_TABLES if league == LEAGUE_SHL else _HA_TABLES
    clubs = _Clubs(teams)
    gate = asyncio.Semaphore(_PARALLEL)

    async def read(table: str) -> list[dict[str, Any]] | None:
        async with gate:
            try:
                return await client.async_stats_table(table, location, last)
            except HockeyApiError as err:
                _LOGGER.debug("Statistics table %s could not be read: %s", table, err)
                return None

    jobs = [(kind, table, columns) for kind, tables in spec.items() for table, columns in tables]
    answers = await asyncio.gather(*(read(table) for _, table, _ in jobs))
    if all(answer is None for answer in answers):
        raise HockeyApiError(f"No statistics could be read for {league}")

    merged: dict[str, dict[tuple[str, str], dict[str, Any]]] = {kind: {} for kind in spec}
    for (kind, table, columns), rows in zip(jobs, answers, strict=True):
        first = table == spec[kind][0][0]
        for row in rows or []:
            name, spellings, extra = _identity(league, kind, row)
            if not name:
                continue
            team = clubs.find(*spellings)
            code = team.key if team else name if kind == "teams" else str(spellings[0] or "")
            key = (club_key(name), club_key(code))
            entry = merged[kind].get(key)
            if entry is None:
                if not first:
                    continue
                entry = merged[kind][key] = _base(kind, name, code, team, extra)
            for ours, theirs in columns.items():
                value = _number(_dig(row, theirs))
                if ours.endswith("ok") and value is not None:
                    value = bool(value)
                if value is not None:
                    entry[ours] = value

    skaters = list(merged["skaters"].values())
    goalies = list(merged["goalies"].values())
    team_rows = list(merged["teams"].values())

    # A goalkeeper is listed among the skaters as well, at no points from no
    # shots; his own table is the one worth reading.
    keepers = {(club_key(row["player"]), club_key(row["team_code"])) for row in goalies}
    skaters = [
        row
        for row in skaters
        if (club_key(row["player"]), club_key(row["team_code"])) not in keepers
    ]

    for row in team_rows:
        if isinstance(row.get("GF"), int) and isinstance(row.get("GA"), int):
            row["GD"] = row["GF"] - row["GA"]
        for ours, total in _PER_GAME.items():
            if (value := _per_game(row.get(total), row.get("GP"))) is not None:
                row[ours] = value

    if league == LEAGUE_HOCKEYALLSVENSKAN:
        await _async_add_profiles(client, clubs, skaters + goalies)

    return {
        "league": league,
        "season": season_year(),
        "location": location,
        "last": last,
        "updated": dt_util.utcnow().isoformat(),
        "stats_url": _STATS_URLS.get(league),
        # What else this league can be asked for, so a card offers no choice
        # that would only come back as an error.
        "scopes": {"last": league == LEAGUE_HOCKEYALLSVENSKAN, "location": True},
        "skaters": skaters,
        "goalies": goalies,
        "teams": team_rows,
    }


def _base(
    kind: str, name: str, code: str, team: Team | None, extra: dict[str, Any]
) -> dict[str, Any]:
    """Return the start of a row: who it is about, before any figure."""
    row: dict[str, Any] = {
        "team_code": code,
        "team": team.name if team else code,
    }
    if kind == "teams":
        if team and team.logo:
            row["logo"] = team.logo
        if team and team.color:
            row["color"] = team.color
        return row
    # A player's crest is his club's, which the club rows carry: three
    # hundred copies of the same few links would only make the answer longer.
    row["player"] = name
    row.update({key: value for key, value in extra.items() if value not in (None, "")})
    return row


async def _async_add_profiles(
    client: LeagueClient, clubs: _Clubs, players: list[dict[str, Any]]
) -> None:
    """Give each player the picture, position and shirt number the roster has.

    Matched on name and club, then on the name alone where only one player in
    the league answers to it - a player moved mid-season is listed under his
    new club on the roster and under both in the stats.
    """
    try:
        profiles = await client.async_league_profiles()
    except (HockeyApiError, NotImplementedError) as err:
        _LOGGER.debug("No profiles to put faces to the statistics: %s", err)
        return

    by_club: dict[tuple[str, str], dict[str, Any]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for profile in profiles:
        name = club_key(profile.get("name"))
        if not name:
            continue
        team = clubs.find(profile.get("team"), profile.get("team_name"))
        by_club[(name, club_key(team.key if team else profile.get("team")))] = profile
        by_name.setdefault(name, []).append(profile)

    for row in players:
        name = club_key(row.get("player"))
        profile = by_club.get((name, club_key(row.get("team_code"))))
        if profile is None and len(by_name.get(name, [])) == 1:
            profile = by_name[name][0]
        if profile is None:
            continue
        for ours, theirs in (
            ("photo", "photo"),
            ("jersey", "jersey"),
            ("position_code", "position_code"),
        ):
            if profile.get(theirs) not in (None, ""):
                row[ours] = profile[theirs]


class LeagueStatistics:
    """The league's statistics, read when asked for and kept for a while.

    Kept per scope - the season, home or away, the last few games - since each
    is a read of its own. Two asking at once for the same scope share a read.
    """

    def __init__(
        self, client: LeagueClient, teams: Callable[[], dict[str, Team]]
    ) -> None:
        """Remember where to read from and how to find the league's clubs."""
        self._client = client
        self._teams = teams
        self._kept: dict[tuple[str, int | None], tuple[float, dict[str, Any]]] = {}
        self._locks: dict[tuple[str, int | None], asyncio.Lock] = {}

    async def async_get(
        self, location: str = "all", last: int | None = None
    ) -> dict[str, Any]:
        """Return the statistics for a scope, reading them if they are old."""
        key = (location, last or None)
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            now = time.monotonic()
            kept = self._kept.get(key)
            if kept and now - kept[0] < STATS_TTL:
                return kept[1]
            result = await async_league_statistics(
                self._client, self._teams(), location, last or None
            )
            self._kept = {
                scope: value
                for scope, value in self._kept.items()
                if now - value[0] < STATS_TTL
            }
            self._kept[key] = (now, result)
            return result
