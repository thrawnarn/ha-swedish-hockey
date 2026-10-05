"""Config flow for the Svensk hockey integration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .api import HockeyApiError, Team, create_client
from .const import (
    CONF_GAME_DURATION,
    CONF_LIVE_INTERVAL,
    CONF_LEAGUE,
    CONF_TEAMS,
    DEFAULT_GAME_DURATION,
    DEFAULT_LIVE_INTERVAL,
    DOMAIN,
    LEAGUE_NAMES,
    MAX_GAME_DURATION,
    MAX_LIVE_INTERVAL,
    MIN_GAME_DURATION,
    MIN_LIVE_INTERVAL,
)
from .coordinator import SwedishHockeyConfigEntry


class SwedishHockeyConfigFlow(ConfigFlow, domain=DOMAIN):
    """Pick a league, then the teams to build calendars for."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialise the flow."""
        self._league: str | None = None
        self._teams: dict[str, Team] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Let the user choose a league."""
        if user_input is not None:
            self._league = user_input[CONF_LEAGUE]
            await self.async_set_unique_id(self._league)
            self._abort_if_unique_id_configured()
            return await self.async_step_teams()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_LEAGUE): SelectSelector(
                        SelectSelectorConfig(
                            options=[
                                SelectOptionDict(value=league, label=name)
                                for league, name in LEAGUE_NAMES.items()
                            ],
                            mode=SelectSelectorMode.LIST,
                        )
                    )
                }
            ),
        )

    async def async_step_teams(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Let the user choose one or more teams in that league."""
        assert self._league is not None
        errors: dict[str, str] = {}

        if not self._teams:
            try:
                self._teams = await _async_fetch_teams(self.hass, self._league)
            except HockeyApiError:
                return self.async_abort(reason="cannot_connect")

        if user_input is not None:
            if teams := user_input[CONF_TEAMS]:
                return self.async_create_entry(
                    title=LEAGUE_NAMES.get(self._league, self._league),
                    data={CONF_LEAGUE: self._league, CONF_TEAMS: teams},
                )
            errors[CONF_TEAMS] = "no_teams"

        return self.async_show_form(
            step_id="teams",
            data_schema=vol.Schema(
                {vol.Required(CONF_TEAMS, default=[]): _team_selector(self._teams)}
            ),
            description_placeholders={
                "league": LEAGUE_NAMES.get(self._league, self._league)
            },
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: SwedishHockeyConfigEntry,
    ) -> SwedishHockeyOptionsFlow:
        """Return the options flow."""
        return SwedishHockeyOptionsFlow()


class SwedishHockeyOptionsFlow(OptionsFlow):
    """Change the selected teams or the assumed game length."""

    config_entry: SwedishHockeyConfigEntry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Manage the options."""
        entry = self.config_entry
        league: str = entry.data[CONF_LEAGUE]
        errors: dict[str, str] = {}

        coordinator = getattr(entry, "runtime_data", None)
        if coordinator is not None and coordinator.data is not None:
            teams = coordinator.data.teams
        else:
            try:
                teams = await _async_fetch_teams(self.hass, league)
            except HockeyApiError:
                return self.async_abort(reason="cannot_connect")

        current: list[str] = entry.options.get(
            CONF_TEAMS, entry.data.get(CONF_TEAMS, [])
        )
        duration = entry.options.get(CONF_GAME_DURATION, DEFAULT_GAME_DURATION)
        live_interval = entry.options.get(CONF_LIVE_INTERVAL, DEFAULT_LIVE_INTERVAL)

        if user_input is not None:
            if user_input[CONF_TEAMS]:
                return self.async_create_entry(
                    data={
                        CONF_TEAMS: user_input[CONF_TEAMS],
                        CONF_GAME_DURATION: int(user_input[CONF_GAME_DURATION]),
                        CONF_LIVE_INTERVAL: int(user_input[CONF_LIVE_INTERVAL]),
                    }
                )
            errors[CONF_TEAMS] = "no_teams"
            current = user_input[CONF_TEAMS]
            duration = user_input[CONF_GAME_DURATION]
            live_interval = user_input[CONF_LIVE_INTERVAL]

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TEAMS, default=current): _team_selector(
                        teams, current
                    ),
                    vol.Required(
                        CONF_GAME_DURATION, default=duration
                    ): NumberSelector(
                        NumberSelectorConfig(
                            min=MIN_GAME_DURATION,
                            max=MAX_GAME_DURATION,
                            step=5,
                            mode=NumberSelectorMode.BOX,
                            unit_of_measurement="min",
                        )
                    ),
                    vol.Required(
                        CONF_LIVE_INTERVAL, default=live_interval
                    ): NumberSelector(
                        NumberSelectorConfig(
                            min=MIN_LIVE_INTERVAL,
                            max=MAX_LIVE_INTERVAL,
                            step=5,
                            mode=NumberSelectorMode.BOX,
                            unit_of_measurement="s",
                        )
                    ),
                }
            ),
            errors=errors,
        )


async def _async_fetch_teams(hass, league: str) -> dict[str, Team]:
    """Return the teams currently playing in a league."""
    client = create_client(league, async_get_clientsession(hass))
    teams, _ = await client.async_fetch()
    return teams


def _team_selector(
    teams: dict[str, Team], keep: list[str] | None = None
) -> SelectSelector:
    """Build a multi-select of the league's teams."""
    options = [
        SelectOptionDict(value=team.key, label=team.name)
        for team in sorted(teams.values(), key=lambda team: team.name)
    ]
    # A team that has left the league must stay selectable, or saving the form
    # would silently drop its calendar.
    known = {team.key for team in teams.values()}
    options.extend(
        SelectOptionDict(value=key, label=key)
        for key in keep or []
        if key not in known
    )
    return SelectSelector(
        SelectSelectorConfig(
            options=options,
            multiple=True,
            sort=False,
            mode=SelectSelectorMode.DROPDOWN,
        )
    )
