"""Earlier seasons, from the federation's archive at stats.swehockey.se.

Neither league's own site will hand over a finished season - Hockeyallsvenskan
serves only the current one, whatever the URL asks for - but the federation
keeps every season of both leagues, back to 2004-05:

* a league's overview page carries a season picker, each option the id of
  that season's overview;
* a season's overview lists its series - the league itself, its playoffs,
  the play-out that decides promotion between SHL and Hockeyallsvenskan;
* each series has a schedule page with every game: date, clubs, score, the
  score period by period, the crowd and the arena.

Clubs move between the two leagues, so two clubs that meet in one league this
season may have met in the other last season; both are searched. A finished
season does not change, so each series is read once and kept in a store that
outlives restarts.
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from aiohttp import ClientError, ClientSession

from .api import TIMEOUT, USER_AGENT, HockeyApiError, Team
from .swehockey import BASE_URL, LEAGUES_URL, SITE_NAMES, _LEAGUE_LINK
from .tv import _names_match

_LOGGER = logging.getLogger(__name__)

OVERVIEW_URL = f"{BASE_URL}/ScheduleAndResults/Overview/{{id}}"
SERIES_SCHEDULE_URL = f"{BASE_URL}/ScheduleAndResults/Schedule/{{id}}"

# The leagues searched for earlier meetings, in the site's own names.
ARCHIVE_LEAGUES = tuple(SITE_NAMES.values())

DEFAULT_SEASONS = 5
MAX_SEASONS = 15

# The season picker: an option per season, "2025-26", newest first. Older
# seasons point straight at a schedule rather than at an overview.
_SEASON_OPTION = re.compile(
    r'<option id="/ScheduleAndResults/(Overview|Schedule)/(\d+)"[^>]*>\s*(\d{4})-\d{2}\s*</option>'
)
# A season's series, in the menu beside its overview: the open item is the
# page being shown, the closed ones its siblings.
_SERIES_ITEM = re.compile(
    r'<li class="(?:open|closed)Item[^"]*">\s*<a href="/ScheduleAndResults/Overview/(\d+)"[^>]*>([^<]+)</a>'
)
_ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
_CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)
_TAG = re.compile(r"<[^>]+>")
_DAY = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?$")
_TIME = re.compile(r"^\d{1,2}:\d{2}$")
_GAME = re.compile(r"^(.+?)\s+-\s+(.+)$")
_RESULT = re.compile(r"^(\d+)\s*-\s*(\d+)$")
_PERIODS = re.compile(r"^\((.*)\)$")

# How many pages are read at once: polite to the federation's site, and still
# a season of both leagues in a couple of seconds.
_PARALLEL = 4
# Which season is the current one changes once a year; asking daily notices.
_SEASONS_TTL = 24 * 3600

STORE_VERSION = 1


@dataclass(frozen=True, slots=True)
class ArchivedGame:
    """A game from a finished season, as the federation records it."""

    season: int
    league: str
    series: str
    start: str
    home: str
    away: str
    home_score: int
    away_score: int
    decided_in: str
    venue: str | None = None
    attendance: int | None = None

    def as_row(self) -> list[Any]:
        """Return the game compactly, for the store."""
        return [
            self.start,
            self.home,
            self.away,
            self.home_score,
            self.away_score,
            self.decided_in,
            self.venue,
            self.attendance,
        ]

    @classmethod
    def from_row(cls, season: int, league: str, series: str, row: list[Any]) -> ArchivedGame:
        """Return a game kept by as_row."""
        start, home, away, home_score, away_score, decided_in, venue, attendance = row
        return cls(
            season, league, series, start, home, away, home_score, away_score,
            decided_in, venue, attendance,
        )


def _text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", value))).strip()


def parse_seasons(page: str) -> list[tuple[int, str, str]]:
    """Return the season picker's options: (first year, page kind, id).

    Newest first, as the picker lists them; the first is the season shown.
    """
    seasons: list[tuple[int, str, str]] = []
    seen: set[int] = set()
    for kind, page_id, year in _SEASON_OPTION.findall(page):
        if int(year) in seen:
            continue
        seen.add(int(year))
        seasons.append((int(year), kind, page_id))
    return seasons


def parse_series(page: str) -> list[tuple[str, str]]:
    """Return a season's series - (id, name) - from its overview's menu."""
    series: list[tuple[str, str]] = []
    seen: set[str] = set()
    for page_id, name in _SERIES_ITEM.findall(page):
        if page_id in seen:
            continue
        seen.add(page_id)
        series.append((page_id, html.unescape(name).strip()))
    return series


def _is_playoff(series: str) -> bool:
    """Return True for a series decided in sudden death rather than shootouts."""
    name = series.casefold()
    return any(word in name for word in ("slutspel", "play out", "playout", "kval"))


def decided_in(periods: str, series: str) -> str:
    """Return how a game was decided, from its score period by period.

    Three periods is regulation. In a league game a fourth is overtime and a
    fifth the shootout, its winning goal written as a period of its own.
    Playoffs have no shootout: they play overtime until somebody scores.
    """
    count = len([part for part in periods.split(",") if part.strip()])
    if count <= 3:
        return "FT"
    if count >= 5 and not _is_playoff(series):
        return "SO"
    return "OT"


def parse_archive(page: str, season: int, league: str, series: str) -> list[ArchivedGame]:
    """Return a series' played games from its schedule page.

    The date is written on the first game of each day only, so it is carried
    down; a game without a result - postponed, cancelled - is left out.
    """
    games: list[ArchivedGame] = []
    day: str | None = None
    for row in _ROW.findall(page):
        raw = _CELL.findall(row)
        if not raw:
            continue
        clock = None
        fixture = result = periods = None
        venue = attendance = None
        for index, cell in enumerate(raw):
            # A playoff fixture has its round written under the clubs, after
            # a line break: the clubs are what comes before it.
            text = _text(cell.split("<br", 1)[0])
            if match := _DAY.match(text):
                day = match.group(1)
                clock = match.group(2) or clock
            elif _TIME.match(text):
                clock = clock or text
            elif result is None and (match := _RESULT.match(text)):
                result = (int(match.group(1)), int(match.group(2)))
            elif fixture is None and (match := _GAME.match(text)):
                fixture = (match.group(1).strip(), match.group(2).strip())
            elif periods is None and (match := _PERIODS.match(text)):
                periods = match.group(1)
                rest = [value for value in (_text(c) for c in raw[index + 1 :]) if value]
                if rest and rest[0].isdigit():
                    attendance = int(rest[0]) or None
                    rest = rest[1:]
                venue = rest[-1] if rest else None
                break
        if fixture is None or result is None or day is None:
            continue
        games.append(
            ArchivedGame(
                season=season,
                league=league,
                series=series,
                start=f"{day}T{clock or '00:00'}",
                home=fixture[0],
                away=fixture[1],
                home_score=result[0],
                away_score=result[1],
                decided_in=decided_in(periods or "", series),
                venue=venue,
                attendance=attendance,
            )
        )
    return games


@dataclass(slots=True)
class _Cached:
    value: Any
    at: float

    def fresh(self, ttl: float) -> bool:
        return time.monotonic() - self.at < ttl


class Archive:
    """Every finished season of both leagues, read on demand and kept."""

    def __init__(
        self,
        fetch: Callable[[str], Awaitable[str]],
        load: Callable[[], Awaitable[dict[str, Any] | None]],
        save: Callable[[Callable[[], dict[str, Any]]], None],
    ) -> None:
        """Initialise with how to read a page and how to keep what was read."""
        self._fetch = fetch
        self._load = load
        self._save = save
        self._stored: dict[str, Any] | None = None
        self._lock = asyncio.Lock()
        self._limit = asyncio.Semaphore(_PARALLEL)
        self._leagues: _Cached | None = None
        self._seasons: dict[str, _Cached] = {}

    async def _async_page(self, url: str) -> str:
        async with self._limit:
            return await self._fetch(url)

    async def _async_store(self) -> dict[str, Any]:
        async with self._lock:
            if self._stored is None:
                loaded = await self._load() or {}
                self._stored = {
                    "series": dict(loaded.get("series") or {}),
                    "seasons": dict(loaded.get("seasons") or {}),
                }
        return self._stored

    async def _async_league_ids(self) -> dict[str, str]:
        """Return this season's overview id for each league."""
        if self._leagues is not None and self._leagues.fresh(_SEASONS_TTL):
            return self._leagues.value
        page = await self._async_page(LEAGUES_URL)
        found: dict[str, str] = {}
        for league_id, name in _LEAGUE_LINK.findall(page):
            name = html.unescape(name).strip()
            if name in ARCHIVE_LEAGUES and name not in found:
                found[name] = league_id
        self._leagues = _Cached(found, time.monotonic())
        return found

    async def _async_past_seasons(self, league: str) -> list[tuple[int, str, str]]:
        """Return a league's finished seasons, newest first."""
        cached = self._seasons.get(league)
        if cached is not None and cached.fresh(_SEASONS_TTL):
            return cached.value
        league_id = (await self._async_league_ids()).get(league)
        if league_id is None:
            return []
        seasons = parse_seasons(await self._async_page(OVERVIEW_URL.format(id=league_id)))
        past = seasons[1:]
        self._seasons[league] = _Cached(past, time.monotonic())
        return past

    async def _async_series_of(self, league: str, kind: str, page_id: str) -> list[tuple[str, str]]:
        """Return a finished season's series, reading its overview once."""
        stored = await self._async_store()
        key = f"{kind}/{page_id}"
        if key in stored["seasons"]:
            return [tuple(item) for item in stored["seasons"][key]]
        if kind == "Schedule":
            series = [(page_id, league)]
        else:
            series = parse_series(await self._async_page(OVERVIEW_URL.format(id=page_id)))
        stored["seasons"][key] = [list(item) for item in series]
        self._save(lambda: self._stored or {})
        return series

    async def _async_games_of(
        self, season: int, league: str, series_id: str, series: str
    ) -> list[ArchivedGame]:
        """Return a finished series' games, reading its schedule once."""
        stored = await self._async_store()
        if (kept := stored["series"].get(series_id)) is not None:
            return [
                ArchivedGame.from_row(kept["season"], kept["league"], kept["series"], row)
                for row in kept["games"]
            ]
        page = await self._async_page(SERIES_SCHEDULE_URL.format(id=series_id))
        games = parse_archive(page, season, league, series)
        stored["series"][series_id] = {
            "season": season,
            "league": league,
            "series": series,
            "games": [game.as_row() for game in games],
        }
        self._save(lambda: self._stored or {})
        return games

    async def _async_season_games(
        self, league: str, season: tuple[int, str, str]
    ) -> list[ArchivedGame]:
        year, kind, page_id = season
        series = await self._async_series_of(league, kind, page_id)
        parts = await asyncio.gather(
            *(
                self._async_games_of(year, league, series_id, name)
                for series_id, name in series
            ),
            return_exceptions=True,
        )
        games: list[ArchivedGame] = []
        for part in parts:
            if isinstance(part, Exception):
                _LOGGER.debug("Could not read a series of %s %s: %s", league, year, part)
                continue
            games.extend(part)
        return games

    async def async_meetings(
        self, one: Team, other: Team, seasons: int = DEFAULT_SEASONS
    ) -> tuple[list[tuple[ArchivedGame, bool]], list[str]]:
        """Return the two clubs' meetings in the last few finished seasons.

        Each meeting comes with whether `one` was the home side, newest first,
        along with the seasons searched ("2025-26 SHL").
        """
        plans: list[tuple[str, tuple[int, str, str]]] = []
        for league in ARCHIVE_LEAGUES:
            try:
                past = await self._async_past_seasons(league)
            except HockeyApiError as err:
                _LOGGER.debug("No season list for %s: %s", league, err)
                continue
            plans.extend((league, season) for season in past[:seasons])
        if not plans:
            raise HockeyApiError("The federation's archive could not be read")

        found = await asyncio.gather(
            *(self._async_season_games(league, season) for league, season in plans),
            return_exceptions=True,
        )
        meetings: list[tuple[ArchivedGame, bool]] = []
        seen: set[tuple[str, str, str]] = set()
        for part in found:
            if isinstance(part, Exception):
                continue
            for game in part:
                if _names_match(game.home, one) and _names_match(game.away, other):
                    home = True
                elif _names_match(game.home, other) and _names_match(game.away, one):
                    home = False
                else:
                    continue
                key = (game.start, game.home, game.away)
                if key in seen:
                    continue
                seen.add(key)
                meetings.append((game, home))
        meetings.sort(key=lambda item: item[0].start, reverse=True)
        searched = [
            f"{year}-{str(year + 1)[2:]} {league}" for league, (year, _, _) in plans
        ]
        return meetings, searched


def page_reader(session: ClientSession) -> Callable[[str], Awaitable[str]]:
    """Return a function that reads one of the site's pages."""

    async def read(url: str) -> str:
        try:
            async with session.get(
                url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT
            ) as response:
                response.raise_for_status()
                page = await response.text()
        except (ClientError, TimeoutError) as err:
            raise HockeyApiError(f"Could not fetch {url}: {err}") from err
        return page.lstrip("\ufeff")

    return read
