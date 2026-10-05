"""The Svensk hockey integration - SHL and Hockeyallsvenskan schedules."""

from __future__ import annotations

import logging

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    config_validation as cv,
    device_registry as dr,
    entity_registry as er,
)
from homeassistant.helpers.typing import ConfigType

from .const import CONF_TEAMS, DOMAIN
from .coordinator import (
    LiveScoreCoordinator,
    SwedishHockeyConfigEntry,
    SwedishHockeyCoordinator,
)
from .device import (
    MANUFACTURER,
    league_device_key,
    team_device_key,
)
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.CALENDAR, Platform.SENSOR, Platform.SWITCH]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the integration's services."""
    async_setup_services(hass)
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: SwedishHockeyConfigEntry
) -> bool:
    """Set up a league from a config entry."""
    coordinator = SwedishHockeyCoordinator(hass, entry)

    # Enabling a disabled entity reloads the config entry, so skipping the
    # first fetch here cannot leave a re-enabled calendar without data.
    if _async_every_calendar_disabled(hass, entry):
        _LOGGER.debug(
            "Every calendar for %s is disabled, not fetching a schedule",
            entry.title,
        )
    else:
        await coordinator.async_config_entry_first_refresh()

    for team_key in entry.options.get(CONF_TEAMS, entry.data.get(CONF_TEAMS, [])):
        coordinator.live[team_key] = LiveScoreCoordinator(
            hass, entry, coordinator, team_key
        )

    entry.runtime_data = coordinator
    _async_register_devices(hass, entry, coordinator)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    entry.async_on_unload(coordinator.push.async_stop)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: SwedishHockeyConfigEntry
) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_reload_entry(
    hass: HomeAssistant, entry: SwedishHockeyConfigEntry
) -> None:
    """Reload the entry when the selected teams change."""
    await hass.config_entries.async_reload(entry.entry_id)


@callback
def _async_register_devices(
    hass: HomeAssistant,
    entry: SwedishHockeyConfigEntry,
    coordinator: SwedishHockeyCoordinator,
) -> None:
    """Create the league device and a device per followed team beneath it."""
    registry = dr.async_get(hass)
    league = registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={league_device_key(entry.entry_id)},
        name=coordinator.league_name,
        manufacturer=MANUFACTURER,
        model="Serie",
        entry_type=dr.DeviceEntryType.SERVICE,
    )

    teams = coordinator.data.teams if coordinator.data else {}
    for team_key in entry.options.get(CONF_TEAMS, entry.data.get(CONF_TEAMS, [])):
        team = teams.get(team_key)
        registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={team_device_key(entry.entry_id, team_key)},
            name=team.name if team else team_key,
            manufacturer=MANUFACTURER,
            model=coordinator.league_name,
            via_device_id=league.id,
        )


@callback
def _async_every_calendar_disabled(
    hass: HomeAssistant, entry: SwedishHockeyConfigEntry
) -> bool:
    """Return True once this league's calendars all exist and are disabled."""
    registry_entries = er.async_entries_for_config_entry(
        er.async_get(hass), entry.entry_id
    )
    return bool(registry_entries) and all(
        registry_entry.disabled_by for registry_entry in registry_entries
    )
