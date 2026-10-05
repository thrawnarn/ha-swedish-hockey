"""Calendar entities for Swedish hockey games.

Each followed team gets its own calendar. A league-wide calendar with every
game in the series is also offered, but disabled by default - enable it from
the entity settings if you want the whole schedule in one place.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .api import Game, Team
from .const import (
    CONF_GAME_DURATION,
    CONF_TEAMS,
    DEFAULT_GAME_DURATION,
    STATE_ONGOING,
    STATE_POST_GAME,
)
from .device import league_device_info, team_device_info
from .coordinator import SwedishHockeyConfigEntry, SwedishHockeyCoordinator

# An en dash reads better than a hyphen between two team names.
_VS = "–"

_STATE_LABELS = {
    STATE_ONGOING: "Pågår",
    STATE_POST_GAME: "Spelad",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SwedishHockeyConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up a calendar per followed team, plus the league-wide one."""
    coordinator = entry.runtime_data
    team_keys: list[str] = entry.options.get(
        CONF_TEAMS, entry.data.get(CONF_TEAMS, [])
    )
    entities: list[HockeyCalendar] = [
        HockeyTeamCalendar(coordinator, team_key) for team_key in team_keys
    ]
    entities.append(HockeyLeagueCalendar(coordinator))
    async_add_entities(entities)


class HockeyCalendar(CoordinatorEntity[SwedishHockeyCoordinator], CalendarEntity):
    """Shared behaviour for the team and league calendars."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: SwedishHockeyCoordinator) -> None:
        """Initialise the calendar."""
        super().__init__(coordinator)

    @property
    def event(self) -> CalendarEvent | None:
        """Return the game in progress, or the next one coming up."""
        now = dt_util.now()
        for game in self._games:
            event = self._to_event(game)
            if event.end > now:
                return event
        return None

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Return every game that overlaps the requested window."""
        events = [self._to_event(game) for game in self._games]
        return [
            event
            for event in events
            if event.end > start_date and event.start < end_date
        ]

    @property
    def _games(self) -> list[Game]:
        """Return the games on this calendar, in chronological order."""
        raise NotImplementedError

    @property
    def _duration(self) -> timedelta:
        """Return how long a game is assumed to last."""
        minutes = self.coordinator.config_entry.options.get(
            CONF_GAME_DURATION, DEFAULT_GAME_DURATION
        )
        return timedelta(minutes=minutes)

    def _to_event(self, game: Game) -> CalendarEvent:
        """Render a game as a calendar event."""
        start = dt_util.as_local(game.start)
        return CalendarEvent(
            start=start,
            end=start + self._duration,
            summary=_summary(game),
            description=_description(game, self.coordinator.league_name),
            location=game.venue,
            uid=f"{self.coordinator.league}-{game.uid}",
        )


class HockeyTeamCalendar(HockeyCalendar):
    """All games for one followed team."""

    _attr_translation_key = "games"

    def __init__(
        self, coordinator: SwedishHockeyCoordinator, team_key: str
    ) -> None:
        """Initialise the calendar for a single team."""
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._team_key = team_key
        self._attr_unique_id = f"{entry_id}_{team_key.lower()}"
        self._attr_device_info = team_device_info(entry_id, team_key)
        self._apply_team()

    @property
    def available(self) -> bool:
        """Return True while the league still lists this team."""
        return super().available and self._team is not None

    def _handle_coordinator_update(self) -> None:
        """Pick up a renamed team or a refreshed schedule."""
        self._apply_team()
        super()._handle_coordinator_update()

    def _apply_team(self) -> None:
        """Keep the club badge on the entity; the device carries the name."""
        if team := self._team:
            self._attr_entity_picture = team.logo

    @property
    def _team(self) -> Team | None:
        """Return the team, if the league still knows about it."""
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.teams.get(self._team_key)

    @property
    def _games(self) -> list[Game]:
        """Return this team's games, in chronological order."""
        if self.coordinator.data is None:
            return []
        return self.coordinator.data.games_for(self._team_key)


class HockeyLeagueCalendar(HockeyCalendar):
    """Every game in the league.

    Disabled by default - it is a lot of events, and while it stays disabled it
    registers no listener with the coordinator, so it costs nothing and never
    causes a fetch.
    """

    _attr_entity_registry_enabled_default = False
    _attr_translation_key = "all_games"

    def __init__(self, coordinator: SwedishHockeyCoordinator) -> None:
        """Initialise the league-wide calendar."""
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_all_games"
        self._attr_device_info = league_device_info(
            entry_id, coordinator.league_name
        )

    @property
    def _games(self) -> list[Game]:
        """Return the whole season, in chronological order."""
        if self.coordinator.data is None:
            return []
        return self.coordinator.data.games


def _summary(game: Game) -> str:
    """Return "Home - Away", with the result once it is known."""
    if game.has_result:
        return (
            f"{game.home.name} {game.home_score}{_VS}{game.away_score} "
            f"{game.away.name}"
        )
    return f"{game.home.name} {_VS} {game.away.name}"


def _description(game: Game, league_name: str) -> str:
    """Return a few lines of detail about the game."""
    lines = [league_name]
    if game.round:
        lines.append(f"Omgång {game.round}")
    if game.venue:
        lines.append(f"Arena: {game.venue}")
    if game.has_result:
        result = f"Resultat: {game.home_score}{_VS}{game.away_score}"
        if game.decided_in:
            result = f"{result} ({game.decided_in})"
        lines.append(result)
    if label := _STATE_LABELS.get(game.state):
        lines.append(label)
    if game.url:
        lines.append(game.url)
    return "\n".join(lines)
