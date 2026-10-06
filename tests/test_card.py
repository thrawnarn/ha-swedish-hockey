"""Keeping the card on the dashboards.

The integration owns one Lovelace resource: the card it serves, at a URL that
changes with the card. These pin down what it does to a user's resources -
add one, move a stale one forward, take over a hand-added copy of the card,
leave everything else alone - and that it never writes over resources it has
not read yet.
"""

import asyncio
import logging
import os
import sys
import tempfile
import types
from pathlib import Path

from _rig import check, done, load


def _mod(name, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


class StaticPathConfig:
    def __init__(self, url_path, path, cache_headers=True):
        self.url_path, self.path, self.cache_headers = url_path, path, cache_headers


STARTED = []
_mod("homeassistant.components")
_mod("homeassistant.components.http", StaticPathConfig=StaticPathConfig)
_mod("homeassistant.components.lovelace")
_mod("homeassistant.components.lovelace.const", LOVELACE_DATA="lovelace")
_mod("homeassistant.core", HomeAssistant=object, callback=lambda f: f)
_mod("homeassistant.helpers")
_mod("homeassistant.helpers.start", async_at_started=lambda hass, job: STARTED.append(job))

card = load("card")
run = asyncio.run
# The failures below are meant to be logged; the log is not the test's output.
logging.disable(logging.CRITICAL)


class Resources:
    """Lovelace's resource collection, as much of it as the card touches."""

    def __init__(self, stored, loaded=True):
        self.stored = [dict(item) for item in stored]
        self.items = {item["id"]: dict(item) for item in stored} if loaded else {}
        self.loaded = loaded
        self.writes = []
        self._next = 100

    async def async_load(self):
        self.items = {item["id"]: dict(item) for item in self.stored}

    def async_items(self):
        return list(self.items.values())

    async def async_create_item(self, data):
        assert set(data) == {"res_type", "url"}, data
        self._next += 1
        item = {"id": str(self._next), "type": data["res_type"], "url": data["url"]}
        self.items[item["id"]] = item
        self.writes.append(("create", item["url"]))

    async def async_update_item(self, item_id, updates):
        item = self.items[item_id]
        if "res_type" in updates:
            item["type"] = updates["res_type"]
        if "url" in updates:
            item["url"] = updates["url"]
        self.writes.append(("update", item_id, item["url"]))

    async def async_delete_item(self, item_id):
        del self.items[item_id]
        self.writes.append(("delete", item_id))


class Lovelace:
    def __init__(self, resources, mode="storage"):
        self.resources = resources
        self.resource_mode = mode


class Http:
    def __init__(self):
        self.paths = []

    async def async_register_static_paths(self, configs):
        self.paths.extend(configs)


class Hass:
    def __init__(self, resources=None, mode="storage"):
        self.data = {"lovelace": Lovelace(resources, mode)} if resources is not None else {}
        self.http = Http()

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


URL = "/swedish_hockey/frontend/hockey-match-card.js?v=abc"
OTHER = {"id": "1", "type": "module", "url": "/hacsfiles/mushroom/mushroom.js?hacstag=1"}


def urls(resources):
    return sorted(item["url"] for item in resources.async_items())


# --- adding, updating, keeping -------------------------------------------------
r = Resources([OTHER])
check("with no card resource, one is added", run(card.async_sync_resources(r, URL)) == "created")
check("... at the card's URL, as a module", urls(r) == sorted([OTHER["url"], URL]))
check("... and the other resources are left alone", r.items["1"] == OTHER)

r = Resources([OTHER, {"id": "7", "type": "module", "url": "/swedish_hockey/frontend/hockey-match-card.js?v=old"}])
check("a resource for an older build is moved to the new one", run(card.async_sync_resources(r, URL)) == "updated")
check("... in place, keeping its id", r.items["7"]["url"] == URL and r.writes == [("update", "7", URL)])

r = Resources([OTHER, {"id": "7", "type": "module", "url": URL}])
check("a resource already at this build is left as it is", run(card.async_sync_resources(r, URL)) == "current")
check("... with nothing written", r.writes == [])

r = Resources([{"id": "7", "type": "js", "url": URL}])
check("a resource of the wrong type is put right", run(card.async_sync_resources(r, URL)) == "updated")
check("... as a module", r.items["7"]["type"] == "module")

# --- copies of the card added by hand -----------------------------------------
r = Resources([OTHER, {"id": "5", "type": "module", "url": "/local/hockey-match-card/hockey-match-card.js?v=91"}])
check("a copy of the card added by hand becomes the integration's", run(card.async_sync_resources(r, URL)) == "updated")
check("... the same resource, now loading the served card", r.items["5"]["url"] == URL and len(r.items) == 2)

r = Resources([
    {"id": "5", "type": "module", "url": "/local/hockey-match-card/hockey-match-card.js?v=91"},
    {"id": "7", "type": "module", "url": "/swedish_hockey/frontend/hockey-match-card.js?v=old"},
    OTHER,
])
check("with both, the hand-added copy goes and the integration's is updated",
      run(card.async_sync_resources(r, URL)) == "updated+removed")
check("... leaving one card resource, the integration's", urls(r) == sorted([OTHER["url"], URL]) and "7" in r.items)

r = Resources([
    {"id": "5", "type": "module", "url": "/local/a/hockey-match-card.js"},
    {"id": "6", "type": "module", "url": "/local/b/hockey-match-card.js"},
])
run(card.async_sync_resources(r, URL))
check("two hand-added copies become one", urls(r) == [URL])

r = Resources([{"id": "5", "type": "module", "url": "/local/not-hockey-match-card.js"}])
run(card.async_sync_resources(r, URL))
check("a file merely ending in the same name is not the card", "5" in r.items and len(r.items) == 2)

# --- through Home Assistant -----------------------------------------------------
r = Resources([OTHER, {"id": "7", "type": "module", "url": "/swedish_hockey/frontend/hockey-match-card.js?v=old"}], loaded=False)
run(card.async_register_resource(Hass(r), URL))
check("resources not read yet are read before anything is written", r.loaded is True)
check("... so the user's other resources survive", urls(r) == sorted([OTHER["url"], URL]))

r = Resources([OTHER])
run(card.async_register_resource(Hass(r, mode="yaml"), URL))
check("dashboards in YAML mode are not touched", r.writes == [] and urls(r) == [OTHER["url"]])

run(card.async_register_resource(Hass(), URL))
check("without Lovelace there is nothing to do, and no error", True)


class Broken(Resources):
    def async_items(self):
        raise RuntimeError("the collection changed under us")


try:
    run(card.async_register_resource(Hass(Broken([])), URL))
    check("a failing collection is logged, never raised into setup", True)
except Exception as err:  # noqa: BLE001
    check("a failing collection is logged, never raised into setup", False, err)

r = Resources([OTHER, {"id": "7", "type": "module", "url": URL}, {"id": "8", "type": "module", "url": "/local/x/hockey-match-card.js"}])
run(card.async_unregister_resource(Hass(r)))
check("removing the integration removes its own resource only", sorted(r.items) == ["1", "8"])

# --- the URL follows the build ------------------------------------------------
with tempfile.TemporaryDirectory() as folder:
    built = Path(folder) / "hockey-match-card.js"
    built.write_text("one build")
    first = card.card_version(built)
    check("the version is a short fingerprint", len(first) == 10)
    check("the same build gives the same version", card.card_version(built) == first)
    built.write_text("another build")
    check("a new build gives a new version", card.card_version(built) != first)
    check("a missing build still gives a version", card.card_version(Path(folder) / "gone.js") == "0")

hass = Hass(Resources([]))
STARTED.clear()
run(card.async_setup_card(hass))
served = hass.http.paths[0]
check("setup serves www/ at /swedish_hockey/frontend", served.url_path == "/swedish_hockey/frontend"
      and served.path.endswith(os.path.join("swedish_hockey", "www")))
check("... without cache headers", served.cache_headers is False)
check("... and registers the resource once Home Assistant has started", len(STARTED) == 1)
run(STARTED[0](hass))
built = card.WWW / "hockey-match-card.js"
check("... at the served card's own version",
      urls(hass.data["lovelace"].resources) == [f"{card.CARD_URL}?v={card.card_version(built)}"])

done()
