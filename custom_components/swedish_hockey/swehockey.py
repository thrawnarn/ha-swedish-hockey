"""The game sheet from stats.swehockey.se, for what the league feeds leave out.

Svenska Ishockeyförbundet keeps the official record of every game in both
leagues, and its game page carries the numbers neither league's own feed does:
the score period by period, save and shooting percentages, how long each side
had the extra man, and shots, saves and penalty minutes split by period. The
score itself is still taken from the league; this is only the sheet beside it.

The site is server rendered and has no API, so it is read as HTML. A game is
found in two steps: the league's live page lists the games of the day, its
schedule every game played so far, each with the id of its game page. Neither
uses the league's ids or club codes, so a game is paired with ours by the day it
is played and the two clubs' names, as the tv.nu listings are.
"""

from __future__ import annotations

import html
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from aiohttp import ClientError, ClientSession

from homeassistant.util import dt as dt_util

from .api import TIMEOUT, USER_AGENT, Game, HockeyApiError
from .const import LEAGUE_HOCKEYALLSVENSKAN, LEAGUE_SHL
from .tv import _names_match

_LOGGER = logging.getLogger(__name__)

BASE_URL = "https://stats.swehockey.se"
LEAGUES_URL = f"{BASE_URL}/ScheduleAndResults/Live/"
LIVE_URL = f"{BASE_URL}/ScheduleAndResults/Live/{{league}}"
SCHEDULE_URL = f"{BASE_URL}/ScheduleAndResults/Schedule/{{league}}"
GAME_URL = f"{BASE_URL}/Game/Events/{{game}}"

# What the site calls each league in its menu. The id behind the name is new
# every season, so it is looked up rather than kept.
SITE_NAMES = {LEAGUE_SHL: "SHL", LEAGUE_HOCKEYALLSVENSKAN: "HockeyAllsvenskan"}

# The league id holds for a season; asking once a day notices the next one.
_LEAGUE_TTL = 24 * 3600
# The schedule page is rebuilt once a morning, the live page every few seconds.
_LIST_TTL = 10 * 60
# The game page reloads itself every 15 seconds; a minute is plenty for
# numbers that are read beside the score rather than instead of it.
SHEET_TTL = 60

# The menu links each league to its live page on a game day and to its
# overview otherwise (seen 2026-10-06, a Tuesday): the id is the season's
# either way. Matching only the live link found no league on a quiet day, and
# that answer was kept for a day.
_LEAGUE_LINK = re.compile(
    r"pageVisited\('/ScheduleAndResults/(?:Live|Overview)/(\d+)'\s*,\s*'([^']+)'\)"
)
_GAME_LINK = re.compile(r"/Game/Events/(\d+)")
# A game on the live page: the home club's name, the link to its page, the away
# club's name. The page draws every game twice, for narrow and wide screens.
_LIVE_GAME = re.compile(
    r'font-weight-bold">([^<]+)</div>.*?/Game/Events/(\d+).*?font-weight-bold">([^<]+)</div>',
    re.DOTALL,
)
_ROW = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
_DAY = re.compile(r">\s*(\d{4}-\d{2}-\d{2})\s*<")
_FIXTURE = re.compile(
    r'<td class="td\w+ \w*[pP]addingTop">\s*([^<]+?)\s+-\s+([^<]+?)\s*</td>'
)
# One side of a counted stat: its label, the total, and the split by period.
_COUNT = re.compile(
    r">\s*(Shots|Saves|PIM|PP)\s*</td>\s*<td[^>]*>\s*<strong>\s*([^<]*?)\s*</strong>"
    r"\s*</td>\s*<td[^>]*>\s*\(([^)]*)\)",
)
_PERCENT = re.compile(r'tdOddSlimPrc" colspan="2">\s*([\d.,]+)\s*%')
_INFO = re.compile(r'class="tdInfoArea"[^>]*>(.*?)</td>', re.DOTALL)
_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True, slots=True)
class SideSheet:
    """One side's numbers from the game sheet."""

    shots: int | None = None
    shots_by_period: tuple[int | None, ...] = ()
    shooting_pct: float | None = None
    saves: int | None = None
    saves_by_period: tuple[int | None, ...] = ()
    save_pct: float | None = None
    penalty_minutes: int | None = None
    penalty_minutes_by_period: tuple[int | None, ...] = ()
    powerplay_pct: float | None = None
    # How long the side had the extra man, as the site writes it: "04:36".
    powerplay_time: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return the side's numbers as a plain dict."""
        return {
            "shots": self.shots,
            "shots_by_period": list(self.shots_by_period),
            "shooting_pct": self.shooting_pct,
            "saves": self.saves,
            "saves_by_period": list(self.saves_by_period),
            "save_pct": self.save_pct,
            "penalty_minutes": self.penalty_minutes,
            "penalty_minutes_by_period": list(self.penalty_minutes_by_period),
            "powerplay_pct": self.powerplay_pct,
            "powerplay_time": self.powerplay_time,
        }


@dataclass(frozen=True, slots=True)
class GameSheet:
    """The federation's sheet for one game."""

    game_id: str
    home: SideSheet
    away: SideSheet
    # Goals in each period played so far, home first: ("0-1", "3-0", "1-2").
    period_scores: tuple[str, ...] = ()
    url: str | None = None

    @property
    def score(self) -> tuple[int, int] | None:
        """Return the score, home first, added up from the periods.

        The sheet is where the final score is right when the league's own
        record is not: Västerås-Leksand 2026-11-13 was won 0-1 in overtime,
        and the league published it finished at 0-0 and kept it that way.
        """
        home = away = 0
        for period in self.period_scores:
            parts = period.split("-")
            if len(parts) != 2 or not all(part.isdigit() for part in parts):
                return None
            home += int(parts[0])
            away += int(parts[1])
        return (home, away) if self.period_scores else None

    def as_dict(self) -> dict[str, Any]:
        """Return the sheet as a plain dict."""
        return {
            "game_id": self.game_id,
            "url": self.url,
            "period_scores": list(self.period_scores),
            "home": self.home.as_dict(),
            "away": self.away.as_dict(),
        }


@dataclass(slots=True)
class _Cached:
    """A value and when it was read."""

    value: Any
    at: float = field(default_factory=time.monotonic)

    def fresh(self, ttl: float) -> bool:
        return time.monotonic() - self.at < ttl


@dataclass(frozen=True, slots=True)
class _Listed:
    """A game as one of the site's lists has it."""

    game_id: str
    day: date | None
    home: str
    away: str


class SwehockeyClient:
    """Read game sheets for one league from stats.swehockey.se."""

    def __init__(self, session: ClientSession, league: str) -> None:
        """Initialise the reader for a league."""
        self._session = session
        self._site_name = SITE_NAMES.get(league)
        self._league_id: _Cached | None = None
        self._lists: dict[str, _Cached] = {}
        # Our game uid to the site's game id. A pairing does not change.
        self._ids: dict[str, str] = {}
        self._sheets: dict[str, _Cached] = {}

    async def async_sheet(
        self, game: Game, *, max_age: float = SHEET_TTL
    ) -> GameSheet | None:
        """Return the sheet for a game, or None if the site has no page for it."""
        if self._site_name is None:
            return None
        game_id = await self._async_game_id(game)
        if game_id is None:
            return None
        cached = self._sheets.get(game_id)
        if cached is not None and cached.fresh(max_age):
            return cached.value
        url = GAME_URL.format(game=game_id)
        sheet = parse_sheet(game_id, await self._async_get(url))
        if sheet is not None:
            sheet = _with_url(sheet, url)
        self._sheets[game_id] = _Cached(sheet)
        return sheet

    async def _async_game_id(self, game: Game) -> str | None:
        """Return the site's id for a game, looking it up the first time."""
        if (known := self._ids.get(game.uid)) is not None:
            return known
        league_id = await self._async_league_id()
        if league_id is None:
            return None

        day = dt_util.as_local(game.start).date()
        # Today's games are on the live page before they are on the schedule,
        # which only takes a game in once it has been played.
        sources = [SCHEDULE_URL]
        if day == dt_util.now().date():
            sources.insert(0, LIVE_URL)
        for source in sources:
            for listed in await self._async_list(source.format(league=league_id)):
                if listed.day is not None and listed.day != day:
                    continue
                if _names_match(listed.home, game.home) and _names_match(
                    listed.away, game.away
                ):
                    self._ids[game.uid] = listed.game_id
                    return listed.game_id
        return None

    async def _async_league_id(self) -> str | None:
        """Return this season's id for the league."""
        if self._league_id is not None and self._league_id.fresh(_LEAGUE_TTL):
            return self._league_id.value
        page = await self._async_get(LEAGUES_URL)
        found = None
        for league_id, name in _LEAGUE_LINK.findall(page):
            if html.unescape(name).strip() == self._site_name:
                found = league_id
                break
        if found is None:
            _LOGGER.debug("stats.swehockey.se lists no %s this season", self._site_name)
        self._league_id = _Cached(found)
        return found

    async def _async_list(self, url: str) -> list[_Listed]:
        """Return the games on one of the site's lists."""
        cached = self._lists.get(url)
        if cached is not None and cached.fresh(_LIST_TTL):
            return cached.value
        page = await self._async_get(url)
        games = (
            parse_live(page, dt_util.now().date())
            if "/Live/" in url
            else parse_schedule(page)
        )
        self._lists[url] = _Cached(games)
        return games

    async def _async_get(self, url: str) -> str:
        """Fetch a page of the site."""
        try:
            async with self._session.get(
                url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT
            ) as response:
                response.raise_for_status()
                page = await response.text()
        except (ClientError, TimeoutError) as err:
            raise HockeyApiError(f"Could not fetch {url}: {err}") from err
        return page.lstrip("﻿")


def parse_live(page: str, today: date) -> list[_Listed]:
    """Return the games on a league's live page, which are all of today."""
    games: dict[str, _Listed] = {}
    for home, game_id, away in _LIVE_GAME.findall(page):
        games.setdefault(
            game_id, _Listed(game_id, today, _text(home), _text(away))
        )
    return list(games.values())


def parse_schedule(page: str) -> list[_Listed]:
    """Return the played games on a league's schedule.

    The date is written on the first game of each day only; the rest of the
    day's rows leave it out, so it is carried down.
    """
    games = []
    day: date | None = None
    for row in _ROW.findall(page):
        if match := _DAY.search(row):
            try:
                day = date.fromisoformat(match.group(1))
            except ValueError:
                pass
        fixture = _FIXTURE.search(row)
        link = _GAME_LINK.search(row)
        if fixture is None or link is None:
            continue
        games.append(
            _Listed(link.group(1), day, _text(fixture.group(1)), _text(fixture.group(2)))
        )
    return games


def parse_sheet(game_id: str, page: str) -> GameSheet | None:
    """Read the numbers at the top of a game page.

    Each stat is written once per side, home first, as a total and a split by
    period - "21" and "(7:9:-)", a dash for a period not yet played. The two
    percentages under shots and saves are rows of their own.
    """
    counts: dict[str, list[tuple[str, str]]] = {}
    for label, total, split in _COUNT.findall(page):
        counts.setdefault(label, []).append((total, split))
    if not counts:
        return None
    percents = [_number(value) for value in _PERCENT.findall(page)]

    def side(index: int) -> SideSheet:
        def total(label: str) -> str | None:
            pairs = counts.get(label) or []
            return pairs[index][0] if len(pairs) > index else None

        def split(label: str) -> tuple[int | None, ...]:
            pairs = counts.get(label) or []
            return _split(pairs[index][1]) if len(pairs) > index else ()

        pp = counts.get("PP") or []
        return SideSheet(
            shots=_int(total("Shots")),
            shots_by_period=split("Shots"),
            shooting_pct=percents[index] if len(percents) > index else None,
            saves=_int(total("Saves")),
            saves_by_period=split("Saves"),
            save_pct=percents[2 + index] if len(percents) > 2 + index else None,
            penalty_minutes=_int(total("PIM")),
            penalty_minutes_by_period=split("PIM"),
            powerplay_pct=_number(pp[index][0]) if len(pp) > index else None,
            powerplay_time=(pp[index][1].strip() or None) if len(pp) > index else None,
        )

    period_scores: tuple[str, ...] = ()
    if info := _INFO.search(page):
        if match := re.search(r"\(([\d\s,\-]+)\)", info.group(1)):
            period_scores = tuple(
                part.strip().replace(" ", "")
                for part in match.group(1).split(",")
                if part.strip()
            )

    return GameSheet(
        game_id=game_id,
        home=side(0),
        away=side(1),
        period_scores=period_scores,
    )


def _with_url(sheet: GameSheet, url: str) -> GameSheet:
    """Return the sheet with the page it was read from."""
    return GameSheet(
        game_id=sheet.game_id,
        home=sheet.home,
        away=sheet.away,
        period_scores=sheet.period_scores,
        url=url,
    )


def _text(value: str) -> str:
    """Return a name as written, without markup, entities or stray spaces."""
    return " ".join(html.unescape(_TAG.sub(" ", value)).split())


def _split(value: str) -> tuple[int | None, ...]:
    """Return "7:9:-" as (7, 9, None)."""
    return tuple(_int(part) for part in value.split(":"))


def _int(value: Any) -> int | None:
    """Return a count, or None for a dash or nothing."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _number(value: Any) -> float | None:
    """Return "33,33%" as 33.33."""
    try:
        return float(str(value).strip().rstrip("%").replace(",", "."))
    except (TypeError, ValueError):
        return None
