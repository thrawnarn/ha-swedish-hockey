"""The Lovelace card: served by the integration, and kept on the dashboards.

The card and badge are built into this integration's www/ folder, so they
travel with it - installing or updating the integration installs or updates
the card. Serving them is one static path. Getting a dashboard to load them
takes a resource, and asking every user to add one by hand (and bump its
version after every update, or keep a stale copy cached) is the part people
get wrong, so the integration keeps that resource itself:

* one resource for the card, `/swedish_hockey/frontend/hockey-match-card.js`;
* versioned by the built file's content, so a new card is a new URL and no
  browser goes on running the old one;
* any other resource loading a `hockey-match-card.js` - a copy added by hand
  from /config/www before the integration served its own - is turned into
  this one, since two copies of the same elements cannot both load;
* removed again when the last of the integration's entries is.

Only dashboards in storage mode (the default) have resources the integration
can change. In YAML mode the resource is the user's to add, and the log says
which URL.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.start import async_at_started

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CARD_FILE = "hockey-match-card.js"
URL_BASE = f"/{DOMAIN}/frontend"
CARD_URL = f"{URL_BASE}/{CARD_FILE}"
WWW = Path(__file__).parent / "www"

RESOURCE_TYPE = "module"


async def async_setup_card(hass: HomeAssistant) -> None:
    """Serve www/, and once Home Assistant is up, keep the resource on it."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                URL_BASE,
                str(WWW),
                # The card is rebuilt in place during development; a cached
                # copy of yesterday's card is a confusing thing to debug. The
                # resource's ?v= is what browsers cache by.
                False,
            )
        ]
    )
    version = await hass.async_add_executor_job(card_version, WWW / CARD_FILE)
    url = f"{CARD_URL}?v={version}"

    async def _register(hass: HomeAssistant) -> None:
        await async_register_resource(hass, url)

    # Dashboards load their resources once Home Assistant has started; by then
    # Lovelace has set up its resource collection, whatever order the
    # integrations came up in.
    async_at_started(hass, _register)


def card_version(path: Path) -> str:
    """Return a short fingerprint of the built card, for its URL."""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    except OSError:
        _LOGGER.warning("The card is missing from %s; was it built?", path)
        return "0"


def _resource_collection(hass: HomeAssistant) -> Any | None:
    """Return Lovelace's resource collection, if the integration may change it."""
    try:
        from homeassistant.components.lovelace.const import LOVELACE_DATA
    except ImportError:  # pragma: no cover - Lovelace is always there
        return None
    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        return None
    # Called resource_mode since 2026.2, and mode before.
    mode = getattr(lovelace, "resource_mode", getattr(lovelace, "mode", None))
    if mode != "storage":
        _LOGGER.info(
            "Dashboards are in YAML mode, so add the hockey card yourself: "
            "resource %s, type module",
            CARD_URL,
        )
        return None
    return lovelace.resources


async def _async_loaded(resources: Any) -> None:
    """Make sure the collection holds what is stored before changing it.

    Lovelace reads its resources the first time a dashboard asks for them.
    Writing to the collection before that would save an empty list with one
    item in it over everything the user had.
    """
    if getattr(resources, "loaded", True):
        return
    await resources.async_load()
    resources.loaded = True


async def async_register_resource(hass: HomeAssistant, url: str) -> None:
    """Keep exactly one resource for the card, at this URL."""
    resources = _resource_collection(hass)
    if resources is None:
        return
    try:
        await _async_loaded(resources)
        await async_sync_resources(resources, url)
    except Exception:  # noqa: BLE001 - a resource is never worth failing setup
        _LOGGER.warning(
            "Could not add the hockey card as a dashboard resource; add %s "
            "(type module) under Settings > Dashboards > Resources",
            url,
            exc_info=True,
        )


def _path(url: str) -> str:
    return str(url).split("?", 1)[0]


def _is_card(item: dict[str, Any]) -> bool:
    return _path(item.get("url", "")).endswith(f"/{CARD_FILE}")


async def async_sync_resources(resources: Any, url: str) -> str:
    """Bring the collection to one card resource at `url`; say what was done.

    Returns "created", "updated", "current" or, with duplicates removed as
    well, that word followed by "+removed".
    """
    cards = [item for item in resources.async_items() if _is_card(item)]
    if not cards:
        await resources.async_create_item({"res_type": RESOURCE_TYPE, "url": url})
        _LOGGER.info("Added the hockey card to the dashboards' resources: %s", url)
        return "created"

    # Ours first, if it is there; any other copy of the card becomes ours.
    cards.sort(key=lambda item: _path(item["url"]) != CARD_URL)
    keep, extra = cards[0], cards[1:]
    for item in extra:
        await resources.async_delete_item(item["id"])
        _LOGGER.info(
            "Removed a second resource for the hockey card, %s: the integration "
            "serves the card itself",
            item["url"],
        )

    if keep.get("url") == url and keep.get("type", RESOURCE_TYPE) == RESOURCE_TYPE:
        done = "current"
    else:
        await resources.async_update_item(
            keep["id"], {"res_type": RESOURCE_TYPE, "url": url}
        )
        _LOGGER.info("Pointed the hockey card's resource at %s (was %s)", url, keep.get("url"))
        done = "updated"
    return f"{done}+removed" if extra else done


async def async_unregister_resource(hass: HomeAssistant) -> None:
    """Take the card's resource away, with the last of the integration."""
    resources = _resource_collection(hass)
    if resources is None:
        return
    try:
        await _async_loaded(resources)
        for item in list(resources.async_items()):
            if _path(item.get("url", "")) == CARD_URL:
                await resources.async_delete_item(item["id"])
                _LOGGER.info("Removed the hockey card from the dashboards' resources")
    except Exception:  # noqa: BLE001
        _LOGGER.warning("Could not remove the hockey card's resource", exc_info=True)
