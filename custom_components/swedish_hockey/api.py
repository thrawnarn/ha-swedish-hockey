"""API clients for SHL and Hockeyallsvenskan.

Neither league publishes a documented API, so both clients talk to the same
endpoints the official sites use in the browser:

* SHL exposes a plain JSON API on ``www.shl.se/api``. The season/series/game
  type triple ("ssgt") that identifies the current schedule is discovered from
  the same filter endpoint the site's own dropdowns are built from.
* Hockeyallsvenskan has no public API - its CMS requires a token. The schedule
  page is server rendered though, so the whole season is embedded in the React
  Server Components payload, which we ask for directly and parse.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout

from homeassistant.util import dt as dt_util

from .const import (
    LEAGUE_HOCKEYALLSVENSKAN,
    LEAGUE_SHL,
    STATE_ONGOING,
    STATE_POST_GAME,
    STATE_PRE_GAME,
)

_LOGGER = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)
TIMEOUT = ClientTimeout(total=45)

SHL_API = "https://www.shl.se/api"
SHL_FILTER_URL = f"{SHL_API}/sports-v2/season-series-game-types-filter"
SHL_SCHEDULE_URL = f"{SHL_API}/sports-v2/game-schedule"
SHL_GAME_URL = "https://www.shl.se/game-center/{game}/{ssgt}"
SHL_STANDINGS_URL = f"{SHL_API}/statistics-v2/league-standings"
SHL_PBP_URL = "https://game-data.s8y.se/play-by-play/by-game-uuid/{game}"
# The site's statistics pages: one table per module ("players_summary",
# "teams_powerplay"), all of them from the same statnet system the
# Hockeyallsvenskan tables come from, under slightly different column names.
SHL_STATS_URL = f"{SHL_API}/statistics-v2/stats-info/{{table}}"
SHL_STATS_COUNT = 1000
SHL_FEED_URL = f"{SHL_API}/feeds"
SHL_VIDEO_URL = "https://embed.staylive.tv/video/{video}?autoplay=1"
# A club's squad names its players and nothing more; height, weight and age
# are on each player's own record, one read apiece - some 350 for the league.
SHL_SQUAD_URL = f"{SHL_API}/sports-v2/athletes/by-team-uuid/{{team}}"
SHL_ATHLETE_URL = f"{SHL_API}/sports-v2/athlete-details/{{athlete}}"
# Eight at a time read the league in some five seconds without leaning on the
# site; a player's record is kept for the session, so later reads only ask
# about players new to a squad.
SHL_ATHLETE_READS = 8
SHL_SQUAD_TTL = 6 * 3600

HA_SCHEDULE_URL = "https://hockeyallsvenskan.se/pages/matcher"
HA_STANDINGS_URL = "https://hockeyallsvenskan.se/pages/tabell"
# The table is on the front page as well, in the same shape. That page is some
# thirty times the size, so it is only opened when the table page has nothing.
HA_HOME_URL = "https://hockeyallsvenskan.se/"
HA_HIGHLIGHTS_URL = "https://hockeyallsvenskan.se/pages/highlights"
# Skaters and goalkeepers are kept in separate tables; either one returns a
# whole team's roster in a single page when asked for one team.
# The league's own pages, for reading on past what this integration carries.
# A game has one of its own; clubs and players do not, so the table and the
# league-wide stats table are as close as those get.
HA_GAME_PAGE_URL = "https://hockeyallsvenskan.se/pages/matcher/{slug}"
HA_PLAYERS_PAGE_URL = "https://hockeyallsvenskan.se/pages/alla-spelare"
# Who a player is, as opposed to what he has done: picture, position, height,
# weight, where he came from.
HA_PLAYERS_API_URL = "https://hockeyallsvenskan.se/api/all-players"
# A player's own page carries his career, season by season, in the props of
# its flight payload; the page builds the table out of them in the browser.
HA_PLAYER_PAGE_URL = "https://hockeyallsvenskan.se/players/{slug}"
# The career names clubs by code only. The league's catalogue names them, one
# season of its own clubs at a time; a past season's never changes.
HA_CLUB_CATALOGUE_URL = "https://hockeyallsvenskan.se/api/all-time-teams-catalog"
# The roster endpoint pages at a hundred, so the league is four reads. Squads
# change between games rather than during one, so they are kept for a while.
HA_PROFILE_PAGE = 100
HA_PROFILE_TTL = 6 * 3600
# One page carries every club's clips, so it is read once and shared out.
HA_CLIPS_TTL = 600
# StatNet's play-by-play is rate-limited by address, and on a game night one
# reading every poll was enough to be refused most of the time. So it is read
# when the game record - which is not limited - shows something has happened,
# or every HA_PBP_QUIET seconds for the shots and events in between; a reading
# younger than HA_PBP_SHARED answers the services too, rather than each asking
# again. A refusal stops all reading for HA_PBP_BACKOFF_MIN seconds, doubling
# while refusals go on, up to HA_PBP_BACKOFF_MAX; the record carries the score
# meanwhile.
HA_PBP_QUIET = 60
HA_PBP_SHARED = 30
HA_PBP_BACKOFF_MIN = 60
HA_PBP_BACKOFF_MAX = 300
HA_SKATERS_URL = "https://hockeyallsvenskan.se/api/all-time-skaters-stats"
HA_GOALIES_URL = "https://hockeyallsvenskan.se/api/all-time-goalkeepers-stats"
# The clubs' own figures - power play, shots, face-offs, the crowd - one
# category of them per read, the way the league's stats pages ask for them.
HA_TEAMS_STATS_URL = "https://hockeyallsvenskan.se/api/all-time-teams-stats"
# The stats tables page at 25 unless told otherwise; the whole league is some
# 350 skaters, so one page that size holds it.
HA_STATS_PAGE = 1000
HA_PBP_URL = "https://hockeyallsvenskan.se/api/play-by-play"
HA_GAME_URL = "https://hockeyallsvenskan.se/api/games?documentIds={game}"
# How many game ids to ask for at once. A whole round is seven games; the cap
# is only there to keep the query string sane if a schedule ever bunches up.
HA_SCORE_BATCH = 20
HA_YOUTUBE_URL = "https://www.youtube.com/watch?v={video}"
HA_YOUTUBE_THUMB = "https://img.youtube.com/vi/{video}/hqdefault.jpg"
# The league's YouTube channel has a game's clip within the hour; the
# highlights page has been seen a day behind it (Kalmar-Leksand 23/10 was on
# YouTube at 23:19 and still not on the page the next morning). The channel's
# feed holds only its last fifteen uploads, so it tops the page up rather than
# replacing it.
HA_YOUTUBE_FEED_URL = (
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCXwGjjrSiyHPTHXJlvYrEtQ"
)

_GAMES_KEY = re.compile(r'"games"\s*:\s*\[')
_STANDINGS_KEY = re.compile(r'"standings"\s*:\s*\[')
_FLIGHT_CHUNK = re.compile(r"self\.__next_f\.push\(\s*\[\s*1\s*,")


class HockeyApiError(Exception):
    """Raised when a league API cannot be reached or understood."""


class HockeyRateLimited(HockeyApiError):
    """Raised when a league API answers 429: too many requests from here."""


@dataclass(frozen=True, slots=True)
class Team:
    """A team as presented by its league."""

    key: str
    name: str
    short_name: str
    logo: str | None = None
    # The club's own colour, for telling one side from the other.
    color: str | None = None


@dataclass(frozen=True, slots=True)
class Game:
    """A single scheduled game."""

    uid: str
    start: datetime
    home: Team
    away: Team
    venue: str | None = None
    round: str | None = None
    state: str = STATE_PRE_GAME
    home_score: int | None = None
    away_score: int | None = None
    decided_in: str | None = None
    url: str | None = None
    slug: str | None = None
    # Identifiers the league's own live feed uses for this game and its teams.
    # Hockeyallsvenskan's play-by-play keys on all three; they are not always the
    # same as the team's short name (MoDo is MODO, Mora is MIK, Nybro is NYB).
    stat_net_number: str | None = None
    home_ext_id: str | None = None
    away_ext_id: str | None = None
    ended_at: str | None = None
    # Reported by the club after the game, and not by every club: a game with
    # nobody counted comes through as 0, which is kept as None rather than
    # printed as an empty arena.
    attendance: int | None = None
    # Where it is shown, from tv.nu rather than the league: broadcast channels
    # first, then streaming. Empty until tv.nu lists the game, about a week out.
    tv: tuple[str, ...] = ()

    def involves(self, team_key: str) -> bool:
        """Return True if the given team plays this game."""
        return team_key in (self.home.key, self.away.key)

    @property
    def has_result(self) -> bool:
        """Return True once both scores are known."""
        return self.home_score is not None and self.away_score is not None


@dataclass(frozen=True, slots=True)
class GameScore:
    """A game's score as it stands right now."""

    uid: str
    home_score: int | None
    away_score: int | None
    started: bool
    finished: bool
    period: str | None = None
    decided_in: str | None = None

    @property
    def in_progress(self) -> bool:
        """Return True while the game is being played."""
        return self.started and not self.finished


@dataclass(frozen=True, slots=True)
class Standing:
    """One row of a league table."""

    rank: int | None
    team_code: str
    team_name: str
    games_played: int | None
    wins: int | None
    losses: int | None
    goals_for: int | None
    goals_against: int | None
    goal_difference: int | None
    points: int | None
    # Wins and losses in overtime or a shootout, which both leagues keep apart
    # from the regulation ones: W and L alone do not add up to games played.
    # Defaulted, so they come last - a dataclass cannot take a field without a
    # default after one with it.
    overtime_wins: int | None = None
    overtime_losses: int | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return the row as a plain dict for a service response."""
        return {
            "rank": self.rank,
            "team_code": self.team_code,
            "team_name": self.team_name,
            "games_played": self.games_played,
            "wins": self.wins,
            "losses": self.losses,
            "overtime_wins": self.overtime_wins,
            "overtime_losses": self.overtime_losses,
            "goals_for": self.goals_for,
            "goals_against": self.goals_against,
            "goal_difference": self.goal_difference,
            "points": self.points,
        }


@dataclass(frozen=True, slots=True)
class Goal:
    """A goal, as reported by a league's live feed."""

    period: str | None
    time: str | None
    team_code: str | None
    team_name: str | None
    score: str | None
    note: str | None
    scorer: str | None
    assists: list[str]

    @property
    def strength(self) -> str | None:
        """Return "PP" for a power play goal, "BP" for a short-handed one."""
        return _strength(self.note)

    def as_dict(self) -> dict[str, Any]:
        """Return the goal as a plain dict for a service response."""
        return {
            "period": self.period,
            "time": self.time,
            "team_code": self.team_code,
            "team_name": self.team_name,
            "score": self.score,
            "note": self.note,
            "strength": self.strength,
            "scorer": self.scorer,
            "assists": list(self.assists),
        }


@dataclass(frozen=True, slots=True)
class GameEvent:
    """Something worth putting in a match log."""

    kind: str  # goal | penalty | penalty_shot | goalie_in | goalie_out
    period: str | None
    time: str | None
    seconds: int | None
    team_code: str | None
    team_name: str | None
    player: str | None
    detail: str | None = None
    score: str | None = None
    assists: list[str] = field(default_factory=list)
    # Whether a shootout attempt went in, said plainly rather than left to be
    # read out of the Swedish in `detail`.
    scored: bool | None = None

    @property
    def strength(self) -> str | None:
        """Return "PP" or "BP" for a goal that was scored a man up or down."""
        return _strength(self.detail) if self.kind == "goal" else None

    def as_dict(self) -> dict[str, Any]:
        """Return the event as a plain dict for attributes and responses."""
        return {
            "kind": self.kind,
            "period": self.period,
            "time": self.time,
            "team_code": self.team_code,
            "team_name": self.team_name,
            "player": self.player,
            "detail": self.detail,
            "strength": self.strength,
            "score": self.score,
            "assists": list(self.assists),
            "scored": self.scored,
        }


_GOALIE_KINDS = ("goalie_in", "goalie_out")


def goalie_moves(
    events: list[GameEvent], period_rank: Callable[[Any], int]
) -> list[GameEvent]:
    """Return the events with each goalkeeper's coming and going explained.

    The feeds log a goalkeeper in when he starts and out when the game ends,
    and some at every period's end and start as well. Those say nothing a
    reader does not know, so they are left out; what is left is told as what
    it was: who started, who was replaced by whom, who went off for an extra
    skater and came back. `events` is in the order things happened, and
    `period_rank` says where a period comes.
    """

    def moment(event: Any) -> tuple[int, int]:
        return (period_rank(event.period), event.seconds or 0)

    # A goalkeeper "leaving" at the last moment of a period is the period
    # ending, not him being pulled - at twenty minutes, or at five in a
    # regular season's overtime, or at the goal that ended it.
    ends: dict[int, int] = {}
    for event in events:
        rank, seconds = moment(event)
        ends[rank] = max(ends.get(rank, 0), seconds)
    in_goal: dict[str, str | None] = {}
    pulled: dict[str, str] = {}
    replaced: dict[str, str] = {}
    result: list[GameEvent] = []
    for index, event in enumerate(events):
        if event.kind not in _GOALIE_KINDS:
            result.append(event)
            continue
        side = event.team_code or event.team_name or ""
        if event.kind == "goalie_out":
            swap = any(
                other.kind == "goalie_in"
                and (other.team_code or other.team_name or "") == side
                and other.player != event.player
                and moment(other) == moment(event)
                for other in events[index + 1 :]
            )
            # A change of goalkeeper is told wherever it falls, even as the
            # last thing in a period.
            rank, seconds = moment(event)
            if not swap and seconds >= ends[rank]:
                continue
            in_goal[side] = None
            if swap:
                replaced[side] = event.player
                result.append(replace(event, detail="Byts ut"))
            else:
                pulled[side] = event.player
                result.append(replace(event, detail="Ut för en extra utespelare"))
            continue
        before = in_goal.get(side)
        in_goal[side] = event.player
        if before == event.player:
            continue
        if before is None and side in replaced:
            detail = f"Ersätter {replaced.pop(side)}"
        elif before is None and pulled.get(side) == event.player:
            detail = "Tillbaka i mål"
        elif before is None and side in pulled:
            detail = "Går in i mål"
        elif before is None:
            detail = "Startar i mål"
        else:
            detail = f"Ersätter {before}"
        result.append(replace(event, detail=detail))
    return result



@dataclass(frozen=True, slots=True)
class PowerPlay:
    """Which side has the advantage, and until when."""

    team_code: str | None
    team_name: str | None
    until: str | None
    advantage: str

    def as_dict(self) -> dict[str, Any]:
        """Return the power play as a plain dict."""
        return {
            "team_code": self.team_code,
            "team_name": self.team_name,
            "until": self.until,
            "advantage": self.advantage,
        }


@dataclass(frozen=True, slots=True)
class Shots:
    """Shots for each side: on goal, blocked, and every attempt logged."""

    home: int
    away: int
    home_total: int
    away_total: int
    # Attempts stopped by an outfield player before they reached the goal.
    home_blocked: int = 0
    away_blocked: int = 0

    def as_dict(self) -> dict[str, Any]:
        """Return the shot counts as a plain dict."""
        return {
            "home": self.home,
            "away": self.away,
            "home_total": self.home_total,
            "away_total": self.away_total,
            "home_blocked": self.home_blocked,
            "away_blocked": self.away_blocked,
        }


@dataclass(frozen=True, slots=True)
class LiveGame:
    """The live state of a game."""

    finished: bool
    decided_in: str | None
    goals: list[Goal]
    current_period: str | None = None
    events: list[GameEvent] = field(default_factory=list)
    # The feed carries no running clock, so this is the time of the most recent
    # event - never ahead of play, and with shots logged it is rarely far behind.
    clock: str | None = None
    powerplay: PowerPlay | None = None
    shots: Shots | None = None
    attendance: int | None = None
    # True between periods: the period on the clock has ended, the next one has
    # not started, and the game is still going.
    intermission: bool = False
    finished_at: str | None = None

    @property
    def score(self) -> str:
        """Return the running score; the last goal carries it."""
        for goal in reversed(self.goals):
            if goal.score:
                return goal.score
        return "0-0"

    @property
    def period(self) -> str | None:
        """Return the period being played, falling back to the last goal's."""
        if self.current_period:
            return self.current_period
        for goal in reversed(self.goals):
            if goal.period:
                return goal.period
        return None


def parse_score(score: str | None) -> tuple[int, int] | None:
    """Split "3-2" (or "3–2") into home and away goals."""
    if not score:
        return None
    parts = [part for part in re.split(r"[^0-9]+", score.strip()) if part.isdigit()]
    if len(parts) < 2:
        return None
    return int(parts[0]), int(parts[1])


@dataclass(frozen=True, slots=True)
class Clip:
    """A highlights video."""

    heading: str | None
    subheading: str | None
    url: str
    thumbnail: str | None
    video_id: str | None

    def as_dict(self) -> dict[str, Any]:
        """Return the clip as a plain dict for a service response."""
        return {
            "heading": self.heading,
            "subheading": self.subheading,
            "url": self.url,
            "thumbnail": self.thumbnail,
            "video_id": self.video_id,
        }


class LeagueClient:
    """Base class for the league clients."""

    league: str
    # Where to send someone who wants more than this integration reads.
    table_url: str | None = None
    players_url: str | None = None

    def __init__(self, session: ClientSession) -> None:
        """Initialise the client with Home Assistant's shared session."""
        self._session = session

    async def async_fetch(self) -> tuple[dict[str, Team], list[Game]]:
        """Return all known teams and the full season schedule."""
        raise NotImplementedError

    async def async_standings(self) -> list[Standing]:
        """Return the current league table."""
        raise NotImplementedError

    async def async_scores(self, games: list[Game]) -> dict[str, GameScore]:
        """Return the current score of each of the given games, keyed by uid."""
        raise NotImplementedError

    async def _async_record(self, game: Game) -> dict[str, Any]:
        """Return the game's record: its totals, period and whether it is over."""
        payload = await self._async_get(HA_GAME_URL.format(game=game.uid))
        rows = (payload or {}).get("data") if isinstance(payload, dict) else None
        return rows[0] if rows and isinstance(rows[0], dict) else {}

    async def async_player_stats(self, team: Team) -> list[dict[str, Any]]:
        """Return this season's stats for everyone who has played for a team."""
        raise NotImplementedError

    async def async_player_profile(
        self, team: Team, name: str
    ) -> dict[str, Any] | None:
        """Return who a player is, beyond what the stats tables say."""
        raise NotImplementedError

    async def async_live_game(
        self, game: Game, previous: LiveGame | None = None, *, fresh: bool = False
    ) -> LiveGame:
        """Return the live state and goals of a game.

        `previous` is the caller's last reading of the same game, which a
        client may hand back when nothing has changed; `fresh` asks for a new
        reading regardless, as when the push stream has just seen a goal.
        """
        raise NotImplementedError

    async def async_highlights(self, team: Team) -> list[Clip]:
        """Return highlight clips for a team, newest first."""
        raise NotImplementedError

    async def async_all_clips(self) -> list[Clip]:
        """Return every highlight clip the league has published."""
        raise NotImplementedError

    async def async_stats_table(
        self, table: str, location: str = "all", last: int | None = None
    ) -> list[dict[str, Any]]:
        """Return one of the league's statistics tables, every row of it.

        `table` names the table the way the league does; `location` narrows it
        to home or away games, `last` to each one's most recent games.
        """
        raise NotImplementedError

    async def async_league_profiles(self) -> list[dict[str, Any]]:
        """Return who every player in the league is: picture, position, shirt."""
        raise NotImplementedError

    async def async_squad_profiles(self) -> list[dict[str, Any]]:
        """Return every club's squad: height, weight, birth date, shot, country.

        Where the league's profiles carry all that it is the same list. It is
        kept apart because the SHL's takes a read per player, which putting
        faces to the statistics tables is not worth waiting for.
        """
        return await self.async_league_profiles()

    async def async_player_career(self, slug: str) -> list[dict[str, Any]]:
        """Return a player's career, season by season."""
        raise NotImplementedError

    async def _async_get(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        as_json: bool = True,
    ) -> Any:
        """Perform a GET request and return the decoded body."""
        request_headers = {"User-Agent": USER_AGENT}
        request_headers.update(headers or {})
        try:
            async with self._session.get(
                url, params=params, headers=request_headers, timeout=TIMEOUT
            ) as response:
                if response.status == 429:
                    raise HockeyRateLimited(f"Too many requests to {url}")
                response.raise_for_status()
                if as_json:
                    return await response.json(content_type=None)
                return await response.text()
        except (ClientError, TimeoutError) as err:
            raise HockeyApiError(f"Could not fetch {url}: {err}") from err
        except ValueError as err:
            raise HockeyApiError(f"Unexpected response from {url}: {err}") from err

    async def _async_post(self, url: str, payload: dict[str, Any]) -> Any:
        """POST JSON and return the decoded body."""
        try:
            async with self._session.post(
                url,
                json=payload,
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            ) as response:
                if response.status == 429:
                    raise HockeyRateLimited(f"Too many requests to {url}")
                response.raise_for_status()
                return await response.json(content_type=None)
        except (ClientError, TimeoutError) as err:
            raise HockeyApiError(f"Could not fetch {url}: {err}") from err
        except ValueError as err:
            raise HockeyApiError(f"Unexpected response from {url}: {err}") from err


class ShlClient(LeagueClient):
    """Client for www.shl.se."""

    league = LEAGUE_SHL

    def __init__(self, session: ClientSession) -> None:
        """Initialise the client with room to remember the season's id."""
        super().__init__(session)
        self._stats_ssgt: tuple[float, str] | None = None
        # The squads are asked for by the club's id, which only the
        # schedule's list of clubs carries.
        self._team_uuids: dict[str, str] = {}
        self._squads: tuple[float, list[dict[str, Any]]] | None = None
        self._athletes: dict[str, dict[str, Any]] = {}
        self._squad_lock = asyncio.Lock()

    async def async_fetch(self) -> tuple[dict[str, Team], list[Game]]:
        """Fetch the current SHL season from the site's own JSON API."""
        filters = await self._async_get(SHL_FILTER_URL)
        if not isinstance(filters, dict):
            raise HockeyApiError("SHL returned an unexpected filter payload")

        default = filters.get("defaultSsgtFilter") or {}
        season_uuid = default.get("season")
        series_uuid = default.get("series")
        if not season_uuid or not series_uuid:
            raise HockeyApiError("SHL did not report a current season")

        # The game type list grows with the season - the regular series first,
        # play-offs and play-in later on - so fetch every one of them.
        game_types = [
            game_type["uuid"]
            for game_type in filters.get("gameType") or []
            if isinstance(game_type, dict) and game_type.get("uuid")
        ]
        if not game_types and default.get("gameType"):
            game_types = [default["gameType"]]
        if not game_types:
            raise HockeyApiError("SHL did not report any game types")

        teams: dict[str, Team] = {}
        games: dict[str, Game] = {}
        for game_type_uuid in game_types:
            payload = await self._async_get(
                SHL_SCHEDULE_URL,
                params={
                    "seasonUuid": season_uuid,
                    "seriesUuid": series_uuid,
                    "gameTypeUuid": game_type_uuid,
                },
            )
            if not isinstance(payload, dict):
                continue

            for raw_team in payload.get("teamList") or []:
                if team := _shl_team_from_list(raw_team):
                    teams.setdefault(team.key, team)
                    if raw_team.get("uuid"):
                        self._team_uuids[team.key] = str(raw_team["uuid"])

            for raw_game in payload.get("gameInfo") or []:
                if game := _shl_game(raw_game):
                    games[game.uid] = game
                    teams.setdefault(game.home.key, game.home)
                    teams.setdefault(game.away.key, game.away)

        if not games:
            raise HockeyApiError("SHL returned an empty schedule")

        return teams, sorted(games.values(), key=lambda game: game.start)

    async def async_squad_profiles(self) -> list[dict[str, Any]]:
        """Return every club's squad, each player with his own record laid on."""
        async with self._squad_lock:
            now = time.monotonic()
            if self._squads and now - self._squads[0] < SHL_SQUAD_TTL:
                return self._squads[1]
            if not self._team_uuids:
                raise HockeyApiError("SHL has not named its clubs yet")

            squads: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
            for code, uuid in self._team_uuids.items():
                payload = await self._async_get(SHL_SQUAD_URL.format(team=uuid))
                for group in payload if isinstance(payload, list) else []:
                    if not isinstance(group, dict):
                        continue
                    for raw in group.get("players") or []:
                        if isinstance(raw, dict) and raw.get("uuid"):
                            squads.append((code, group, raw))
            if not squads:
                raise HockeyApiError("SHL returned no squads")

            gate = asyncio.Semaphore(SHL_ATHLETE_READS)

            async def _read(uuid: str) -> None:
                async with gate:
                    try:
                        payload = await self._async_get(
                            SHL_ATHLETE_URL.format(athlete=uuid)
                        )
                    except HockeyApiError as err:
                        # One missing record leaves one player out of the
                        # averages; it is asked for again next time.
                        _LOGGER.debug("No record for SHL player %s: %s", uuid, err)
                        return
                data = (payload or {}).get("athleteData") if isinstance(payload, dict) else None
                if isinstance(data, dict):
                    self._athletes[uuid] = data

            await asyncio.gather(
                *(
                    _read(raw["uuid"])
                    for _, _, raw in squads
                    if raw["uuid"] not in self._athletes
                )
            )
            players = [
                _shl_profile(code, group, raw, self._athletes.get(raw["uuid"], {}))
                for code, group, raw in squads
            ]
            self._squads = (now, players)
            return players

    async def async_standings(self) -> list[Standing]:
        """Return the current SHL table."""
        filters = await self._async_get(SHL_FILTER_URL)
        ssgt = (filters or {}).get("ssgtUuid") if isinstance(filters, dict) else None
        if not ssgt:
            raise HockeyApiError("SHL did not report a current season")

        payload = await self._async_get(SHL_STANDINGS_URL, params={"ssgtUuid": ssgt})
        rows = (payload or {}).get("leagueStandings") if isinstance(payload, dict) else None
        standings: list[Standing] = []
        for raw in rows or []:
            if not isinstance(raw, dict):
                continue
            info = raw.get("info") or {}
            names = (info.get("teamInfo") or {}).get("teamNames") or {}
            code = info.get("teamId") or names.get("code")
            if not code:
                continue
            standings.append(
                Standing(
                    rank=_as_int(raw.get("Rank")),
                    team_code=str(code),
                    team_name=str(names.get("long") or names.get("full") or code),
                    games_played=_as_int(raw.get("GP")),
                    wins=_as_int(raw.get("W")),
                    losses=_as_int(raw.get("L")),
                    overtime_wins=_as_int(raw.get("OTW")),
                    overtime_losses=_as_int(raw.get("OTL")),
                    goals_for=_as_int(raw.get("G")),
                    goals_against=_as_int(raw.get("GA")),
                    goal_difference=_as_int(raw.get("Diff")),
                    points=_as_int(raw.get("Points")),
                )
            )
        if not standings:
            raise HockeyApiError("SHL returned an empty table")
        return standings

    async def async_live_game(
        self, game: Game, previous: LiveGame | None = None, *, fresh: bool = False
    ) -> LiveGame:
        """Return the live state of an SHL game."""
        events = await self._async_get(SHL_PBP_URL.format(game=game.uid))
        if not isinstance(events, list):
            raise HockeyApiError("SHL returned an unexpected play-by-play payload")

        goals: list[Goal] = []
        finished = False
        for raw in events:
            if not isinstance(raw, dict):
                continue
            if str(raw.get("gameState") or "") == "GameEnded":
                finished = True
            if raw.get("type") != "goal":
                continue
            team = raw.get("eventTeam") or {}
            player = raw.get("player") or {}
            assists = raw.get("assists") or {}
            names = []
            for key in ("first", "second"):
                if isinstance(helper := assists.get(key), dict):
                    if name := _person(helper):
                        names.append(name)
            goals.append(
                Goal(
                    period=_as_round(raw.get("period")),
                    time=str(raw.get("time")) if raw.get("time") else None,
                    team_code=str(team.get("teamCode")) if team.get("teamCode") else None,
                    team_name=str(team.get("teamName")) if team.get("teamName") else None,
                    score=f"{raw.get('homeGoals')}-{raw.get('awayGoals')}"
                    if raw.get("homeGoals") is not None
                    else None,
                    note=_shl_strength(raw),
                    scorer=_person(player),
                    assists=names,
                )
            )

        decided_in = None
        if goals and (last := goals[-1]).period:
            if str(last.period) == "4":
                decided_in = "OT"
            elif str(last.period).upper() in ("5", "SO"):
                decided_in = "SO"
        current = None
        for raw in reversed(events):
            if isinstance(raw, dict) and raw.get("period"):
                current = _as_round(raw["period"])
                break

        log: list[GameEvent] = []
        latest: int | None = None
        for raw in events:
            if not isinstance(raw, dict):
                continue
            seconds = _seconds(raw.get("time"))
            if seconds is not None and _as_round(raw.get("period")) == current:
                latest = seconds if latest is None else max(latest, seconds)
            if event := _shl_event(raw):
                log.append(event)

        return LiveGame(
            finished=finished,
            decided_in=decided_in,
            goals=goals,
            current_period=current,
            events=log,
            clock=_clock(str(latest)) if latest is not None else None,
            powerplay=_powerplay(log, current),
            shots=_shl_shots(events),
            intermission=not finished and _shl_intermission(events),
            attendance=_shl_attendance(events),
        )

    async def async_stats_table(
        self, table: str, location: str = "all", last: int | None = None
    ) -> list[dict[str, Any]]:
        """Return one of SHL's statistics tables for the current season.

        Each row carries the player or club it is about under `info`. The site
        offers a last-few-games filter too, but not in any shape found in its
        requests, so that one is not offered here.
        """
        if last:
            raise NotImplementedError("SHL statistics cover the season or home/away")
        # Every table of a read asks for the same season, so it is looked up
        # once and kept for an hour rather than once per table.
        now = time.monotonic()
        if self._stats_ssgt and now - self._stats_ssgt[0] < 3600:
            ssgt = self._stats_ssgt[1]
        else:
            filters = await self._async_get(SHL_FILTER_URL)
            ssgt = (filters or {}).get("ssgtUuid") if isinstance(filters, dict) else None
            if not ssgt:
                raise HockeyApiError("SHL did not report a current season")
            self._stats_ssgt = (now, ssgt)
        params = {"ssgtUuid": ssgt, "count": str(SHL_STATS_COUNT), "provider": "statnet"}
        if location in ("home", "away"):
            params["location"] = location
        payload = await self._async_get(SHL_STATS_URL.format(table=table), params=params)
        block = payload[0] if isinstance(payload, list) and payload else payload
        rows = block.get("stats") if isinstance(block, dict) else None
        return [row for row in rows or [] if isinstance(row, dict)]

    async def async_scores(self, games: list[Game]) -> dict[str, GameScore]:
        """Return the current score of each game from the schedule.

        SHL publishes the running score on the schedule itself, so there is no
        per-game call to make - one read covers the whole night.
        """
        wanted = {game.uid for game in games}
        if not wanted:
            return {}
        _, fetched = await self.async_fetch()
        return {
            game.uid: _score_from_game(game)
            for game in fetched
            if game.uid in wanted
        }

    async def async_highlights(self, team: Team) -> list[Clip]:
        """Return SHL highlight clips mentioning the team, newest first."""
        feed = await self._async_get(
            SHL_FEED_URL,
            params={
                "page": "0",
                "pageSize": "30",
                "contentTypes": "videos",
                "requiredTags": "custom.highlights",
                "siteInstanceIds": "shl1_shl",
                "showHiddenItems": "false",
            },
        )
        if not isinstance(feed, list):
            raise HockeyApiError("SHL returned an unexpected highlights feed")

        wanted = {team.name.casefold(), team.short_name.casefold(), team.key.casefold()}
        clips: list[Clip] = []
        for raw in feed:
            if not isinstance(raw, dict):
                continue
            header = str(raw.get("header") or "")
            folded = header.casefold()
            if not any(name and name in folded for name in wanted):
                continue
            media = str(raw.get("mainMedia") or raw.get("id") or "")
            parts = media.split("|")
            video = parts[2] if len(parts) > 2 else None
            if not video:
                continue
            clips.append(
                Clip(
                    heading=header,
                    subheading=str(raw.get("publishedAt") or "")[:10] or None,
                    url=SHL_VIDEO_URL.format(video=video),
                    thumbnail=None,
                    video_id=video,
                )
            )
        return clips


# Where the record keeps each period's goals. A game that went to overtime or
# a shootout files those separately from the three regulation periods.
_HA_PERIOD_SCORES = (
    ("1", "homeScoreP1", "awayScoreP1"),
    ("2", "homeScoreP2", "awayScoreP2"),
    ("3", "homeScoreP3", "awayScoreP3"),
    ("OT", "homeOtScore", "awayOtScore"),
    ("SO", "homeSoScore", "awaySoScore"),
)


def _ha_record_goals(game: Game, raw: dict[str, Any]) -> list[Goal]:
    """Return the scoring of a game from the per-period totals on its record.

    The record says how many goals each side scored in each period, not when
    or by whom, and not in which order within the period - so the home side's
    are listed first. The period, the teams and the final score are right,
    which is what a summary is read for; anything finer needs the play-by-play.
    """
    goals: list[Goal] = []
    home_total = _as_int(raw.get("homeScore")) or 0
    away_total = _as_int(raw.get("awayScore")) or 0
    home = away = 0
    for label, home_field, away_field in _HA_PERIOD_SCORES:
        for count, team, is_home in (
            (_as_int(raw.get(home_field)) or 0, game.home, True),
            (_as_int(raw.get(away_field)) or 0, game.away, False),
        ):
            for _ in range(count):
                if is_home:
                    home += 1
                else:
                    away += 1
                goals.append(
                    Goal(
                        period=label,
                        time=None,
                        team_code=team.key,
                        team_name=team.name,
                        score=f"{home}-{away}",
                        note=None,
                        scorer=None,
                        assists=[],
                    )
                )
    if (home, away) == (home_total, away_total):
        return goals

    # The per-period fields did not add up to the score - an early game, or a
    # period the record has not filled in yet. Fall back to the total, filed
    # under the period being played.
    period = _as_round(raw.get("currentPeriod"))
    goals = []
    home = away = 0
    while home < home_total or away < away_total:
        if home < home_total:
            home += 1
            team = game.home
        else:
            away += 1
            team = game.away
        goals.append(
            Goal(
                period=period,
                time=None,
                team_code=team.key,
                team_name=team.name,
                score=f"{home}-{away}",
                note=None,
                scorer=None,
                assists=[],
            )
        )
    return goals


class HockeyallsvenskanClient(LeagueClient):
    """Client for hockeyallsvenskan.se."""

    league = LEAGUE_HOCKEYALLSVENSKAN
    table_url = HA_STANDINGS_URL
    players_url = HA_PLAYERS_PAGE_URL

    def __init__(self, session: ClientSession) -> None:
        """Initialise the client with room to remember the league's players."""
        super().__init__(session)
        self._profiles: tuple[float, list[dict[str, Any]]] | None = None
        # Club names by season, and when each season was read; see
        # _async_club_names.
        self._clubs: dict[int, tuple[float, dict[str, dict[str, Any]]]] = {}
        self._clips_page: tuple[float, str] | None = None
        self._clips_feed: tuple[float, list[tuple[str, Clip]]] | None = None
        # The last reading of each game, from whichever source, and when
        # play-by-play was last read for it; see HA_PBP_QUIET.
        self._latest: dict[str, tuple[float, LiveGame]] = {}
        self._pbp_at: dict[str, float] = {}
        self._pbp_until = 0.0
        self._pbp_backoff = 0

    async def _async_clips_page(self) -> str:
        """Return the highlights page, briefly kept between calls."""
        now = time.monotonic()
        if self._clips_page and now - self._clips_page[0] < HA_CLIPS_TTL:
            return self._clips_page[1]
        payload = await self._async_get(
            HA_HIGHLIGHTS_URL, headers={"RSC": "1"}, as_json=False
        )
        self._clips_page = (now, payload)
        return payload

    async def _async_clips_feed(self) -> list[tuple[str, Clip]]:
        """Return the channel's game clips, newest first; none if unreadable."""
        now = time.monotonic()
        if self._clips_feed and now - self._clips_feed[0] < HA_CLIPS_TTL:
            return self._clips_feed[1]
        try:
            clips = parse_clip_feed(
                await self._async_get(HA_YOUTUBE_FEED_URL, as_json=False)
            )
        except HockeyApiError as err:
            # The page alone is what there was before; a feed that is down
            # only means a clip turns up later.
            _LOGGER.debug("Could not read the league's YouTube feed: %s", err)
            clips = []
        self._clips_feed = (now, clips)
        return clips

    async def async_all_clips(self) -> list[Clip]:
        """Return every published clip, whoever it belongs to."""
        page = await self._async_page_clips()
        return newer_from_feed(page, await self._async_clips_feed()) + page

    async def _async_page_clips(self) -> list[Clip]:
        """Return every clip on the highlights page, whoever it belongs to."""
        clips: list[Clip] = []
        seen: set[str] = set()
        for _, blob in _HIGHLIGHT_CAROUSEL.findall(await self._async_clips_page()):
            try:
                cards = json.loads(blob)
            except ValueError:
                continue
            for card in cards:
                if not isinstance(card, dict):
                    continue
                video = str(card.get("youtubeId") or "").strip()
                if not video or video in seen:
                    continue
                seen.add(video)
                clips.append(
                    Clip(
                        heading=str(card.get("heading") or "") or None,
                        subheading=str(card.get("subHeading") or "") or None,
                        url=HA_YOUTUBE_URL.format(video=video),
                        thumbnail=HA_YOUTUBE_THUMB.format(video=video),
                        video_id=video,
                    )
                )
        return clips

    async def _async_all_profiles(self) -> list[dict[str, Any]]:
        """Return every player in the league, kept between calls."""
        now = time.monotonic()
        if self._profiles and now - self._profiles[0] < HA_PROFILE_TTL:
            return self._profiles[1]

        players: list[dict[str, Any]] = []
        page = 1
        while True:
            payload = await self._async_post(
                HA_PLAYERS_API_URL,
                {
                    "scope": "current",
                    "leagueShortName": "HA",
                    "searchQuery": "",
                    "orderBy": "name",
                    "page": page,
                    "pageSize": HA_PROFILE_PAGE,
                },
            )
            rows = (payload or {}).get("players") if isinstance(payload, dict) else None
            if not rows:
                break
            players.extend(row for row in rows if isinstance(row, dict))
            pages = int(((payload or {}).get("pagination") or {}).get("pageCount") or 1)
            if page >= pages:
                break
            page += 1

        self._profiles = (now, players)
        return players

    async def async_player_career(self, slug: str) -> list[dict[str, Any]]:
        """Return a player's career, newest season first, one row per club and
        competition: the SHL and both its playoffs and qualifiers as well as
        this league's own.

        The league keeps the Swedish leagues only, from about 2005: seasons
        abroad or in junior hockey are simply not there.
        """
        page = await self._async_get(
            HA_PLAYER_PAGE_URL.format(slug=slug), headers={"RSC": "1"}, as_json=False
        )
        rows = _career_rows(page)
        names = await self._async_club_names({row["Season"] for row in rows})
        career = [_career_row(row, names) for row in rows]
        # Within a season the series comes before its playoffs or qualifiers;
        # the page lists them in no order of its own.
        career.sort(
            key=lambda row: (
                -row["season"],
                row["competition_code"] not in _SERIES,
            )
        )
        return career

    async def _async_club_names(
        self, seasons: set[int]
    ) -> dict[int, dict[str, dict[str, Any]]]:
        """Return the catalogue's clubs for each of the seasons asked about.

        A season that cannot be read is left out rather than failing the
        career; its clubs fall back to another season's name, or their code.
        """
        now = time.monotonic()
        current = season_year()

        def fresh(season: int) -> bool:
            kept = self._clubs.get(season)
            return kept is not None and (
                season != current or now - kept[0] < HA_PROFILE_TTL
            )

        async def read(season: int) -> None:
            try:
                body = await self._async_post(
                    HA_CLUB_CATALOGUE_URL,
                    {"league": "HA", "phase": "HA", "season": str(season)},
                )
            except HockeyApiError as err:
                _LOGGER.debug("No club catalogue for %s: %s", season, err)
                return
            clubs = (body or {}).get("teamDisplayMap") if isinstance(body, dict) else None
            if isinstance(clubs, dict):
                self._clubs[season] = (
                    now,
                    {str(code): club for code, club in clubs.items() if isinstance(club, dict)},
                )

        await asyncio.gather(*(read(season) for season in seasons if not fresh(season)))
        return {season: kept[1] for season, kept in self._clubs.items()}

    async def async_league_profiles(self) -> list[dict[str, Any]]:
        """Return who every player in the league is, from the kept roster."""
        return [_ha_profile(raw) for raw in await self._async_all_profiles()]

    async def async_stats_table(
        self, table: str, location: str = "all", last: int | None = None
    ) -> list[dict[str, Any]]:
        """Return one of the league's statistics tables, every row of it.

        `table` is "skaters/<category>", "goalies/<category>" or
        "teams/<category>", in the league's own words - "summary",
        "power_play", "faceoffs" and so on. The skater and goalkeeper tables
        name a club the way the stats system does (OSIK, NYB) and send along a
        catalogue of what the rest of the site calls it (ÖIK, NVIF); each row
        comes back under the second, which is what the schedule uses.
        """
        kind, _, category = table.partition("/")
        url = {
            "skaters": HA_SKATERS_URL,
            "goalies": HA_GOALIES_URL,
            "teams": HA_TEAMS_STATS_URL,
        }.get(kind)
        if url is None or not category:
            raise HockeyApiError(f"No statistics table called {table}")
        payload: dict[str, Any] = {
            "league": "HA",
            "phase": "HA",
            "season": str(season_year()),
            "team_side": location if location in ("home", "away") else "all",
            "team": "all",
            "against_team": "all",
            "all_results": "all",
            "categories": category,
        }
        if kind != "teams":
            payload |= {"ages": "all", "page_size": HA_STATS_PAGE}
        if kind == "skaters":
            payload["position"] = "all"
        if last:
            payload |= {"is_last_games": True, "lastGames": int(last)}
        body = await self._async_post(url, payload)
        if not isinstance(body, dict):
            raise HockeyApiError(f"Unexpected statistics from {url}")
        if body.get("error"):
            raise HockeyApiError(f"{url}: {body['error']}")
        rows = body.get("data" if kind == "teams" else "results") or []
        catalogue = {
            str(club.get("statNetId")): str(club.get("teamCode"))
            for club in body.get("teams") or []
            if isinstance(club, dict) and club.get("statNetId") and club.get("teamCode")
        }
        result: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            if (code := row.get("team")) is not None and str(code) in catalogue:
                row = {**row, "team": catalogue[str(code)], "stat_net_team": code}
            result.append(row)
        return result

    async def async_player_profiles(self, team: Team) -> dict[str, dict[str, Any]]:
        """Return a club's players, keyed on their names."""
        known = {club_key(team.key), club_key(team.short_name), club_key(team.name)}
        squad: dict[str, dict[str, Any]] = {}
        for raw in await self._async_all_profiles():
            side = (raw.get("team") or {}).get("shortName")
            if club_key(side) in known:
                profile = _ha_profile(raw)
                squad[club_key(profile["name"])] = profile
        return squad

    async def async_fetch(self) -> tuple[dict[str, Team], list[Game]]:
        """Fetch the season from the server rendered schedule page."""
        raw_games = _extract_games(
            await self._async_get(
                HA_SCHEDULE_URL, headers={"RSC": "1"}, as_json=False
            )
        )
        if not raw_games:
            # The flight payload is also inlined in the plain HTML page, so a
            # changed RSC protocol does not have to take the integration down.
            _LOGGER.debug("No games in the RSC payload, falling back to HTML")
            html = await self._async_get(HA_SCHEDULE_URL, as_json=False)
            raw_games = _extract_games(_flight_payload_from_html(html))

        teams: dict[str, Team] = {}
        games: dict[str, Game] = {}
        for raw_game in raw_games:
            if game := _ha_game(raw_game):
                games[game.uid] = game
                teams.setdefault(game.home.key, game.home)
                teams.setdefault(game.away.key, game.away)

        if not games:
            raise HockeyApiError(
                "Could not find any games on the Hockeyallsvenskan schedule page"
            )

        return teams, sorted(games.values(), key=lambda game: game.start)

    async def async_standings(self) -> list[Standing]:
        """Return the current Hockeyallsvenskan table.

        Both the table page and the front page carry it, server rendered and in
        the same shape. The table page is the cheap read, so it is asked first
        and the front page is only opened when that comes back empty - which is
        what it did for the opening weeks of the season, when the league had
        published no table at all.
        """
        for url in (HA_STANDINGS_URL, HA_HOME_URL):
            payload = await self._async_get(url, headers={"RSC": "1"}, as_json=False)
            if standings := _ha_standings(payload):
                return standings
            _LOGGER.debug("No Hockeyallsvenskan table on %s", url)
        raise HockeyApiError("Could not read the Hockeyallsvenskan table")

    async def async_live_game(
        self, game: Game, previous: LiveGame | None = None, *, fresh: bool = False
    ) -> LiveGame:
        """Return the live state of a Hockeyallsvenskan game.

        The play-by-play lookup is keyed on the game number, both teams and the
        scheduled date. That feed comes from StatNet, which goes down mid-game
        and refuses an address that asks too often; either way we fall back to
        the score on the game record - fewer details, but the score and period
        keep flowing. How often it is asked: see HA_PBP_QUIET.
        """
        if not game.stat_net_number or not game.home_ext_id or not game.away_ext_id:
            raise HockeyApiError(f"No live-feed identifiers for game {game.uid}")

        now = time.monotonic()
        latest = self._latest.get(game.uid)
        if previous is None and latest and not fresh and now - latest[0] < HA_PBP_SHARED:
            # Someone - the live sensor, as a rule - has just read this game.
            return latest[1]
        known = previous or (latest[1] if latest else None)
        if now < self._pbp_until:
            live = await self._async_live_from_record(game, known)
        elif (
            not fresh
            and previous is not None
            and now - self._pbp_at.get(game.uid, float("-inf")) < HA_PBP_QUIET
            # A goal the record found while play-by-play was refused has no
            # scorer yet, and the scorer is worth asking for.
            and (not previous.goals or previous.goals[-1].scorer)
        ):
            raw = await self._async_record(game)
            if _record_moved(raw, previous):
                live = await self._async_play_by_play(game, known, now)
            else:
                period = _as_round(raw.get("currentPeriod"))
                live = replace(previous, current_period=period or previous.current_period)
        else:
            live = await self._async_play_by_play(game, known, now)
        self._latest[game.uid] = (now, live)
        return live

    async def _async_play_by_play(
        self, game: Game, known: LiveGame | None, now: float
    ) -> LiveGame:
        """Read StatNet's play-by-play, or the record if it will not answer."""
        try:
            payload = await self._async_post(
                HA_PBP_URL,
                {
                    "statNetGameNumber": game.stat_net_number,
                    "homeStatNetId": game.home_ext_id,
                    "awayStatNetId": game.away_ext_id,
                    "scheduledDateTime": game.start.isoformat(),
                },
            )
        except HockeyRateLimited:
            self._pbp_backoff = min(
                max(self._pbp_backoff * 2, HA_PBP_BACKOFF_MIN), HA_PBP_BACKOFF_MAX
            )
            self._pbp_until = now + self._pbp_backoff
            _LOGGER.debug(
                "Play-by-play refused us, using the score for %s s", self._pbp_backoff
            )
            return await self._async_live_from_record(game, known)
        except HockeyApiError as err:
            _LOGGER.debug("Play-by-play unavailable (%s), using the score", err)
            return await self._async_live_from_record(game, known)

        self._pbp_backoff = 0
        self._pbp_at[game.uid] = now
        if not isinstance(payload, dict):
            return await self._async_live_from_record(game, known)

        info = payload.get("game_info") or {}
        goals: list[Goal] = []
        events: list[GameEvent] = []
        current = None
        latest: int | None = None
        for period in payload.get("game_events") or []:
            if not isinstance(period, dict):
                continue
            pnum = period.get("Period")
            current = _as_round(pnum) or current
            # The clock belongs to the period being played, so start it over
            # for each block rather than carrying period 2's 19:59 into period 3.
            latest = None
            for raw in period.get("Events") or []:
                if goal := _ha_goal(raw, pnum):
                    goals.append(goal)
                if event := _ha_event(raw, pnum):
                    events.append(event)
                if (seconds := _seconds((raw or {}).get("time"))) is not None:
                    latest = seconds if latest is None else max(latest, seconds)

        return LiveGame(
            finished=bool(info.get("game_finished")),
            decided_in=str(info["decided_in"]) if info.get("decided_in") else None,
            goals=goals,
            current_period=current,
            events=events,
            clock=_clock(str(latest)) if latest is not None else None,
            powerplay=_powerplay(events, current),
            shots=_ha_shots(payload, game),
            intermission=not info.get("game_finished")
            and _ha_intermission(payload),
            finished_at=await self._async_finished_at(game, info),
        )

    async def async_scores(self, games: list[Game]) -> dict[str, GameScore]:
        """Return the current score of each game from the game records.

        The schedule page carries live scores too, but it is a megabyte of
        server-rendered payload; the games API answers for a comma-separated
        list of ids in a few kilobytes each.
        """
        uids = [game.uid for game in games if game.uid]
        scores: dict[str, GameScore] = {}
        for start in range(0, len(uids), HA_SCORE_BATCH):
            batch = uids[start : start + HA_SCORE_BATCH]
            payload = await self._async_get(HA_GAME_URL.format(game=",".join(batch)))
            rows = (payload or {}).get("data") if isinstance(payload, dict) else None
            for raw in rows or []:
                if not isinstance(raw, dict) or not (uid := raw.get("documentId")):
                    continue
                period = _as_round(raw.get("currentPeriod"))
                finished = bool(raw.get("isCompleted") or raw.get("endedDateTime"))
                scores[str(uid)] = GameScore(
                    uid=str(uid),
                    home_score=_as_int(raw.get("homeScore")),
                    away_score=_as_int(raw.get("awayScore")),
                    # A game record exists long before puck drop; the period is
                    # what says play has actually started.
                    started=bool(period) or finished,
                    finished=finished,
                    period=period,
                    decided_in=str(raw["decidedIn"]) if raw.get("decidedIn") else None,
                )
        return scores

    async def _async_finished_at(self, game: Game, info: dict[str, Any]) -> str | None:
        """Return when the game ended.

        Play-by-play says whether a game is finished but has been seen leaving
        `game_finished_at` null, so fall back to the game record's end time.
        """
        if info.get("game_finished_at"):
            return str(info["game_finished_at"])
        if not info.get("game_finished"):
            return None
        try:
            payload = await self._async_get(HA_GAME_URL.format(game=game.uid))
        except HockeyApiError:
            return None
        rows = (payload or {}).get("data") if isinstance(payload, dict) else None
        raw = rows[0] if rows else {}
        return str(raw["endedDateTime"]) if raw.get("endedDateTime") else None

    async def _async_live_from_record(
        self, game: Game, previous: LiveGame | None
    ) -> LiveGame:
        """Build the live state from the game record when play-by-play is down.

        The record carries totals, not events, so each new goal is worked out by
        comparing against the last reading. Scorer and assists are unavailable.
        """
        raw = await self._async_record(game)

        home = _as_int(raw.get("homeScore")) or 0
        away = _as_int(raw.get("awayScore")) or 0
        period = _as_round(raw.get("currentPeriod"))

        if previous is None:
            # Nothing to compare against, so the scoring is rebuilt from the
            # per-period totals the record carries - which period each goal
            # belongs to is known even when nothing else about it is.
            goals = _ha_record_goals(game, raw)
        else:
            goals = list(previous.goals)
            seen_home, seen_away = parse_score(previous.score) or (0, 0)
            while seen_home < home or seen_away < away:
                if seen_home < home:
                    seen_home += 1
                    team = game.home
                else:
                    seen_away += 1
                    team = game.away
                goals.append(
                    Goal(
                        period=period,
                        time=None,
                        team_code=team.key,
                        team_name=team.name,
                        score=f"{seen_home}-{seen_away}",
                        note=None,
                        scorer=None,
                        assists=[],
                    )
                )

        return LiveGame(
            finished=bool(raw.get("isCompleted") or raw.get("endedDateTime")),
            decided_in=str(raw["decidedIn"]) if raw.get("decidedIn") else None,
            goals=goals,
            current_period=period,
            # No play-by-play means no event log, clock or power play; keep the
            # last ones rather than blanking the card mid-game.
            events=list(previous.events) if previous else [],
            clock=previous.clock if previous else None,
            powerplay=None,
            shots=previous.shots if previous else None,
            finished_at=str(raw["endedDateTime"]) if raw.get("endedDateTime") else None,
        )

    async def async_player_stats(self, team: Team) -> list[dict[str, Any]]:
        """Return this season's stats for everyone who has played for a team.

        The stats tables answer to either spelling of a club's code, so the
        one correction this integration makes - Mora's - costs nothing here.
        """
        season = season_year()
        players: list[dict[str, Any]] = []
        for url, role in ((HA_SKATERS_URL, "skater"), (HA_GOALIES_URL, "goalkeeper")):
            payload = await self._async_post(
                url, {"league": "HA", "season": season, "team": team.key}
            )
            rows = (payload or {}).get("results") if isinstance(payload, dict) else None
            for raw in rows or []:
                if isinstance(raw, dict) and raw.get("player"):
                    players.append({**raw, "role": role})
        if not players:
            raise HockeyApiError(f"No player statistics for {team.name}")
        return players

    async def async_player_profile(
        self, team: Team, name: str
    ) -> dict[str, Any] | None:
        """Return a player's profile: picture, position, height, weight.

        Read out of the league's own roster, which is held for a few hours: its
        search takes a single word and ignores the team it is given, so sifting
        here beats asking it a question it cannot answer.
        """
        wanted = club_key(name)
        if not wanted:
            return None
        named = [
            raw
            for raw in await self._async_all_profiles()
            if club_key(f"{raw.get('firstName', '')} {raw.get('familyName', '')}")
            == wanted
        ]
        if not named:
            return None
        if len(named) > 1:
            known = {club_key(team.key), club_key(team.short_name), club_key(team.name)}
            for raw in named:
                side = (raw.get("team") or {}).get("shortName")
                if club_key(side) in known:
                    return _ha_profile(raw)
        return _ha_profile(named[0])

    async def async_highlights(self, team: Team) -> list[Clip]:
        """Return Hockeyallsvenskan highlight clips for a team, newest first."""
        payload = await self._async_clips_page()
        # The page is one carousel per club, headed with the club's everyday
        # name rather than its code: "Leksand" for Leksands IF, "Visby Roma"
        # for Visby/Roma.
        cards: list[dict[str, Any]] = []
        titles: list[str] = []
        for title, blob in _HIGHLIGHT_CAROUSEL.findall(payload):
            titles.append(title)
            if not _is_club(title, team):
                continue
            try:
                parsed = json.loads(blob)
            except ValueError:
                continue
            cards = [card for card in parsed if isinstance(card, dict)]
            break

        if not cards:
            _LOGGER.debug(
                "No highlights carousel for %s; the page offers %s",
                team.name,
                ", ".join(titles) or "none",
            )

        clips: list[Clip] = []
        for card in cards:
            # The id has been seen with whitespace around it, which makes a
            # link that goes nowhere.
            video = str(card.get("youtubeId") or "").strip()
            if not video:
                continue
            clips.append(
                Clip(
                    heading=str(card.get("heading") or "") or None,
                    subheading=str(card.get("subHeading") or "") or None,
                    url=HA_YOUTUBE_URL.format(video=video),
                    thumbnail=HA_YOUTUBE_THUMB.format(video=video),
                    video_id=str(video),
                )
            )
        feed = [
            (published, clip)
            for published, clip in await self._async_clips_feed()
            if any(_is_club(side, team) for side in _clip_sides(clip))
        ]
        return newer_from_feed(clips, feed) + clips


def parse_clip_feed(text: str) -> list[tuple[str, Clip]]:
    """Return the game clips in a YouTube channel feed, newest first.

    A game's clip is titled "Home vs. Away | Highlights 23/10"; the channel's
    other uploads (a week's power-play goals) belong to no game and are left
    out. Each comes with its upload time, as ISO text.
    """
    try:
        root = ET.fromstring(text)
    except ET.ParseError as err:
        raise HockeyApiError(f"Unreadable YouTube feed: {err}") from err
    atom = "{http://www.w3.org/2005/Atom}"
    yt = "{http://www.youtube.com/xml/schemas/2015}"
    clips: list[tuple[str, Clip]] = []
    for entry in root.iter(f"{atom}entry"):
        video = (entry.findtext(f"{yt}videoId") or "").strip()
        title = (entry.findtext(f"{atom}title") or "").strip()
        published = (entry.findtext(f"{atom}published") or "").strip()
        heading, _, rest = title.partition("|")
        heading, rest = heading.strip(), rest.strip()
        if not video or " vs. " not in heading:
            continue
        if not rest.casefold().startswith("highlights"):
            continue
        clips.append(
            (
                published,
                Clip(
                    heading=heading,
                    subheading=rest,
                    url=HA_YOUTUBE_URL.format(video=video),
                    thumbnail=HA_YOUTUBE_THUMB.format(video=video),
                    video_id=video,
                ),
            )
        )
    clips.sort(key=lambda item: item[0], reverse=True)
    return clips


def newer_from_feed(page: list[Clip], feed: list[tuple[str, Clip]]) -> list[Clip]:
    """Return the feed's clips that are newer than anything on the page.

    The page has no dates, but its clips are the channel's own videos, so the
    newest of them that the feed still holds marks where the page has got to.
    If the feed holds none of them, the page is further behind than the feed
    reaches, and all of the feed is newer.
    """
    on_page = {clip.video_id for clip in page}
    reached = max(
        (published for published, clip in feed if clip.video_id in on_page),
        default="",
    )
    return [
        clip
        for published, clip in feed
        if clip.video_id not in on_page and published > reached
    ]


def _clip_sides(clip: Clip) -> list[str]:
    """Return the two clubs a clip's "Home vs. Away" heading names."""
    return [side.strip() for side in (clip.heading or "").split(" vs. ")]


_HIGHLIGHT_CAROUSEL = re.compile(r'"title":"([^"]{1,60})","videoCards":(\[.*?\])')
_PENALTY_MINUTES = re.compile(r"(\d+)\s*min", re.IGNORECASE)


def club_key(value: str | None) -> str:
    """Return a club name stripped to its letters and digits, for comparing."""
    return re.sub(r"\W+", "", str(value or "").casefold(), flags=re.UNICODE)


def _is_club(title: str, team: Team) -> bool:
    """Return True if a carousel title names this team's club.

    The heading is the club's everyday name, so it is a prefix of the full one
    ("Leksand" of "Leksands IF"). A code only ever counts as an outright match:
    as a prefix, Vimmerby's VIS would claim Visby/Roma's clips.
    """
    heading = club_key(title)
    name = club_key(team.name)
    if not heading or not name:
        return False
    if name.startswith(heading) or heading.startswith(name):
        return True
    return heading in {club_key(team.short_name), club_key(team.key)}


def _seconds(value: Any) -> int | None:
    """Return a goal/penalty time as whole seconds into the period."""
    if value in (None, ""):
        return None
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    parts = text.split(":")
    if len(parts) == 2 and all(part.strip().isdigit() for part in parts):
        return int(parts[0]) * 60 + int(parts[1])
    return None


def _shl_event(raw: Any) -> GameEvent | None:
    """Build a match-log entry from an SHL event."""
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("type") or "").lower()
    team = raw.get("eventTeam") or {}
    common = {
        "period": _as_round(raw.get("period")),
        "time": _clock(raw.get("time")),
        "seconds": _seconds(raw.get("time")),
        "team_code": str(team.get("teamCode")) if team.get("teamCode") else None,
        "team_name": str(team.get("teamName")) if team.get("teamName") else None,
        "player": _person(raw.get("player")),
    }
    if kind == "goal":
        score = (
            f"{raw.get('homeGoals')}-{raw.get('awayGoals')}"
            if raw.get("homeGoals") is not None
            else None
        )
        detail = _shl_strength(raw)
        if raw.get("isPenaltyShot"):
            detail = f"{detail}, straff" if detail else "straff"
        return GameEvent(kind="goal", score=score, detail=detail, **common)
    if kind in ("penalty", "expulsion"):
        detail = raw.get("penaltyDescription") or raw.get("description")
        minutes = raw.get("penaltyMinutes") or raw.get("duration")
        text = " min, ".join(str(part) for part in (minutes, detail) if part)
        return GameEvent(kind="penalty", detail=text or None, **common)
    if kind == "goalkeeper":
        entering = raw.get("isEntering")
        if entering is None:
            entering = common["seconds"] == 0
        return GameEvent(kind="goalie_in" if entering else "goalie_out", **common)
    return None


def _ha_event(raw: Any, period: Any) -> GameEvent | None:
    """Build a match-log entry from a Hockeyallsvenskan event."""
    if not isinstance(raw, dict):
        return None
    kind = raw.get("type")
    team = raw.get("team") or {}
    player = _person(raw.get("player"))
    pnum = _as_round(period) or _as_round(raw.get("Period"))
    seconds = _seconds(raw.get("time"))
    common = {
        "period": pnum,
        "time": _clock(raw.get("time")),
        "seconds": seconds,
        "team_code": _short_code(team.get("code")),
        "team_name": str(team.get("name")) if team.get("name") else None,
        "player": player,
    }

    if kind == "ShootoutPenaltyShot":
        # Every attempt in the shootout, not only the ones that went in - a
        # list of the ones that scored says nothing about how it was won. The
        # scoring attempts are still goals in their own right, and are counted
        # as such on the scoreline.
        scored = str(raw.get("isGoal")).strip().lower() == "true"
        detail = "Mål" if scored else "Räddad"
        if str(raw.get("isGwg")).strip().lower() == "true":
            detail = "Mål, avgörande"
        return GameEvent(
            kind="penalty_shot", detail=detail, scored=scored, **common
        )

    if goal := _ha_goal(raw, period):
        return GameEvent(
            kind="goal",
            detail=goal.note,
            score=goal.score,
            assists=goal.assists,
            **common,
        )
    if kind in ("Penalty", "Sent off", "Expulsion"):
        return GameEvent(
            kind="penalty",
            detail=str(raw.get("eventDescription") or raw.get("penaltyVariant") or "")
            or None,
            **common,
        )
    if kind == "GoalkeeperEvent":
        entering = raw.get("isEntering")
        if entering is None:
            entering = seconds == 0
        return GameEvent(kind="goalie_in" if entering else "goalie_out", **common)
    return None


def _shot_totals(counts: dict[str, list[int]], seen: bool) -> Shots | None:
    """Turn the running tallies into a Shots, or None if nothing was logged."""
    if not seen:
        return None
    return Shots(
        home=counts["home"][0],
        away=counts["away"][0],
        home_total=counts["home"][1],
        away_total=counts["away"][1],
        home_blocked=counts["home"][2],
        away_blocked=counts["away"][2],
    )


def _shl_shots(events: list[Any]) -> Shots | None:
    """Count SHL shots per side.

    Every attempt comes through as a "shot" event carrying the part of the net
    it was aimed at: 1-9 inside the frame, 0 or a negative code for the ones
    that never got there. Goals are a separate event type, so they have to be
    added back in - a goal is a shot on goal.
    """
    # on goal, attempts, blocked
    counts = {"home": [0, 0, 0], "away": [0, 0, 0]}
    seen = False
    for raw in events:
        if not isinstance(raw, dict) or raw.get("type") not in ("shot", "goal"):
            continue
        side = (raw.get("eventTeam") or {}).get("place")
        if side not in counts:
            continue
        seen = True
        if raw["type"] == "goal" or (_as_int(raw.get("goalSection")) or 0) > 0:
            counts[side][0] += 1
        counts[side][1] += 1
    return _shot_totals(counts, seen)


# Hockeyallsvenskan says what became of every shot it logs. Only the ones the
# goalkeeper had to handle count as shots on goal: wide ("outside"), off the
# frame and blocked by an outfield player ("covered by player") do not.
_HA_ON_GOAL = {"save", "on target"}


def _ha_shots(payload: dict[str, Any], game: Game) -> Shots | None:
    """Count Hockeyallsvenskan shots per side.

    Goals are logged as their own event rather than as a shot, so they are
    added back in. Shootout attempts are left out - they are not shots on goal.
    """
    counts = {"home": [0, 0, 0], "away": [0, 0, 0]}
    seen = False
    for period in payload.get("game_events") or []:
        if not isinstance(period, dict):
            continue
        for raw in period.get("Events") or []:
            if not isinstance(raw, dict) or raw.get("type") not in ("Shot", "Goal"):
                continue
            side = _ha_side(raw.get("team") or {}, game)
            if side is None:
                continue
            seen = True
            description = str(raw.get("eventDescription") or "").strip().casefold()
            if raw["type"] == "Goal" or description in _HA_ON_GOAL:
                counts[side][0] += 1
            elif description == "covered by player":
                counts[side][2] += 1
            counts[side][1] += 1
    return _shot_totals(counts, seen)


def _shl_attendance(events: list[Any]) -> int | None:
    """Return the crowd, which SHL stamps on every play-by-play event."""
    for raw in events:
        if isinstance(raw, dict) and (crowd := _as_int(raw.get("attendance"))):
            return crowd
    return None


def _shl_intermission(events: list[Any]) -> bool:
    """Return True if SHL is between periods.

    Each period is opened and closed by a "period" event, so the break is the
    gap between the highest one finishing and the next one starting.
    """
    periods = [
        raw
        for raw in events
        if isinstance(raw, dict) and raw.get("type") == "period"
    ]
    if not periods:
        return False
    last = max(periods, key=lambda raw: _as_int(raw.get("period")) or 0)
    return bool(last.get("finished") or last.get("finishedAt"))


def _ha_intermission(payload: dict[str, Any]) -> bool:
    """Return True if Hockeyallsvenskan is between periods.

    A period block is added when the period starts and marked finished when it
    ends - the feed spells that key "Finisehd" - so the break is the stretch
    where the last block is closed and the next one has yet to appear.
    """
    periods = [
        period
        for period in payload.get("game_events") or []
        if isinstance(period, dict)
    ]
    if not periods:
        return False
    last = periods[-1]
    return bool(last.get("Finisehd") or last.get("EndTime"))


def _ha_side(team: dict[str, Any], game: Game) -> str | None:
    """Return "home" or "away" for a Hockeyallsvenskan play-by-play team block.

    The feed names a team by its StatNet id in some places and by its code or
    full name in others (MoDo is MODO, Mora is MIK), so any of them may match.
    """
    named = {
        str(team[key]).casefold()
        for key in ("statNetId", "code", "name")
        if team.get(key)
    }
    if not named:
        return None
    for side, ext_id, entry in (
        ("home", game.home_ext_id, game.home),
        ("away", game.away_ext_id, game.away),
    ):
        known = {
            str(value).casefold()
            for value in (ext_id, entry.key, entry.name, entry.short_name)
            if value
        }
        if named & known:
            return side
    return None


def _powerplay(events: list[GameEvent], period: str | None) -> PowerPlay | None:
    """Work out who has the advantage, as of the most recent event.

    Minor penalties are assumed to end when the other side scores. Without a
    running clock this is only ever as fresh as the last event, which is why it
    is evaluated at that moment rather than against wall-clock time.
    """
    live = [
        event
        for event in events
        if event.period == period and event.seconds is not None
    ]
    if not live:
        return None
    now = max(event.seconds or 0 for event in live)

    # code, name, ends, minutes
    running: list[tuple[str | None, str | None, int, int]] = []
    for event in sorted(live, key=lambda e: e.seconds or 0):
        if event.kind == "goal":
            # A power play goal ends the earliest running *minor* against the
            # conceding side. Majors run their full five minutes regardless.
            conceding = [
                item
                for item in running
                if item[0] and item[0] != event.team_code and item[3] < 5
            ]
            if conceding:
                running.remove(min(conceding, key=lambda item: item[2]))
            continue
        if event.kind != "penalty":
            continue
        match = _PENALTY_MINUTES.search(event.detail or "")
        minutes = int(match.group(1)) if match else 2
        if minutes >= 10:  # misconduct: the team is not short-handed
            continue
        running.append(
            (
                event.team_code,
                event.team_name,
                (event.seconds or 0) + minutes * 60,
                minutes,
            )
        )

    active = [item for item in running if item[2] > now]
    if not active:
        return None

    boxed = {item[0] for item in active}
    if len(boxed) > 1:  # coincidental penalties, nobody is up a skater
        return None

    penalised_code = next(iter(boxed))
    attacking = [
        event
        for event in events
        if event.team_code and event.team_code != penalised_code
    ]
    ends = min(item[2] for item in active)
    return PowerPlay(
        team_code=attacking[0].team_code if attacking else None,
        team_name=attacking[0].team_name if attacking else None,
        until=_clock(str(ends)),
        advantage="5-3" if len(active) > 1 else "5-4",
    )


def _clock(value: Any) -> str | None:
    """Return a goal time as mm:ss.

    Hockeyallsvenskan reports the time as whole seconds into the period
    ("77", "960"); SHL already sends "09:07".
    """
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text.isdigit():
        return text or None
    seconds = int(text)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _score_from_game(game: Game) -> GameScore:
    """Return a schedule entry's score as a GameScore."""
    return GameScore(
        uid=game.uid,
        home_score=game.home_score,
        away_score=game.away_score,
        started=game.state in (STATE_ONGOING, STATE_POST_GAME),
        finished=game.state == STATE_POST_GAME,
        decided_in=game.decided_in,
    )


def _shl_strength(raw: dict[str, Any]) -> str | None:
    """Return how an SHL goal was scored ("EQ", "PP1", "SH1")."""
    value = raw.get("goalStatus") or raw.get("strength")
    return str(value).strip() or None if value else None


def _strength(note: str | None) -> str | None:
    """Return "PP", "BP" or None for a goal's strength note.

    Both leagues label a goal "PP1"/"PP2" when the scoring side was a man up
    and "SH1"/"SH2" when it was a man down - boxplay, in Swedish. Anything
    else ("EQ", a shootout winner) is neither.
    """
    text = str(note or "").strip().upper()
    if text.startswith("PP"):
        return "PP"
    if text.startswith("SH"):
        return "BP"
    return None


def _person(raw: Any) -> str | None:
    """Return "#12 First Last" for a player block, or None."""
    if not isinstance(raw, dict):
        return None
    number = raw.get("jerseyToday") or raw.get("jerseyNumber") or ""
    name = raw.get("name") or " ".join(
        str(raw.get(key) or "") for key in ("firstName", "familyName")
    )
    text = f"#{number} {name}" if number else str(name)
    return re.sub(r"\s+", " ", text).strip() or None


def _ha_standings(payload: str) -> list[Standing]:
    """Return the table rows embedded in a Hockeyallsvenskan page, if any."""
    standings: list[Standing] = []
    for raw in _extract_array(_STANDINGS_KEY, payload):
        if not (code := _short_code(raw.get("teamCode"))):
            continue
        standings.append(
            Standing(
                rank=_as_int(raw.get("rank")),
                team_code=code.upper(),
                team_name=str(raw.get("statNetClubLabel") or code),
                games_played=_as_int(raw.get("games_played")),
                wins=_as_int(raw.get("wins")),
                losses=_as_int(raw.get("losses")),
                overtime_wins=(_as_int(raw.get("overtime_wins")) or 0)
                + (_as_int(raw.get("shootouts_wins")) or 0),
                overtime_losses=(_as_int(raw.get("overtime_losses")) or 0)
                + (_as_int(raw.get("shootouts_losses")) or 0),
                goals_for=_as_int(raw.get("goals")),
                goals_against=_as_int(raw.get("goals_against")),
                goal_difference=_as_int(raw.get("goal_difference")),
                points=_as_int(raw.get("total_points")),
            )
        )
    return standings


def _ha_goal(raw: Any, period: Any) -> Goal | None:
    """Build a goal from a Hockeyallsvenskan play-by-play event."""
    if not isinstance(raw, dict):
        return None
    kind = raw.get("type")
    if kind != "Goal" and not (
        kind == "ShootoutPenaltyShot" and str(raw.get("isGoal")) == "true"
    ):
        return None

    team = raw.get("team") or {}
    assists = [
        name
        for key in ("Assist1", "Assist2")
        if (name := _person(raw.get(key)))
    ]
    if not assists:
        assists = [
            name for helper in raw.get("assists") or [] if (name := _person(helper))
        ]

    return Goal(
        period=_as_round(period) or _as_round(raw.get("Period")),
        time=_clock(raw.get("time")),
        team_code=_short_code(team.get("code")),
        team_name=str(team.get("name")) if team.get("name") else None,
        score=str(raw.get("runningScore") or raw.get("score") or "") or None,
        note=str(raw.get("eventDescription") or raw.get("scoreStatus") or "") or None,
        scorer=_person(raw.get("player")),
        assists=assists,
    )


def _extract_array(pattern: re.Pattern[str], payload: str) -> list[dict[str, Any]]:
    """Pull the largest JSON array following a key out of a flight payload."""
    decoder = json.JSONDecoder()
    best: list[dict[str, Any]] = []
    for match in pattern.finditer(payload):
        start = payload.index("[", match.start())
        try:
            data, _ = decoder.raw_decode(payload[start:])
        except ValueError:
            continue
        if isinstance(data, list) and len(data) > len(best):
            best = [item for item in data if isinstance(item, dict)]
    return best


def match_team(teams: dict[str, Team], wanted: str) -> Team | None:
    """Return the team a caller means, by code, short name or club name.

    A club answers to several names - LIF, Leksand, Leksands IF - and which of
    them a payload carries varies from one endpoint to the next, so the codes
    are matched outright and the names on their letters alone, either one
    allowed to be a prefix of the other.
    """
    folded = club_key(wanted)
    if not folded:
        return None
    for team in teams.values():
        if folded in {club_key(team.key), club_key(team.short_name)}:
            return team
    for team in teams.values():
        name = club_key(team.name)
        if name and (name.startswith(folded) or folded.startswith(name)):
            return team
    return None


# The league writes positions in English; the card speaks Swedish.
_POSITIONS = {
    "LW": "Vänsterforward",
    "RW": "Högerforward",
    "CE": "Center",
    "LD": "Vänsterback",
    "RD": "Högerback",
    "GK": "Målvakt",
}


def _ha_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """Return the useful part of a Hockeyallsvenskan player record."""
    shots = raw.get("headshots") or {}
    code = str(raw.get("positionCode") or "").upper()
    return {
        "name": f"{raw.get('firstName', '')} {raw.get('familyName', '')}".strip(),
        "jersey": raw.get("jerseyNumber"),
        "position": _POSITIONS.get(code, raw.get("positionName")),
        "position_code": code or None,
        "shoots": raw.get("shoots"),
        "height": _as_int(raw.get("height")),
        "weight": _as_int(raw.get("weight")),
        "birth_date": raw.get("birthDate"),
        "country": raw.get("country"),
        "rookie": raw.get("isRookie"),
        "youth_team": raw.get("youthTeam"),
        "photo": shots.get("medium") or shots.get("large") or shots.get("small"),
        # The same headshot at the size worth looking at properly.
        "photo_large": shots.get("large") or shots.get("medium"),
        "team": (raw.get("team") or {}).get("shortName"),
        "team_name": (raw.get("team") or {}).get("name"),
        "slug": raw.get("slug"),
        "url": HA_PLAYER_PAGE_URL.format(slug=raw["slug"]) if raw.get("slug") else None,
    }


# What the career calls each competition, in the words the card uses.
_COMPETITIONS = {
    "HA": "Hockeyallsvenskan",
    "HAPlayoff": "HA-slutspel",
    "HAkval": "HA-kval",
    "Elitserien": "SHL",
    "SMSlutspel": "SHL-slutspel",
    "PlayIn": "SHL play in",
    "SHLkval": "SHL-kval",
    "KvalTillSHL": "SHL-kval",
}
# The regular seasons, as opposed to the playoffs and qualifiers after them.
_SERIES = {"HA", "Elitserien"}
# The catalogue only knows clubs that have played in this league, and these
# four have not since the career records begin.
_SHL_ONLY_CLUBS = {
    "FBK": "Färjestad",
    "FHC": "Frölunda",
    "LHC": "Linköping",
    "LHF": "Luleå",
}


def _career_rows(page: str) -> list[dict[str, Any]]:
    """Pick the season-by-season rows out of a player page's flight payload.

    That is the RSC stream, its JSON as it is; the HTML page carries the same
    escaped once more, which this does not read.
    """
    marker = '"player_season_by_season_stats":'
    start = page.find(marker)
    if start < 0:
        raise HockeyApiError("No career on the player's page")
    try:
        rows, _ = json.JSONDecoder().raw_decode(page, start + len(marker))
    except ValueError as err:
        raise HockeyApiError(f"Unreadable career on the player's page: {err}") from err
    return [
        row
        for row in rows or []
        if isinstance(row, dict) and isinstance(row.get("Season"), int) and row.get("TeamCode")
    ]


def _career_row(
    raw: dict[str, Any], names: dict[int, dict[str, dict[str, Any]]]
) -> dict[str, Any]:
    """Return one line of a career, its club named and its figures as the
    season's statistics name them."""
    code = str(raw["TeamCode"])
    season = int(raw["Season"])
    # The club as it was called that season, else any other season's name for
    # the code: the catalogue has a season only for its own clubs.
    club = names.get(season, {}).get(code) or next(
        (clubs[code] for _, clubs in sorted(names.items(), reverse=True) if code in clubs),
        None,
    )
    kind = str(raw.get("GameType") or "")
    row: dict[str, Any] = {
        "season": season,
        "team_code": (club or {}).get("shortName") or code,
        # The stats system's own code, which is not always the schedule's
        # (MIK against MORA); kept so either can be matched.
        "stat_net_team": code,
        "team": (club or {}).get("name") or _SHL_ONLY_CLUBS.get(code) or code,
        "logo": (club or {}).get("logo"),
        "competition": _COMPETITIONS.get(kind, kind or None),
        "competition_code": kind or None,
    }
    if "GPI" in raw:
        # A goalkeeper's GP counts the games he sat on the bench for; GPI is
        # the ones he played. The save percentage comes back empty, so it is
        # worked out from the saves.
        shots, saves = _as_int(raw.get("SOGA")), _as_int(raw.get("SVS"))
        row |= {
            "role": "goalkeeper",
            "GP": _as_int(raw.get("GPI")),
            "W": _as_int(raw.get("W")),
            "L": _as_int(raw.get("L")),
            "SO": _as_int(raw.get("SO")),
            "GAA": raw.get("GAA"),
            "SVS_perc": round(saves / shots * 100, 2) if shots and saves is not None else None,
        }
    else:
        row |= {
            "role": "skater",
            "GP": _as_int(raw.get("GP")),
            "G": _as_int(raw.get("G")),
            "A": _as_int(raw.get("A")),
            "TP": _as_int(raw.get("TP")),
            "PIM": _as_int(raw.get("PIM")),
            "PlusMinus": _as_int(raw.get("PlusMinus")),
        }
    return row


def season_year(moment: datetime | None = None) -> int:
    """Return the season a moment belongs to, named by the year it began in.

    A season runs from autumn to spring and is filed under the year it started,
    so anything from July onwards belongs to the season named after this year.
    """
    now = moment or dt_util.utcnow()
    return now.year if now.month >= 7 else now.year - 1


def create_client(league: str, session: ClientSession) -> LeagueClient:
    """Return a client for the given league."""
    if league == LEAGUE_SHL:
        return ShlClient(session)
    if league == LEAGUE_HOCKEYALLSVENSKAN:
        return HockeyallsvenskanClient(session)
    raise HockeyApiError(f"Unknown league: {league}")


def _shl_profile(
    code: str, group: dict[str, Any], raw: dict[str, Any], record: dict[str, Any]
) -> dict[str, Any]:
    """Return an SHL squad player in the shape of a Hockeyallsvenskan profile.

    The squad only sorts its players into goalkeepers, backs and forwards, so
    that is all the position there is. A shot is "Left", "Right" or "left".
    """
    shoots = str(record.get("shoots") or "").strip()[:1].upper()
    return {
        "name": str(
            raw.get("fullName") or f"{raw.get('firstName', '')} {raw.get('lastName', '')}"
        ).strip(),
        "jersey": raw.get("jerseyNumber"),
        "position_code": str(group.get("positionCode") or "").upper() or None,
        "shoots": shoots if shoots in ("L", "R") else None,
        "height": _as_int(record.get("height")),
        "weight": _as_int(record.get("weight")),
        "birth_date": record.get("dateOfBirth"),
        "country": record.get("nationality") or raw.get("nationality"),
        "team": code,
    }


def _shl_team_from_list(raw: Any) -> Team | None:
    """Build a team from an entry in the schedule's teamList."""
    if not isinstance(raw, dict) or not (code := raw.get("teamCode")):
        return None
    names = raw.get("teamNames") or {}
    name = (
        names.get("longSite")
        or names.get("long")
        or raw.get("displayName")
        or names.get("fullSite")
        or code
    )
    return Team(
        key=str(code),
        name=str(name).strip(),
        short_name=str(names.get("shortSite") or names.get("short") or code).strip(),
        logo=raw.get("logo"),
    )


def _shl_team_from_game(raw: Any) -> Team | None:
    """Build a team from the home/away block of a game."""
    if not isinstance(raw, dict) or not (code := raw.get("code")):
        return None
    names = raw.get("names") or {}
    name = names.get("longSite") or names.get("long") or names.get("fullSite") or code
    return Team(
        key=str(code),
        name=str(name).strip(),
        short_name=str(names.get("shortSite") or names.get("short") or code).strip(),
        logo=raw.get("icon"),
    )


def _shl_game(raw: Any) -> Game | None:
    """Build a game from an SHL gameInfo entry."""
    if not isinstance(raw, dict) or not (uid := raw.get("uuid")):
        return None

    home = _shl_team_from_game(raw.get("homeTeamInfo"))
    away = _shl_team_from_game(raw.get("awayTeamInfo"))
    start = _parse_utc(raw.get("rawStartDateTime")) or _parse_local(
        raw.get("startDateTime")
    )
    if not home or not away or not start:
        return None

    venue = raw.get("venueInfo") or {}
    url = None
    if ssgt := raw.get("ssgtUuid"):
        url = SHL_GAME_URL.format(game=uid, ssgt=ssgt)

    decided_in = None
    if raw.get("shootout"):
        decided_in = "SO"
    elif raw.get("overtime"):
        decided_in = "OT"

    return Game(
        uid=str(uid),
        start=start,
        home=home,
        away=away,
        venue=venue.get("name") if isinstance(venue, dict) else None,
        round=_as_round(raw.get("roundLabel") or raw.get("roundNumber")),
        state=str(raw.get("state") or STATE_PRE_GAME),
        home_score=_shl_score(raw.get("homeTeamInfo")),
        away_score=_shl_score(raw.get("awayTeamInfo")),
        decided_in=decided_in,
        url=url,
        home_ext_id=home.key,
        away_ext_id=away.key,
    )


def _shl_score(raw: Any) -> int | None:
    """Return the score of a team, which is the string "N/A" before puck drop."""
    if not isinstance(raw, dict):
        return None
    score = raw.get("score")
    if isinstance(score, bool) or not isinstance(score, (int, str)):
        return None
    try:
        return int(score)
    except ValueError:
        return None


# Hockeyallsvenskan's CMS and its stats system disagree on four clubs' codes,
# and neither is right every time: the CMS abbreviates Mora with the name of
# the town while the stats system calls the club MIK, as everyone does - but
# the same system writes Östersund's ÖIK as OSIK and Nybro's NVIF as NYB, which
# are worse, not better. So the CMS stays the source and only the one it gets
# wrong is corrected here.
_SHORT_CODE_FIXES = {"MORA": "MIK"}


def _short_code(code: Any) -> str | None:
    """Return a club's everyday abbreviation."""
    text = str(code or "").strip()
    if not text:
        return None
    return _SHORT_CODE_FIXES.get(text.upper(), text)


def _ha_team(raw: Any) -> Team | None:
    """Build a team from a Hockeyallsvenskan game's team block."""
    if not isinstance(raw, dict):
        return None
    code = raw.get("shortName") or raw.get("name")
    if not code:
        return None

    logo = None
    if isinstance(logo_raw := raw.get("logo"), dict):
        formats = logo_raw.get("formats") or {}
        small = formats.get("small") if isinstance(formats, dict) else None
        if isinstance(small, dict):
            logo = small.get("url")
        logo = logo or logo_raw.get("url")

    short = _short_code(raw.get("shortName") or code) or str(code)
    colour = str(raw.get("mainColorHex") or "").strip()
    return Team(
        key=short.upper(),
        name=str(raw.get("name") or code).strip(),
        short_name=short,
        logo=logo,
        color=colour if re.fullmatch(r"#[0-9a-fA-F]{3,8}", colour) else None,
    )


def _ha_game(raw: Any) -> Game | None:
    """Build a game from a Hockeyallsvenskan game entry."""
    if not isinstance(raw, dict):
        return None

    uid = raw.get("documentId") or raw.get("slug") or raw.get("id")
    home = _ha_team(raw.get("homeTeam"))
    away = _ha_team(raw.get("awayTeam"))
    start = _parse_utc(raw.get("scheduledDateTime"))
    if not uid or not home or not away or not start:
        return None

    if raw.get("isCompleted") or raw.get("endedDateTime"):
        state = STATE_POST_GAME
    elif raw.get("currentPeriod"):
        state = STATE_ONGOING
    else:
        state = STATE_PRE_GAME

    venue = raw.get("venue")
    if not venue and isinstance(home_raw := raw.get("homeTeam"), dict):
        venue = home_raw.get("teamArena")

    return Game(
        uid=str(uid),
        start=start,
        home=home,
        away=away,
        venue=str(venue).strip() if venue else None,
        round=_as_round(raw.get("round")),
        state=state,
        home_score=_as_int(raw.get("homeScore")),
        away_score=_as_int(raw.get("awayScore")),
        decided_in=str(raw["decidedIn"]) if raw.get("decidedIn") else None,
        slug=str(raw["slug"]) if raw.get("slug") else None,
        url=HA_GAME_PAGE_URL.format(slug=raw["slug"]) if raw.get("slug") else None,
        stat_net_number=(
            str(raw["statNetGameNumber"]) if raw.get("statNetGameNumber") else None
        ),
        home_ext_id=str(raw["homeStatNetId"]) if raw.get("homeStatNetId") else None,
        away_ext_id=str(raw["awayStatNetId"]) if raw.get("awayStatNetId") else None,
        ended_at=str(raw["endedDateTime"]) if raw.get("endedDateTime") else None,
        attendance=_as_int(raw.get("attendance")) or None,
    )


def _extract_games(payload: str) -> list[dict[str, Any]]:
    """Pull the largest ``"games": [...]`` array out of a flight payload."""
    return _extract_array(_GAMES_KEY, payload)


def _flight_payload_from_html(html: str) -> str:
    """Reassemble the RSC flight payload from the inline script chunks."""
    decoder = json.JSONDecoder()
    parts: list[str] = []
    for match in _FLIGHT_CHUNK.finditer(html):
        try:
            chunk, _ = decoder.raw_decode(html[match.end() :])
        except ValueError:
            continue
        if isinstance(chunk, str):
            parts.append(chunk)
    return "".join(parts)


def _parse_utc(value: Any) -> datetime | None:
    """Parse an ISO timestamp that is already expressed in UTC."""
    if not isinstance(value, str) or not (parsed := dt_util.parse_datetime(value)):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.UTC)
    return dt_util.as_utc(parsed)


def _parse_local(value: Any) -> datetime | None:
    """Parse a naive timestamp expressed in Swedish local time."""
    if not isinstance(value, str) or not (parsed := dt_util.parse_datetime(value)):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_time_zone("Europe/Stockholm"))
    return dt_util.as_utc(parsed)


def _as_int(value: Any) -> int | None:
    """Return value as an int, or None if it is not a number."""
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _record_moved(raw: dict[str, Any], previous: LiveGame) -> bool:
    """Return True if the game record shows more than the last reading did.

    A goal or the end: what play-by-play is worth reading for at once. A
    record that says less is only behind, and is not news. A new period is
    not either: play-by-play names it only once something happens in it, so
    asking at once would ask on every poll until then; the record's period is
    used instead.
    """
    home, away = parse_score(previous.score) or (0, 0)
    if (_as_int(raw.get("homeScore")) or 0) > home:
        return True
    if (_as_int(raw.get("awayScore")) or 0) > away:
        return True
    return bool(raw.get("isCompleted") or raw.get("endedDateTime")) and not previous.finished


def _as_round(value: Any) -> str | None:
    """Return a printable round or period label.

    The game record spells periods "P2" while play-by-play says "2"; strip the
    prefix so the two sources agree.
    """
    if value in (None, "", 0):
        return None
    text = str(value).strip()
    if len(text) > 1 and text[0] in "Pp" and text[1:].isdigit():
        text = text[1:]
    return text or None
