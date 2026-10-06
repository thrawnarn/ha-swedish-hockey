"""Services for the Svensk hockey integration.

These replace the hand-rolled `rest_command:` entries the automations used to
call: the league-specific URLs, payload shapes and field names live here, and
the services hand back the same normalised structures for both leagues.
"""

from __future__ import annotations

import logging
import re
from dataclasses import replace
from datetime import date, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import ConfigEntrySelector
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .api import (
    Game,
    HockeyApiError,
    LiveGame,
    Standing,
    Team,
    club_key,
    match_team,
    parse_score,
    season_year,
)
from .archive import (
    DEFAULT_SEASONS,
    MAX_SEASONS,
    STORE_VERSION as ARCHIVE_STORE_VERSION,
    Archive,
    page_reader,
)
from .const import (
    CONF_GAME_DURATION,
    DEFAULT_GAME_DURATION,
    DOMAIN,
    FORM_GAMES,
    LIVE_WINDOW_AFTER,
    LIVE_WINDOW_BEFORE,
)
from .matchup import head_to_head, meetings, team_summary
from .stats import game_stats
from .coordinator import (
    SwedishHockeyConfigEntry,
    live_standings,
    standings_from_results,
    table_rows,
)

_LOGGER = logging.getLogger(__name__)

ATTR_CONFIG_ENTRY_ID = "config_entry_id"
ATTR_TEAM = "team"

SERVICE_GET_STANDINGS = "get_standings"
SERVICE_GET_GAME = "get_game"
SERVICE_GET_PLAY_BY_PLAY = "get_play_by_play"
SERVICE_GET_HIGHLIGHTS = "get_highlights"
SERVICE_GET_RECAP = "get_recap"
SERVICE_GET_SCHEDULE = "get_schedule"
SERVICE_GET_PLAYER = "get_player"
SERVICE_GET_ROSTER = "get_roster"
SERVICE_GET_FORM_TABLE = "get_form_table"
SERVICE_GET_LIVE = "get_live"
SERVICE_GET_RESULTS = "get_results"
SERVICE_GET_STATISTICS = "get_statistics"
SERVICE_SET_GOAL_REFERENCE = "set_goal_reference"
SERVICE_GET_MATCHUP = "get_matchup"
SERVICE_GET_HEAD_TO_HEAD = "get_head_to_head"

ATTR_LIMIT = "limit"
ATTR_GAME_ID = "game_id"
ATTR_PLAYER = "player"
ATTR_BEFORE = "before"
ATTR_HIGHLIGHTS = "highlights"
ATTR_LAST = "last"
ATTR_LIVE = "live"
ATTR_SCORE = "score"
ATTR_DATE = "date"
ATTR_REFERENCE = "reference"
ATTR_LOCATION = "location"
ATTR_OPPONENT = "opponent"
ATTR_SEASONS = "seasons"

_ENTRY_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CONFIG_ENTRY_ID): ConfigEntrySelector({"integration": DOMAIN}),
    }
)
_TEAM_SCHEMA = _ENTRY_SCHEMA.extend({vol.Required(ATTR_TEAM): cv.string})
# Left out, the table counts the games in play whenever there are any.
_STANDINGS_SCHEMA = _ENTRY_SCHEMA.extend({vol.Optional(ATTR_LIVE): cv.boolean})
# Without a game the recap is of the last one played, which is what a bot
# command wants; a card hands back the id of the row someone tapped.
_RECAP_SCHEMA = _TEAM_SCHEMA.extend({vol.Optional(ATTR_GAME_ID): cv.string})
_RESULTS_SCHEMA = _TEAM_SCHEMA.extend(
    {
        vol.Optional(ATTR_LIMIT, default=10): vol.All(int, vol.Range(min=1, max=100)),
        vol.Optional(ATTR_HIGHLIGHTS, default=False): cv.boolean,
    }
)
# Without a date it is today, with the scores read as they stand; any other
# day is answered from the schedule - results behind, fixtures ahead.
_LIVE_SCHEMA = _ENTRY_SCHEMA.extend({vol.Optional(ATTR_DATE): cv.date})
# What an automation sent for a goal - a Telegram message id, say - so the
# goal_updated event can hand it back and the message be edited.
_GOAL_REFERENCE_SCHEMA = _TEAM_SCHEMA.extend(
    {
        vol.Required(ATTR_GAME_ID): cv.string,
        vol.Required(ATTR_SCORE): cv.string,
        vol.Required(ATTR_REFERENCE): cv.string,
    }
)
_PLAYER_SCHEMA = _TEAM_SCHEMA.extend({vol.Required(ATTR_PLAYER): cv.string})
_FORM_TABLE_SCHEMA = _ENTRY_SCHEMA.extend(
    {
        vol.Optional(ATTR_LAST, default=5): vol.All(int, vol.Range(min=1, max=82)),
        vol.Optional(ATTR_TEAM): cv.string,
    }
)
# The whole season unless narrowed: to home or away games, or to each one's
# last few - which only Hockeyallsvenskan's tables can be asked for.
_STATISTICS_SCHEMA = _ENTRY_SCHEMA.extend(
    {
        vol.Optional(ATTR_LOCATION, default="all"): vol.In(["all", "home", "away"]),
        vol.Optional(ATTR_LAST): vol.All(int, vol.Range(min=1, max=82)),
    }
)
# A game by its id - what a card has from a fixture row - or the next meeting
# between two clubs, which is what a person asks for.
_MATCHUP_SCHEMA = _ENTRY_SCHEMA.extend(
    {
        vol.Optional(ATTR_GAME_ID): cv.string,
        vol.Optional(ATTR_TEAM): cv.string,
        vol.Optional(ATTR_OPPONENT): cv.string,
    }
)
_HEAD_TO_HEAD_SCHEMA = _TEAM_SCHEMA.extend(
    {
        vol.Required(ATTR_OPPONENT): cv.string,
        vol.Optional(ATTR_SEASONS, default=DEFAULT_SEASONS): vol.All(
            int, vol.Range(min=1, max=MAX_SEASONS)
        ),
    }
)
_SCHEDULE_SCHEMA = _ENTRY_SCHEMA.extend(
    {
        vol.Optional(ATTR_LIMIT, default=20): vol.All(int, vol.Range(min=1, max=200)),
        # Without a team the whole league's fixtures come back. `before` says
        # how many already-played games to reach back for: none by default, so
        # what comes back is what is still to come.
        vol.Optional(ATTR_TEAM): cv.string,
        vol.Optional(ATTR_BEFORE, default=0): vol.All(int, vol.Range(min=0, max=400)),
        vol.Optional(ATTR_HIGHLIGHTS, default=False): cv.boolean,
    }
)


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the integration's services."""
    for name, schema, handler in (
        (SERVICE_GET_STANDINGS, _STANDINGS_SCHEMA, _async_get_standings),
        (SERVICE_GET_GAME, _TEAM_SCHEMA, _async_get_game),
        (SERVICE_GET_PLAY_BY_PLAY, _TEAM_SCHEMA, _async_get_play_by_play),
        (SERVICE_GET_HIGHLIGHTS, _TEAM_SCHEMA, _async_get_highlights),
        (SERVICE_GET_RECAP, _RECAP_SCHEMA, _async_get_recap),
        (SERVICE_GET_SCHEDULE, _SCHEDULE_SCHEMA, _async_get_schedule),
        (SERVICE_GET_PLAYER, _PLAYER_SCHEMA, _async_get_player),
        (SERVICE_GET_ROSTER, _TEAM_SCHEMA, _async_get_roster),
        (SERVICE_GET_FORM_TABLE, _FORM_TABLE_SCHEMA, _async_get_form_table),
        (SERVICE_GET_LIVE, _LIVE_SCHEMA, _async_get_live),
        (SERVICE_GET_RESULTS, _RESULTS_SCHEMA, _async_get_results),
        (SERVICE_GET_STATISTICS, _STATISTICS_SCHEMA, _async_get_statistics),
        (SERVICE_GET_MATCHUP, _MATCHUP_SCHEMA, _async_get_matchup),
        (SERVICE_GET_HEAD_TO_HEAD, _HEAD_TO_HEAD_SCHEMA, _async_get_head_to_head),
    ):
        hass.services.async_register(
            DOMAIN,
            name,
            handler,
            schema=schema,
            supports_response=SupportsResponse.ONLY,
        )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_GOAL_REFERENCE,
        _async_set_goal_reference,
        schema=_GOAL_REFERENCE_SCHEMA,
    )


async def _async_set_goal_reference(call: ServiceCall) -> None:
    """Keep a reference to what was sent for a goal.

    A goal nobody announced - an old one, or a game id that is not the one
    being followed - is let go quietly: an automation answering an event that
    has just been fired should not fail over a reference with nowhere to go.
    """
    entry = _entry(call)
    team = _team(entry, call)
    live = entry.runtime_data.live.get(team.key)
    if live is None or not live.async_set_goal_reference(
        call.data[ATTR_GAME_ID], call.data[ATTR_SCORE], call.data[ATTR_REFERENCE]
    ):
        _LOGGER.debug(
            "No announced goal %s in %s to keep a reference for",
            call.data[ATTR_SCORE],
            call.data[ATTR_GAME_ID],
        )


def _entry(call: ServiceCall) -> SwedishHockeyConfigEntry:
    """Return the league the call is aimed at."""
    entry_id: str = call.data[ATTR_CONFIG_ENTRY_ID]
    entry = call.hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_found",
            translation_placeholders={"entry": entry_id},
        )
    if entry.state is not ConfigEntryState.LOADED:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_loaded",
            translation_placeholders={"entry": entry.title},
        )
    return entry


def _team(entry: SwedishHockeyConfigEntry, call: ServiceCall) -> Team:
    """Resolve a team by its code or by name, however the caller spelled it."""
    return _team_named(entry, str(call.data[ATTR_TEAM]))


def _team_named(entry: SwedishHockeyConfigEntry, wanted: str) -> Team:
    """Resolve a club in this league from any of its names."""
    data = entry.runtime_data.data
    teams = data.teams if data else {}
    if (team := match_team(teams, wanted)) is not None:
        return team
    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="unknown_team",
        translation_placeholders={
            "team": wanted,
            "league": entry.title,
            "teams": ", ".join(sorted(teams)),
        },
    )


def _current_game(entry: SwedishHockeyConfigEntry, team: Team) -> Game:
    """Return the game being played now, else the next one up."""
    coordinator = entry.runtime_data
    minutes = entry.options.get(CONF_GAME_DURATION, DEFAULT_GAME_DURATION)
    duration = timedelta(minutes=minutes)
    now = dt_util.utcnow()
    data = coordinator.data
    for game in data.games_for(team.key) if data else []:
        if game.start + duration > now:
            return game
    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="no_game",
        translation_placeholders={"team": team.name},
    )


def _game_dict(game: Game, team: Team) -> dict[str, Any]:
    """Return a game as a plain dict for a service response."""
    is_home = game.home.key == team.key
    return {
        "start": game.start.isoformat(),
        "opponent": (game.away if is_home else game.home).name,
        "is_home": is_home,
        "home_team": game.home.name,
        "away_team": game.away.name,
        "home_code": game.home.key,
        "away_code": game.away.key,
        "venue": game.venue,
        "round": game.round,
        "state": game.state,
        "home_score": game.home_score,
        "away_score": game.away_score,
        "decided_in": game.decided_in,
        "game_id": game.uid,
        "slug": game.slug,
        "url": game.url,
    }


async def _async_get_standings(call: ServiceCall) -> ServiceResponse:
    """Return the league table.

    While games are being played it is the table as it stands, with those games
    counted in on top of the published one; `live` says which of the two came
    back, so a caller can label it. Pass live: false to always get the official
    table.
    """
    entry = _entry(call)
    try:
        standings = await entry.runtime_data.client.async_standings()
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err

    playing: set[str] = set()
    counted = 0
    if call.data.get(ATTR_LIVE) is not False:
        standings, playing, counted = await _async_live_table(entry, standings)
    return {
        "standings": [row.as_dict() for row in standings],
        # True when the table counts games the published one does not yet.
        "live": bool(counted),
        "live_games": counted,
        "live_teams": sorted(playing),
    }


async def _async_live_table(
    entry: SwedishHockeyConfigEntry, standings: list[Standing]
) -> tuple[list[Standing], set[str], int]:
    """Return the table with tonight's games counted in, where they are not yet.

    The scores are read here rather than taken from the background poll: this
    is asked for by hand, and a table is only worth showing if it is current.
    Falls back to the published table when tonight has nothing to add to it.
    """
    data = entry.runtime_data.data
    if data is None:
        return standings, set(), 0
    now = dt_util.utcnow()
    tonight = [
        game
        for game in data.games
        if game.start - LIVE_WINDOW_BEFORE <= now <= game.start + LIVE_WINDOW_AFTER
    ]
    if not tonight:
        return standings, set(), 0
    try:
        scores = await entry.runtime_data.client.async_scores(tonight)
    except HockeyApiError as err:
        _LOGGER.debug("Kunde inte hämta liveresultat till tabellen: %s", err)
        return standings, set(), 0
    rows, playing, counted = live_standings(replace(data, standings=standings), scores)
    if not rows or not counted:
        return standings, set(), 0
    return rows, playing, len(counted)


async def _async_get_game(call: ServiceCall) -> ServiceResponse:
    """Return a team's current or next game."""
    entry = _entry(call)
    team = _team(entry, call)
    return {"game": _game_dict(_current_game(entry, team), team)}


def _is_ours(goal: Any, team: Team) -> bool:
    """Return True if the followed team scored this goal."""
    code = (goal.team_code or "").casefold()
    name = (goal.team_name or "").casefold()
    known = {team.key.casefold(), team.short_name.casefold()}
    if code and code in known:
        return True
    return bool(name) and (name == team.name.casefold() or any(
        part and part in name for part in known
    ))


def _outcome(score: str | None, is_home: bool) -> bool | None:
    """Return True if the followed team is ahead on this score line."""
    if not score:
        return None
    parts = re.split(r"[^0-9]+", score.strip())
    numbers = [int(part) for part in parts if part.isdigit()]
    if len(numbers) < 2:
        return None
    home, away = numbers[0], numbers[1]
    if home == away:
        return None
    return (home > away) if is_home else (away > home)


async def _async_get_play_by_play(call: ServiceCall) -> ServiceResponse:
    """Return the live state and goals of a team's current game."""
    entry = _entry(call)
    team = _team(entry, call)
    game = _current_game(entry, team)
    try:
        live = await entry.runtime_data.client.async_live_game(game)
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err
    # The last goal's running score is the score; no extra request needed.
    score = (live.goals[-1].score if live.goals else None) or "0-0"
    is_home = game.home.key == team.key
    goals = []
    for goal in live.goals:
        entry = goal.as_dict()
        entry["ours"] = _is_ours(goal, team)
        goals.append(entry)
    return {
        "finished": live.finished,
        "decided_in": live.decided_in,
        "score": score,
        "we_won": _outcome(score, is_home),
        "goal_count": len(goals),
        "goals": goals,
        "clock": live.clock,
        "period": live.period,
        "powerplay": live.powerplay.as_dict() if live.powerplay else None,
        "intermission": live.intermission,
        "shots": live.shots.as_dict() if live.shots else None,
        "events": [event.as_dict() for event in reversed(live.events)],
        "game": _game_dict(game, team),
    }


def _result_dict(game: Game, team: Team) -> dict[str, Any]:
    """Return a played game from the followed team's point of view."""
    is_home = game.home.key == team.key
    ours = game.home_score if is_home else game.away_score
    theirs = game.away_score if is_home else game.home_score
    return {
        "start": game.start.isoformat(),
        "opponent": (game.away if is_home else game.home).name,
        "opponent_code": (game.away if is_home else game.home).key,
        "is_home": is_home,
        "home_team": game.home.name,
        "away_team": game.away.name,
        "home_code": game.home.key,
        "away_code": game.away.key,
        "home_logo": game.home.logo,
        "away_logo": game.away.logo,
        "home_color": game.home.color,
        "away_color": game.away.color,
        "home_score": game.home_score,
        "away_score": game.away_score,
        "score": f"{game.home_score}-{game.away_score}",
        "goals_for": ours,
        "goals_against": theirs,
        "won": None if ours == theirs else ours > theirs,
        "decided_in": game.decided_in,
        "venue": game.venue,
        "round": game.round,
        "attendance": game.attendance,
        "game_id": game.uid,
        "url": game.url,
    }


async def _async_get_results(call: ServiceCall) -> ServiceResponse:
    """Return a team's played games, most recent first."""
    entry = _entry(call)
    team = _team(entry, call)
    data = entry.runtime_data.data
    played = data.results_for(team.key) if data else []
    limit = int(call.data.get(ATTR_LIMIT, 10))
    clips = await _async_clips(entry) if call.data.get(ATTR_HIGHLIGHTS) else {}
    return {
        "results": [
            dict(_result_dict(game, team), highlight=clips.get(game.uid))
            for game in played[:limit]
        ],
        "total_played": len(played),
    }


async def _async_get_highlights(call: ServiceCall) -> ServiceResponse:
    """Return highlight clips for a team, newest first."""
    entry = _entry(call)
    team = _team(entry, call)
    try:
        clips = await entry.runtime_data.client.async_highlights(team)
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err
    return {"clips": [clip.as_dict() for clip in clips]}


async def _async_get_recap(call: ServiceCall) -> ServiceResponse:
    """Return a summary of the team's most recent finished game.

    The play-by-play of a game that is over is still there to be read, so the
    goals, the shots and how it was decided come from the same feed that fed
    the card while it was being played - not from whatever the live sensor
    happens to be holding, which is nothing at all after a restart.
    """
    entry = _entry(call)
    team = _team(entry, call)
    data = entry.runtime_data.data
    wanted = call.data.get(ATTR_GAME_ID)
    if wanted:
        # Any game by id, not just a finished one: a game being played has a
        # summary worth reading too, and the league does not always have a
        # score on the schedule for it yet.
        game = next(
            (row for row in (data.games if data else []) if row.uid == wanted), None
        )
        if game is None:
            raise ServiceValidationError(f"{team.name} has no game with id {wanted}")
    else:
        played = data.results_for(team.key) if data else []
        if not played:
            raise ServiceValidationError(
                f"{team.name} has not played a game yet this season"
            )
        game = played[0]

    recap: dict[str, Any] = {
        "game": _result_dict(game, team),
        "events": [],
        "shots": None,
        "stats": [],
        "standing": None,
    }

    # The federation's sheet is the extra numbers, not the summary: a game it
    # has no page for, or a page that cannot be read, leaves those out only.
    sheet = None
    if game.start <= dt_util.utcnow():
        try:
            sheet = await entry.runtime_data.swehockey.async_sheet(game)
        except HockeyApiError as err:
            _LOGGER.debug("No game sheet for the %s recap: %s", team.name, err)
    recap["period_scores"] = list(sheet.period_scores) if sheet else []
    recap["sheet_url"] = sheet.url if sheet else None

    # A summary without the scorers is still worth having, so a feed that has
    # already forgotten the game must not take the whole answer down with it.
    try:
        live = await entry.runtime_data.client.async_live_game(game)
    except HockeyApiError as err:
        _LOGGER.warning("No play-by-play for the %s recap: %s", team.name, err)
    else:
        # StatNet's feed goes down, and is rate-limited on a busy evening; the
        # game record still knows the goals, which is better than a blank page.
        recap["events"] = _timeline(live.events, team) or _goal_timeline(
            live.goals, team
        )
        recap["stats"] = game_stats(live, game, sheet)
        recap["decided_in"] = live.decided_in or game.decided_in
        if not live.finished:
            # The schedule's score is as old as the last poll; the feed's is
            # the one being played to.
            _apply_live_score(recap["game"], game, team, live)
        # SHL only stamps the crowd on the play-by-play; Hockeyallsvenskan
        # puts it on the schedule, where it stays 0 until a club reports it.
        if live.attendance:
            recap["game"]["attendance"] = live.attendance
        if live.shots:
            is_home = game.home.key == team.key
            shots = live.shots.as_dict()
            shots["ours"] = shots["home"] if is_home else shots["away"]
            shots["theirs"] = shots["away"] if is_home else shots["home"]
            recap["shots"] = shots

    if (row := data.standing_for(team.key)) is not None:
        recap["standing"] = row.as_dict()

    # The clip for this game, if the league has published one. A highlights
    # page that cannot be read is not worth losing the recap over.
    try:
        clips = await entry.runtime_data.client.async_highlights(team)
    except (HockeyApiError, NotImplementedError) as err:
        _LOGGER.debug("No highlights to match against the recap: %s", err)
    else:
        if (clip := _find_clip(clips, game)) is not None:
            recap["highlight"] = clip.as_dict()
    return recap


def _clip_side(side: str, team: Team) -> bool:
    """Return True if half of a clip's heading names this club.

    The league writes a club's name more than one way - "IK Oskarshamn" in the
    schedule, "Oskarshamn" over a clip - so either may sit inside the other.
    A code has to match outright: as a fragment, Västerås's VIK would find
    itself inside Nybro Vikings.
    """
    if not side:
        return False
    name = club_key(team.name)
    if name and (name in side or side in name):
        return True
    return side in {club_key(team.short_name), club_key(team.key)}


def _clip_is_game(clip: Any, game: Game) -> bool:
    """Return True if a clip's heading names both clubs in this game."""
    parts = re.split(r"\bvs\.?\b|[–—-]", str(clip.heading or ""), flags=re.IGNORECASE)
    sides = [club_key(part) for part in parts if club_key(part)]
    if len(sides) < 2:
        return False
    home = [index for index, side in enumerate(sides) if _clip_side(side, game.home)]
    away = [index for index, side in enumerate(sides) if _clip_side(side, game.away)]
    # Each club has to answer to a different half of the heading.
    return any(one != other for one in home for other in away)


def _find_clip(clips: list[Any], game: Game) -> Any | None:
    """Return the highlights clip for one game.

    A clip is headed with the fixture and subtitled with the round - "Mora vs.
    Leksand", "Omgång 2" - which together name exactly one game. Both are
    required: two clubs meet more than once a season.
    """
    wanted_round = str(game.round or "").strip()
    if not wanted_round:
        return None
    for clip in clips:
        if not _clip_is_game(clip, game):
            continue
        if wanted_round in re.findall(r"\d+", str(clip.subheading or "")):
            return clip
    return None


def _fixture_dict(game: Game) -> dict[str, Any]:
    """Return a game as a plain dict, from no particular team's point of view."""
    return {
        "start": game.start.isoformat(),
        "home_team": game.home.name,
        "away_team": game.away.name,
        "home_code": game.home.key,
        "away_code": game.away.key,
        "home_logo": game.home.logo,
        "away_logo": game.away.logo,
        "home_color": game.home.color,
        "away_color": game.away.color,
        "home_score": game.home_score,
        "away_score": game.away_score,
        "state": game.state,
        "decided_in": game.decided_in,
        "venue": game.venue,
        "tv_channels": list(game.tv),
        "round": game.round,
        "game_id": game.uid,
        "url": game.url,
    }


async def _async_get_schedule(call: ServiceCall) -> ServiceResponse:
    """Return the schedule, for one team or for the whole league."""
    entry = _entry(call)
    data = entry.runtime_data.data
    games = list(data.games if data else [])
    if call.data.get(ATTR_TEAM):
        team = _team(entry, call)
        games = [game for game in games if game.involves(team.key)]

    minutes = entry.options.get(CONF_GAME_DURATION, DEFAULT_GAME_DURATION)
    duration = timedelta(minutes=minutes)
    now = dt_util.utcnow()
    # A game being played belongs to what is still to come, not to the results:
    # it counts as upcoming until it is long enough over to have a result.
    first_upcoming = next(
        (
            index
            for index, game in enumerate(games)
            if game.start + duration > now
        ),
        len(games),
    )

    start = max(0, first_upcoming - int(call.data.get(ATTR_BEFORE, 0)))
    chosen, offset = games[start:], start

    limit = int(call.data.get(ATTR_LIMIT, 20))
    listed = chosen[:limit]
    clips = (
        await _async_clips(entry)
        if call.data.get(ATTR_HIGHLIGHTS)
        else {}
    )
    return {
        "games": [
            dict(_fixture_dict(game), highlight=clips.get(game.uid))
            for game in listed
        ],
        # Where the next game sits in what was returned, so a list of a whole
        # season can be opened at the part of it that has yet to happen.
        "next_index": (
            first_upcoming - offset if first_upcoming < len(games) else None
        ),
        "total_upcoming": len(games) - first_upcoming,
    }


async def _async_get_matchup(call: ServiceCall) -> ServiceResponse:
    """Return two clubs before a game: standing, form, records and meetings.

    Everything here is this season's and already in memory; earlier seasons'
    meetings are get_head_to_head's, which has to read them from elsewhere.
    """
    entry = _entry(call)
    data = entry.runtime_data.data
    games = list(data.games if data else [])
    if game_id := call.data.get(ATTR_GAME_ID):
        game = data.game_for(game_id) if data else None
        if game is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="unknown_game",
                translation_placeholders={"game": game_id, "league": entry.title},
            )
    elif call.data.get(ATTR_TEAM) and call.data.get(ATTR_OPPONENT):
        team = _team(entry, call)
        opponent = _team_named(entry, str(call.data[ATTR_OPPONENT]))
        between = meetings(games, team.key, opponent.key)
        minutes = entry.options.get(CONF_GAME_DURATION, DEFAULT_GAME_DURATION)
        now = dt_util.utcnow()
        # The next time they meet; once they have met for the last time this
        # season, the last time.
        game = next(
            (g for g in between if g.start + timedelta(minutes=minutes) > now),
            between[-1] if between else None,
        )
        if game is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="no_meeting",
                translation_placeholders={"team": team.name, "opponent": opponent.name},
            )
    else:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="matchup_needs_game"
        )

    def local_date(moment: Any) -> date:
        return dt_util.as_local(moment).date()

    rows = {
        row["team_code"]: row
        for row in table_rows(data, data.standings, form_games=FORM_GAMES)
    } if data else {}
    sides: dict[str, dict[str, Any]] = {}
    for side, team in (("home", game.home), ("away", game.away)):
        summary = team_summary(
            games, team, game.start, local_date=local_date, form_games=FORM_GAMES
        )
        summary["standing"] = rows.get(team.key)
        sides[side] = summary

    between = meetings(games, game.home.key, game.away.key)
    listed = [
        dict(_fixture_dict(other), this_game=other.uid == game.uid) for other in between
    ]
    earlier = [
        fixture
        for other, fixture in zip(between, listed)
        if other.has_result and other.start < game.start
    ]
    return {
        "game": _fixture_dict(game),
        "home": sides["home"],
        "away": sides["away"],
        "meetings": listed,
        # This season's meetings so far, counted from the home side's view.
        "head_to_head": head_to_head(earlier, game.home.key),
        "table_source": data.standings_source if data else None,
        "season": season_year(),
    }


def _archive(hass: HomeAssistant) -> Archive:
    """Return the federation's archive, shared by every league entry."""
    shared = hass.data.setdefault(DOMAIN, {})
    archive = shared.get("archive")
    if archive is None:
        store: Store[dict[str, Any]] = Store(
            hass, ARCHIVE_STORE_VERSION, f"{DOMAIN}.archive"
        )
        archive = Archive(
            page_reader(async_get_clientsession(hass)),
            store.async_load,
            lambda data: store.async_delay_save(data, 30),
        )
        shared["archive"] = archive
    return archive


async def _async_get_head_to_head(call: ServiceCall) -> ServiceResponse:
    """Return two clubs' meetings in earlier seasons, newest first.

    From the federation's archive, which keeps both leagues: clubs go up and
    down, so the last time two clubs met may have been in the other league.
    This season's meetings are get_matchup's.
    """
    entry = _entry(call)
    team = _team(entry, call)
    opponent = _team_named(entry, str(call.data[ATTR_OPPONENT]))
    try:
        found, searched = await _archive(call.hass).async_meetings(
            team, opponent, int(call.data.get(ATTR_SEASONS, DEFAULT_SEASONS))
        )
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err

    swedish = dt_util.get_time_zone("Europe/Stockholm")
    listed = []
    for game, team_at_home in found:
        home, away = (team, opponent) if team_at_home else (opponent, team)
        start = dt_util.parse_datetime(game.start)
        listed.append(
            {
                "season": f"{game.season}-{str(game.season + 1)[2:]}",
                "league": game.league,
                "series": game.series,
                # The archive writes Swedish local time.
                "start": start.replace(tzinfo=swedish).isoformat() if start else game.start,
                "home_team": home.name,
                "away_team": away.name,
                "home_code": home.key,
                "away_code": away.key,
                "home_logo": home.logo,
                "away_logo": away.logo,
                "home_color": home.color,
                "away_color": away.color,
                "home_score": game.home_score,
                "away_score": game.away_score,
                "decided_in": game.decided_in,
                "venue": game.venue,
                "attendance": game.attendance,
            }
        )
    return {
        "meetings": listed,
        "seasons": searched,
        "head_to_head": head_to_head(listed, team.key),
    }


# Goals, penalties and shootout attempts, in the order they happened.
_TIMELINE_KINDS = ("goal", "penalty", "penalty_shot")

# Hockeyallsvenskan names the periods after the third - "OT", then "SO" or
# "PSO" - where SHL numbers them 4 and 5. Named or numbered, they follow the
# third period in that order: leaving them to sort as equals put the shootout
# first, since every attempt in it is stamped 00:00 and overtime is not.
_PERIOD_RANKS = {"OT": 4, "EXT": 4, "SO": 5, "PSO": 5, "GWS": 5}


def _period_rank(period: Any) -> int:
    """Return where a period comes in a game."""
    text = str(period or "").strip().upper()
    if text.isdigit():
        return int(text)
    return _PERIOD_RANKS.get(text, 99)


def _timeline(events: list[Any], team: Team) -> list[dict[str, Any]]:
    """Return the game as one run of events, oldest first.

    A feed is not required to hand its events over in order - SHL's does not -
    so they are sorted here, on the period and the clock, with the order they
    arrived in breaking any tie.
    """

    def order(pair: tuple[int, Any]) -> tuple[int, int, int]:
        index, event = pair
        return (
            _period_rank(event.period),
            event.seconds if event.seconds is not None else 0,
            index,
        )

    # The attempt that wins a shootout is also filed as a goal, so that the
    # scoreline adds up. In one list that reads as the same thing happening
    # twice, so the goal is left out of the period the shootout was taken in -
    # the attempt itself already says it scored.
    shootout_periods = {
        event.period for event in events if event.kind == "penalty_shot"
    }
    wanted = [
        (index, event)
        for index, event in enumerate(events)
        if event.kind in _TIMELINE_KINDS
        and not (event.kind == "goal" and event.period in shootout_periods)
    ]
    return [
        dict(event.as_dict(), ours=_is_ours(event, team))
        for _, event in sorted(wanted, key=order)
    ]


def _goal_timeline(goals: list[Any], team: Team) -> list[dict[str, Any]]:
    """Return the scoring as timeline entries, for a game with no event log.

    A goal from the game record has no scorer, no clock and no strength, so
    the entries carry what there is: the period, the side and the score it
    made. The card draws them like any other goal.
    """
    return [
        {
            "kind": "goal",
            "period": goal.period,
            "time": goal.time,
            "team_code": goal.team_code,
            "team_name": goal.team_name,
            "player": goal.scorer,
            "detail": goal.note,
            "strength": goal.strength,
            "score": goal.score,
            "assists": list(goal.assists),
            "scored": None,
            "ours": _is_ours(goal, team),
        }
        for goal in goals
    ]


def _apply_live_score(
    row: dict[str, Any], game: Game, team: Team, live: LiveGame
) -> None:
    """Write the score of a game still being played over the scheduled one."""
    score = parse_score(live.goals[-1].score) if live.goals else (0, 0)
    if score is None:
        return
    home, away = score
    is_home = game.home.key == team.key
    ours, theirs = (home, away) if is_home else (away, home)
    row.update(
        {
            "home_score": home,
            "away_score": away,
            "score": f"{home}-{away}",
            "goals_for": ours,
            "goals_against": theirs,
            # Nothing has been won yet, and a half-played game must not be
            # coloured as though it had been.
            "won": None,
            "in_progress": True,
            "period": live.current_period,
            "intermission": live.intermission,
        }
    )


# The play-by-play prints a player as "#14 Oskar Lang"; the stats tables know
# him as "Oskar Lang".
_JERSEY = re.compile(r"^#\s*\d+\s*")


def _player_key(name: Any) -> str:
    """Return a player's name stripped to its letters, for comparing."""
    return re.sub(r"\W+", "", _JERSEY.sub("", str(name or "")).casefold(), flags=re.UNICODE)


def _best(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the most telling of the rows found for one player.

    Goalkeepers are listed among the skaters as well, where they stand at no
    goals from no shots; their own table is the one worth reading.
    """
    if not rows:
        return None
    for row in rows:
        if row.get("role") == "goalkeeper":
            return row
    return rows[0]


def _find_player(roster: list[dict[str, Any]], wanted: str) -> dict[str, Any] | None:
    """Return the player a caller means, by full name or by surname alone."""
    key = _player_key(wanted)
    if not key:
        return None
    if exact := [row for row in roster if _player_key(row.get("player")) == key]:
        return _best(exact)
    # A surname on its own is enough as long as only one player answers to it.
    surname = _player_key(str(wanted).split()[-1]) if str(wanted).split() else ""
    if surname:
        matches = [
            row for row in roster if _player_key(row.get("player")).endswith(surname)
        ]
        if len({_player_key(row.get("player")) for row in matches}) == 1:
            return _best(matches)
    return None


async def _async_get_player(call: ServiceCall) -> ServiceResponse:
    """Return a player's stats for the season so far."""
    entry = _entry(call)
    team = _team(entry, call)
    wanted = str(call.data[ATTR_PLAYER])
    try:
        roster = await entry.runtime_data.client.async_player_stats(team)
    except NotImplementedError as err:
        raise ServiceValidationError(
            f"{entry.title} publishes no player statistics"
        ) from err
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err

    if (found := _find_player(roster, wanted)) is None:
        raise ServiceValidationError(
            f"{team.name} has nobody called {wanted} on record this season"
        )

    # Who he is, alongside what he has done. A profile that cannot be read is
    # not worth losing the statistics over.
    profile: dict[str, Any] | None = None
    try:
        profile = await entry.runtime_data.client.async_player_profile(
            team, str(found.get("player") or wanted)
        )
    except (HockeyApiError, NotImplementedError) as err:
        _LOGGER.debug("No profile for %s: %s", wanted, err)
    if profile and (age := _age(profile.get("birth_date"))) is not None:
        profile["age"] = age

    return {
        "profile": profile,
        "stats_url": entry.runtime_data.client.players_url,
        "player": {
            "name": found.get("player"),
            "team": team.name,
            "team_code": team.key,
            "role": found.get("role"),
            "rank": found.get("rank"),
        },
        "stats": {
            key: value
            for key, value in found.items()
            if key not in ("player", "role", "team", "rank")
        },
        "season": season_year(),
    }


async def _async_get_roster(call: ServiceCall) -> ServiceResponse:
    """Return every player who has turned out for a team this season."""
    entry = _entry(call)
    team = _team(entry, call)
    try:
        roster = await entry.runtime_data.client.async_player_stats(team)
    except NotImplementedError as err:
        raise ServiceValidationError(
            f"{entry.title} publishes no player statistics"
        ) from err
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err

    # Goalkeepers are listed among the skaters as well, at no goals from no
    # shots; their own row is the one worth keeping.
    goalkeepers = {
        _player_key(row.get("player"))
        for row in roster
        if row.get("role") == "goalkeeper"
    }
    players = [
        row
        for row in roster
        if row.get("role") == "goalkeeper"
        or _player_key(row.get("player")) not in goalkeepers
    ]
    # Who each of them is, merged onto what they have done. A roster without
    # pictures is still a roster, so a profile read that fails is let go.
    try:
        squad = await entry.runtime_data.client.async_player_profiles(team)
    except (HockeyApiError, NotImplementedError) as err:
        _LOGGER.debug("No profiles for the %s roster: %s", team.name, err)
        squad = {}
    for row in players:
        if profile := squad.get(_player_key(row.get("player"))):
            row["jersey"] = profile.get("jersey")
            row["photo"] = profile.get("photo")
            row["position"] = profile.get("position")
            row["position_code"] = profile.get("position_code")

    players.sort(
        key=lambda row: (
            row.get("role") == "goalkeeper",
            -int(row.get("TP") or 0),
            -int(row.get("G") or 0),
            str(row.get("player") or ""),
        )
    )
    return {
        "team": team.name,
        "team_code": team.key,
        "season": season_year(),
        "stats_url": entry.runtime_data.client.players_url,
        "players": players,
    }


def _age(birth_date: Any) -> int | None:
    """Return someone's age in years from an ISO birth date."""
    try:
        born = date.fromisoformat(str(birth_date))
    except (TypeError, ValueError):
        return None
    today = dt_util.now().date()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


async def _async_clips(entry: SwedishHockeyConfigEntry) -> dict[str, dict[str, Any]]:
    """Return the league's clips, keyed on the game each one is of.

    One page carries every club's, so they are read once and matched against
    the schedule here rather than a game at a time.
    """
    data = entry.runtime_data.data
    try:
        clips = await entry.runtime_data.client.async_all_clips()
    except (HockeyApiError, NotImplementedError) as err:
        _LOGGER.debug("No highlights to match against the schedule: %s", err)
        return {}

    matched: dict[str, dict[str, Any]] = {}
    for game in data.games if data else []:
        if not game.has_result:
            continue
        if (clip := _find_clip(clips, game)) is not None:
            matched[game.uid] = clip.as_dict()
    return matched


async def _async_get_form_table(call: ServiceCall) -> ServiceResponse:
    """Return the table as it would stand over each club's last few games.

    Worked out from the results rather than read from the league: nobody
    publishes a form table, and the arithmetic is the league's own - three
    points for a win in regulation, two in overtime, one for losing there.
    """
    entry = _entry(call)
    data = entry.runtime_data.data
    if data is None:
        raise ServiceValidationError(f"No schedule read for {entry.title} yet")

    last = int(call.data.get(ATTR_LAST, 5))
    self_key = None
    if call.data.get(ATTR_TEAM):
        self_key = _team(entry, call).key

    standings = standings_from_results(data.games, last=last)
    return {
        "last": last,
        "table": table_rows(data, standings, self_key=self_key, form_games=last),
    }


async def _async_get_live(call: ServiceCall) -> ServiceResponse:
    """Return today's games with the score as it stands.

    Today is the local date - the games already over, the ones being played
    and the ones still to come - and a game still going past midnight with it.
    The scores are read when this is called rather than kept up to date in the
    background: nobody is watching them until someone asks.
    """
    entry = _entry(call)
    data = entry.runtime_data.data
    now = dt_util.utcnow()
    today = dt_util.now().date()
    wanted = call.data.get(ATTR_DATE)
    if wanted is not None and wanted != today:
        # Another day is what the schedule says: the results of a day gone,
        # the fixtures of one to come. Nothing to read from the league.
        games = [
            _fixture_dict(game)
            for game in (data.games if data else [])
            if dt_util.as_local(game.start).date() == wanted
        ]
        return {"date": wanted.isoformat(), "games": games, "live": 0}
    tonight = [
        game
        for game in (data.games if data else [])
        if dt_util.as_local(game.start).date() == today
        or game.start - LIVE_WINDOW_BEFORE <= now <= game.start + LIVE_WINDOW_AFTER
    ]
    if not tonight:
        return {"date": today.isoformat(), "games": [], "live": 0}

    try:
        scores = await entry.runtime_data.client.async_scores(tonight)
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err

    games = []
    for game in tonight:
        row = _fixture_dict(game)
        # A game not yet started has a record with 0-0 on it, which is not a
        # score; it keeps its start time instead.
        if (score := scores.get(game.uid)) is not None and (
            score.started or score.finished
        ):
            row.update(
                {
                    "home_score": score.home_score,
                    "away_score": score.away_score,
                    "period": score.period,
                    "in_progress": score.in_progress,
                    "decided_in": score.decided_in or game.decided_in,
                    "state": "post-game"
                    if score.finished
                    else "ongoing"
                    if score.in_progress
                    else "pre-game",
                }
            )
        games.append(row)
    return {
        "date": today.isoformat(),
        "games": games,
        "live": sum(1 for row in games if row.get("in_progress")),
    }


async def _async_get_statistics(call: ServiceCall) -> ServiceResponse:
    """Return the league's statistics: every skater, goalkeeper and club.

    Read from the league's own statistics tables, a category at a time, and
    kept for a few minutes - the tables only move once a game is over.
    """
    entry = _entry(call)
    last = call.data.get(ATTR_LAST)
    try:
        return await entry.runtime_data.statistics.async_get(
            call.data.get(ATTR_LOCATION, "all"), last
        )
    except NotImplementedError as err:
        raise ServiceValidationError(
            f"{entry.title} publishes no statistics over the last few games"
            if last
            else f"{entry.title} publishes no statistics"
        ) from err
    except HockeyApiError as err:
        raise ServiceValidationError(str(err)) from err
