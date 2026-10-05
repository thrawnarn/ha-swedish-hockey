"""A switch per followed team, turning live scoring on and off."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import STATE_ON, EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import CONF_TEAMS
from .coordinator import LiveScoreCoordinator, SwedishHockeyConfigEntry
from .device import team_device_info


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SwedishHockeyConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up a live-scoring switch per followed team."""
    coordinator = entry.runtime_data
    team_keys: list[str] = entry.options.get(
        CONF_TEAMS, entry.data.get(CONF_TEAMS, [])
    )
    async_add_entities(
        LiveScoringSwitch(coordinator.live[team_key], entry.entry_id, team_key)
        for team_key in team_keys
        if team_key in coordinator.live
    )


class LiveScoringSwitch(SwitchEntity, RestoreEntity):
    """Whether to follow this team's game live."""

    _attr_has_entity_name = True
    _attr_translation_key = "live_scoring"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(
        self, live: LiveScoreCoordinator, entry_id: str, team_key: str
    ) -> None:
        """Initialise the switch for one team."""
        self._live = live
        self._attr_unique_id = f"{entry_id}_{team_key.lower()}_live_scoring"
        self._attr_device_info = team_device_info(entry_id, team_key)
        self._attr_is_on = True

    async def async_added_to_hass(self) -> None:
        """Restore the previous setting and apply it."""
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = last.state == STATE_ON
        self._live.async_set_enabled(bool(self._attr_is_on))

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Start following the game."""
        self._async_apply(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Stop following the game."""
        self._async_apply(False)

    def _async_apply(self, enabled: bool) -> None:
        """Set the switch and tell the coordinator."""
        self._attr_is_on = enabled
        self._live.async_set_enabled(enabled)
        self.async_write_ha_state()
