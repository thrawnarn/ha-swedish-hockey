"""Next-game sensor for each followed team.

The calendar is the human-facing view; this sensor is the machine-facing one.
It carries the identifiers a league's own live feed needs, so an automation can
poll play-by-play for the game that is actually being played.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .api import Clip, Game, LiveGame, Standing, Team, parse_score
from .const import CONF_GAME_DURATION, CONF_TEAMS, DEFAULT_GAME_DURATION, FORM_GAMES

# How many clips to hang off the sensor as attributes.
MAX_CLIPS = 10
from .device import team_device_info
from .stats import game_stats
from .coordinator import (
    HighlightsCoordinator,
    LeagueData,
    LiveScoreCoordinator,
    SwedishHockeyConfigEntry,
    SwedishHockeyCoordinator,
    live_standings,
    table_rows,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SwedishHockeyConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up a next-game sensor per followed team."""
    coordinator = entry.runtime_data
    team_keys: list[str] = entry.options.get(
        CONF_TEAMS, entry.data.get(CONF_TEAMS, [])
    )
    entities: list[SensorEntity] = []
    for team_key in team_keys:
        entities.append(NextGameSensor(coordinator, team_key))
        entities.append(StandingSensor(coordinator, team_key))
        entities.append(
            HighlightsSensor(coordinator.highlights, entry.entry_id, team_key)
        )
        if (live := coordinator.live.get(team_key)) is None:
            continue
        entities.extend(
            [
                LiveScoreSensor(live, entry.entry_id, team_key),
                LiveTeamScoreSensor(live, entry.entry_id, team_key, home=True),
                LiveTeamScoreSensor(live, entry.entry_id, team_key, home=False),
                LivePeriodSensor(live, entry.entry_id, team_key),
            ]
        )
    async_add_entities(entities)


class NextGameSensor(CoordinatorEntity[SwedishHockeyCoordinator], SensorEntity):
    """When a team next plays, and everything known about that game."""

    # The lists are for a card to draw from, not for the database to keep a
    # copy of every time the game they describe ticks over.
    _unrecorded_attributes = frozenset({"recent_results", "last_result"})
    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_translation_key = "next_game"

    def __init__(
        self, coordinator: SwedishHockeyCoordinator, team_key: str
    ) -> None:
        """Initialise the sensor for a single team."""
        super().__init__(coordinator)
        self._team_key = team_key
        entry = coordinator.config_entry
        self._attr_unique_id = f"{entry.entry_id}_{team_key.lower()}_next_game"
        self._attr_device_info = team_device_info(entry.entry_id, team_key)

    @property
    def available(self) -> bool:
        """Return True while the league still lists this team."""
        return super().available and self._team is not None

    @property
    def native_value(self) -> datetime | None:
        """Return when the game starts."""
        if (game := self._game) is None:
            return None
        return dt_util.as_local(game.start)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the game's details and its live-feed identifiers."""
        if (game := self._game) is None:
            return {}
        is_home = game.home.key == self._team_key
        return {
            # The club code, which is what swedish_hockey's services resolve a
            # team by - the display name varies between payloads.
            "team_code": self._team_key,
            "opponent": (game.away if is_home else game.home).name,
            "home_logo": game.home.logo,
            "away_logo": game.away.logo,
            "is_home": is_home,
            "home_team": game.home.name,
            "away_team": game.away.name,
            # The codes, so a card can act on a side of the fixture without
            # having to recognise a club by whichever name it is printed under.
            "home_code": game.home.key,
            "away_code": game.away.key,
            "venue": game.venue,
            "tv_channels": list(game.tv),
            "round": game.round,
            "game_state": game.state,
            "home_score": game.home_score,
            "away_score": game.away_score,
            "decided_in": game.decided_in,
            "game_id": game.uid,
            "slug": game.slug,
            "stat_net_number": game.stat_net_number,
            "home_ext_id": game.home_ext_id,
            "away_ext_id": game.away_ext_id,
            "url": game.url,
            "recent_results": self._recent_results(),
            # Everything the card needs to show the last result on its own.
            # Sourced from the schedule, so it survives a restart - the live
            # coordinator only holds a game in memory while it is being played.
            "last_result": self._last_result(),
        }

    def _last_result(self) -> dict[str, Any] | None:
        """Return the most recently played game in full."""
        data = self.coordinator.data
        played = data.results_for(self._team_key) if data else []
        if not played:
            return None
        game = played[0]
        is_home = game.home.key == self._team_key
        ours = game.home_score if is_home else game.away_score
        theirs = game.away_score if is_home else game.home_score
        return {
            "start": game.start.isoformat(),
            "ended_at": game.ended_at,
            "home_team": game.home.name,
            "away_team": game.away.name,
            "home_code": game.home.key,
            "away_code": game.away.key,
            "home_logo": game.home.logo,
            "away_logo": game.away.logo,
            "home_score": game.home_score,
            "away_score": game.away_score,
            "score": f"{game.home_score}-{game.away_score}",
            "opponent": (game.away if is_home else game.home).name,
            "is_home": is_home,
            "won": None if ours == theirs else ours > theirs,
            "decided_in": game.decided_in,
            "venue": game.venue,
            "round": game.round,
            "game_id": game.uid,
        }

    def _recent_results(self) -> list[dict[str, Any]]:
        """Return the last five played games, most recent first."""
        data = self.coordinator.data
        if data is None:
            return []
        out = []
        for game in data.results_for(self._team_key)[:5]:
            is_home = game.home.key == self._team_key
            ours = game.home_score if is_home else game.away_score
            theirs = game.away_score if is_home else game.home_score
            out.append(
                {
                    # The id is what a card hands back to swedish_hockey.get_recap
                    # when someone taps the row.
                    "game_id": game.uid,
                    "start": game.start.isoformat(),
                    "opponent": (game.away if is_home else game.home).name,
                    "opponent_code": (game.away if is_home else game.home).key,
                    "is_home": is_home,
                    "score": f"{game.home_score}-{game.away_score}",
                    "won": None if ours == theirs else ours > theirs,
                    "decided_in": game.decided_in,
                    # Both sides in full, so a played game can be drawn the same
                    # way as one still to come.
                    "home_team": game.home.name,
                    "away_team": game.away.name,
                    "home_code": game.home.key,
                    "away_code": game.away.key,
                    "home_logo": game.home.logo,
                    "away_logo": game.away.logo,
                    "home_score": game.home_score,
                    "away_score": game.away_score,
                    "venue": game.venue,
                    "round": game.round,
                }
            )
        return out

    @property
    def _team(self) -> Team | None:
        """Return the team, if the league still knows about it."""
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.teams.get(self._team_key)

    @property
    def _game(self) -> Game | None:
        """Return the game being played now, else the next one up."""
        if self.coordinator.data is None:
            return None
        minutes = self.coordinator.config_entry.options.get(
            CONF_GAME_DURATION, DEFAULT_GAME_DURATION
        )
        duration = timedelta(minutes=minutes)
        now = dt_util.utcnow()
        for game in self.coordinator.data.games_for(self._team_key):
            if game.start + duration > now:
                return game
        return None


def _ahead(score: str | None, is_home: bool | None) -> bool | None:
    """Return True if the followed team is ahead on this scoreline."""
    if is_home is None or (parsed := parse_score(score)) is None:
        return None
    home, away = parsed
    if home == away:
        return None
    return (home > away) if is_home else (away > home)


def _is_ours(goal: Any, team: Team) -> bool:
    """Return True if the followed team scored this goal."""
    code = (goal.team_code or "").casefold()
    name = (goal.team_name or "").casefold()
    known = {team.key.casefold(), team.short_name.casefold()}
    if code and code in known:
        return True
    return bool(name) and (
        name == team.name.casefold() or any(p and p in name for p in known)
    )


class StandingSensor(CoordinatorEntity[SwedishHockeyCoordinator], SensorEntity):
    """Where the team sits in the table."""

    # Two whole tables, and the live one is rewritten every couple of minutes
    # on a game night. The row itself - rank, points, goal difference - is
    # small and worth keeping, so only the tables are held back.
    _unrecorded_attributes = frozenset({"table", "live_table", "live_teams"})
    _attr_has_entity_name = True
    _attr_translation_key = "standing"
    _attr_icon = "mdi:podium"

    def __init__(
        self, coordinator: SwedishHockeyCoordinator, team_key: str
    ) -> None:
        """Initialise the table-position sensor for one team."""
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._team_key = team_key
        self._attr_unique_id = f"{entry_id}_{team_key.lower()}_standing"
        self._attr_device_info = team_device_info(entry_id, team_key)

    async def async_added_to_hass(self) -> None:
        """Redraw when the league-wide scores move, not just the schedule."""
        await super().async_added_to_hass()
        scores = self.coordinator.scores
        self.async_on_remove(scores.async_add_listener(self.async_write_ha_state))
        if scores.enabled:
            # The switch is set up before this entity, so the poll may have
            # been enabled while nothing was listening to schedule it yet.
            await scores.async_request_refresh()

    @property
    def available(self) -> bool:
        """Return True while the table lists this team."""
        return super().available and self._row is not None

    @property
    def native_value(self) -> int | None:
        """Return the team's position."""
        return row.rank if (row := self._row) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the rest of the team's row."""
        if (row := self._row) is None:
            return {}
        # The Hockeyallsvenskan table only carries the short code, so prefer the
        # club name the schedule already gave us.
        data = self.coordinator.data
        team = data.teams.get(self._team_key) if data else None
        return {
            "team": team.name if team else row.team_name,
            "team_code": self._team_key,
            "points": row.points,
            "games_played": row.games_played,
            "wins": row.wins,
            "losses": row.losses,
            "overtime_wins": row.overtime_wins,
            "overtime_losses": row.overtime_losses,
            "goals_for": row.goals_for,
            "goals_against": row.goals_against,
            "goal_difference": row.goal_difference,
            # The whole table, so a card can draw it without another entity.
            "table": self._rows(data.standings if data else []),
            "table_source": data.standings_source if data else None,
            # How many games are being played in the league right now, counted
            # from the poll the live table already runs on. A card can offer a
            # live view on the strength of this without fetching anything.
            "live_games": sum(
                1
                for score in (self.coordinator.scores.data or {}).values()
                if score.in_progress
            ),
            "table_url": self.coordinator.client.table_url,
            **self._live_table(data),
        }

    def _rows(
        self,
        standings: list[Standing],
        playing: set[str] | None = None,
        official: dict[str, int | None] | None = None,
    ) -> list[dict[str, Any]]:
        """Return a table as plain rows for a card to draw."""
        data = self.coordinator.data
        if data is None:
            return []
        return table_rows(
            data,
            standings,
            self_key=self._team_key,
            playing=playing,
            official=official,
            form_games=FORM_GAMES,
        )

    def _live_table(self, data: LeagueData | None) -> dict[str, Any]:
        """Return the table with tonight's games counted in.

        Offered while tonight has games the published table has not picked up
        yet, whether they are being played or were decided an hour ago - with
        nothing outstanding it would be a copy of the official table, and a
        card would have nothing to offer a toggle between.
        """
        scores = self.coordinator.scores.data or {}
        if data is None or not scores:
            return {}
        table, playing, counted = live_standings(data, scores)
        if not table or not counted:
            return {}
        official = {row.team_code: row.rank for row in data.standings}
        return {
            "live_table": self._rows(table, playing=playing, official=official),
            "live_teams": sorted(playing),
            "live_counted": len(counted),
        }

    @property
    def _row(self) -> Any:
        """Return this team's row in the table, if there is one."""
        data = self.coordinator.data
        return data.standing_for(self._team_key) if data else None


class LiveSensor(CoordinatorEntity[LiveScoreCoordinator], SensorEntity):
    """Shared behaviour for the live-scoring sensors."""

    _attr_has_entity_name = True

    def __init__(
        self, live: LiveScoreCoordinator, entry_id: str, team_key: str, key: str
    ) -> None:
        """Initialise a live sensor for one team."""
        super().__init__(live)
        self._team_key = team_key
        self._attr_unique_id = f"{entry_id}_{team_key.lower()}_{key}"
        self._attr_device_info = team_device_info(entry_id, team_key)

    @property
    def _live(self) -> LiveGame | None:
        """Return the live game, with any goal the push stream is ahead on."""
        return self.coordinator.merged


class LiveScoreSensor(LiveSensor):
    """The running score of the game, as a scoreline."""

    _unrecorded_attributes = frozenset({"goals", "events", "stats", "period_scores"})
    _attr_translation_key = "live_score"

    def __init__(self, live: LiveScoreCoordinator, entry_id: str, team_key: str) -> None:
        """Initialise the scoreline sensor."""
        super().__init__(live, entry_id, team_key, "live_score")

    @property
    def native_value(self) -> str | None:
        """Return the scoreline, e.g. "2-1"."""
        return self._live.score if self._live else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the detail behind the scoreline."""
        live = self._live
        if live is None:
            return {
                "live_scoring": self.coordinator.enabled,
                "in_progress": False,
            }
        game = self.coordinator.game
        sheet = self.coordinator.sheet
        last = live.goals[-1] if live.goals else None
        team = self._team
        is_home = (game.home.key == self._team_key) if game else None
        goals = []
        for goal in live.goals:
            entry = goal.as_dict()
            entry["ours"] = bool(team) and _is_ours(goal, team)
            goals.append(entry)
        return {
            "live_scoring": self.coordinator.enabled,
            "in_progress": self.coordinator.is_live and not live.finished,
            "push_connected": self.coordinator.push_connected,
            "finished_at": live.finished_at,
            "game_start": game.start.isoformat() if game else None,
            "home_logo": game.home.logo if game else None,
            "away_logo": game.away.logo if game else None,
            "tv_channels": list(game.tv) if game else [],
            "finished": live.finished,
            "decided_in": live.decided_in,
            "period": live.period,
            "goal_count": len(goals),
            "goals": goals,
            "clock": live.clock,
            "powerplay": live.powerplay.as_dict() if live.powerplay else None,
            "powerplay_team": live.powerplay.team_name if live.powerplay else None,
            "powerplay_advantage": live.powerplay.advantage if live.powerplay else None,
            "intermission": live.intermission,
            "shots": live.shots.as_dict() if live.shots else None,
            "shots_home": live.shots.home if live.shots else None,
            "shots_away": live.shots.away if live.shots else None,
            "events": [event.as_dict() for event in reversed(live.events)],
            # The pairs the card draws as bars, the federation's sheet merged
            # into what the feed counts; and the score of each period, which
            # only the sheet has.
            "stats": game_stats(live, game, sheet) if game else [],
            "period_scores": list(sheet.period_scores) if sheet else [],
            "sheet_url": sheet.url if sheet else None,
            "home_team": game.home.name if game else None,
            "away_team": game.away.name if game else None,
            "home_code": game.home.key if game else None,
            "away_code": game.away.key if game else None,
            "is_home": is_home,
            "we_won": _ahead(live.score, is_home),
            "last_goal_team": last.team_name if last else None,
            "last_goal_team_code": last.team_code if last else None,
            "last_goal_time": last.time if last else None,
            "last_goal_scorer": last.scorer if last else None,
            "last_goal_strength": last.strength if last else None,
            "last_goal_assists": list(last.assists) if last else [],
        }

    @property
    def _team(self) -> Team | None:
        """Return the team this sensor follows."""
        data = self.coordinator.config_entry.runtime_data.data
        return data.teams.get(self._team_key) if data else None


class LiveTeamScoreSensor(LiveSensor):
    """One side's goal count."""

    _attr_native_unit_of_measurement = "mål"
    _attr_state_class = None

    def __init__(
        self, live: LiveScoreCoordinator, entry_id: str, team_key: str, *, home: bool
    ) -> None:
        """Initialise the home or away goal sensor."""
        self._home = home
        key = "home_score" if home else "away_score"
        self._attr_translation_key = key
        super().__init__(live, entry_id, team_key, key)

    @property
    def native_value(self) -> int | None:
        """Return this side's goals."""
        if self._live is None or (score := parse_score(self._live.score)) is None:
            return None
        return score[0] if self._home else score[1]


class LivePeriodSensor(LiveSensor):
    """The period the game is in."""

    _attr_translation_key = "period"

    def __init__(self, live: LiveScoreCoordinator, entry_id: str, team_key: str) -> None:
        """Initialise the period sensor."""
        super().__init__(live, entry_id, team_key, "period")

    @property
    def native_value(self) -> str | None:
        """Return the current period."""
        return self._live.period if self._live else None


class HighlightsSensor(CoordinatorEntity[HighlightsCoordinator], SensorEntity):
    """The latest highlight clip for a team.

    The state is the clip's link: it changes exactly once per new clip, which
    is what an automation waiting to post one triggers on, and it is worth
    reading on its own - unlike the video id behind it, which is kept as an
    attribute.
    """

    _unrecorded_attributes = frozenset({"clips"})
    _attr_has_entity_name = True
    _attr_translation_key = "highlights"
    _attr_icon = "mdi:play-circle"

    def __init__(
        self, highlights: HighlightsCoordinator, entry_id: str, team_key: str
    ) -> None:
        """Initialise the highlights sensor for one team."""
        super().__init__(highlights)
        self._team_key = team_key
        self._attr_unique_id = f"{entry_id}_{team_key.lower()}_highlights"
        self._attr_device_info = team_device_info(entry_id, team_key)

    async def async_added_to_hass(self) -> None:
        """Fetch a first set of clips rather than wait out the interval.

        The coordinator only starts its timer once something is listening, and
        its interval is hours long - without this the sensor would sit unknown
        for most of a day after a restart.
        """
        await super().async_added_to_hass()
        if not self.coordinator.data:
            await self.coordinator.async_request_refresh()

    @property
    def native_value(self) -> str | None:
        """Return the link to the newest clip."""
        return clip.url if (clip := self._latest) else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the clip itself, and the ones behind it."""
        clips = self._clips
        if not clips:
            return {"clip_count": 0, "clips": []}
        latest = clips[0]
        return {
            "heading": latest.heading,
            "subheading": latest.subheading,
            "url": latest.url,
            "thumbnail": latest.thumbnail,
            "video_id": latest.video_id,
            "clip_count": len(clips),
            # Enough to offer a short list without turning the state machine
            # into a video archive.
            "clips": [clip.as_dict() for clip in clips[:MAX_CLIPS]],
        }

    @property
    def _clips(self) -> list[Clip]:
        """Return this team's clips, newest first."""
        return (self.coordinator.data or {}).get(self._team_key) or []

    @property
    def _latest(self) -> Clip | None:
        """Return the newest clip, if there is one."""
        return self._clips[0] if self._clips else None
