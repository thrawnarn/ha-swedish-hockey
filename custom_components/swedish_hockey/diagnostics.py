"""Diagnostics for the Svensk hockey integration.

Both leagues are public, unauthenticated sources, so there are no credentials
to redact here - what matters when something misbehaves is what was last read
and when each coordinator intends to poll again.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .api import Game, Standing
from .const import CONF_LEAGUE, CONF_TEAMS
from .coordinator import SwedishHockeyConfigEntry


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: SwedishHockeyConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a league."""
    coordinator = entry.runtime_data
    data = coordinator.data

    return {
        "entry": {
            "league": entry.data.get(CONF_LEAGUE),
            "teams": entry.options.get(CONF_TEAMS, entry.data.get(CONF_TEAMS, [])),
            "options": dict(entry.options),
        },
        "schedule": {
            "last_update_success": coordinator.last_update_success,
            "update_interval": str(coordinator.update_interval),
            "team_count": len(data.teams) if data else 0,
            "game_count": len(data.games) if data else 0,
            "standings_rows": len(data.standings) if data else 0,
            "teams": sorted(data.teams) if data else [],
            "first_game": _game(data.games[0]) if data and data.games else None,
            "last_game": _game(data.games[-1]) if data and data.games else None,
            "standings": [_standing(row) for row in data.standings] if data else [],
        },
        "live": {
            team_key: {
                "enabled": live.enabled,
                "last_update_success": live.last_update_success,
                "update_interval": str(live.update_interval),
                "game": _game(live.game) if live.game else None,
                "finished": live.data.finished if live.data else None,
                "score": live.data.score if live.data else None,
                "goal_count": len(live.data.goals) if live.data else 0,
                "goals": [goal.as_dict() for goal in live.data.goals]
                if live.data
                else [],
            }
            for team_key, live in coordinator.live.items()
        },
    }


def _game(game: Game) -> dict[str, Any]:
    """Return a game in a form that is useful in a bug report."""
    return {
        "uid": game.uid,
        "start": game.start.isoformat(),
        "home": game.home.key,
        "away": game.away.key,
        "venue": game.venue,
        "round": game.round,
        "state": game.state,
        "score": [game.home_score, game.away_score],
        "slug": game.slug,
        "stat_net_number": game.stat_net_number,
        "home_ext_id": game.home_ext_id,
        "away_ext_id": game.away_ext_id,
    }


def _standing(row: Standing) -> dict[str, Any]:
    """Return one table row."""
    return row.as_dict()
