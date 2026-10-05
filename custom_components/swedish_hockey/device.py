"""Device identities for the Svensk hockey integration.

Each league is a device, and each followed team is a device under it, so a
team's calendar and sensor sit together and the league keeps the entities that
belong to the whole series.
"""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo

from .const import DOMAIN

MANUFACTURER = "Svensk hockey"


def league_device_key(entry_id: str) -> tuple[str, str]:
    """Return the identifier of a league's device."""
    return (DOMAIN, entry_id)


def team_device_key(entry_id: str, team_key: str) -> tuple[str, str]:
    """Return the identifier of a team's device."""
    return (DOMAIN, f"{entry_id}_{team_key.lower()}")


def league_device_info(entry_id: str, league_name: str) -> DeviceInfo:
    """Return the device for a whole series."""
    return DeviceInfo(
        identifiers={league_device_key(entry_id)},
        name=league_name,
        manufacturer=MANUFACTURER,
        model="Serie",
        entry_type=DeviceEntryType.SERVICE,
    )


def team_device_info(entry_id: str, team_key: str) -> DeviceInfo:
    """Return the device for one team.

    Only the identifiers are given: the device itself is created up front in
    async_setup_entry, so the team is linked to its league even when some of
    its entities are disabled.
    """
    return DeviceInfo(identifiers={team_device_key(entry_id, team_key)})
