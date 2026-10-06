"""The files Home Assistant and HACS read rather than run.

hassfest and HACS check these in CI; this catches the same mistakes locally,
in a second, without either installed: a service without a translation, a
translation file that has drifted from strings.json, a manifest out of order.
"""

import json
import os
import re

from _rig import COMP, ROOT, check, done

manifest = json.load(open(os.path.join(COMP, "manifest.json"), encoding="utf-8"))
strings = json.load(open(os.path.join(COMP, "strings.json"), encoding="utf-8"))
en = json.load(open(os.path.join(COMP, "translations", "en.json"), encoding="utf-8"))
sv = json.load(open(os.path.join(COMP, "translations", "sv.json"), encoding="utf-8"))
hacs = json.load(open(os.path.join(ROOT, "hacs.json"), encoding="utf-8"))


def keys(tree, prefix=""):
    out = set()
    if isinstance(tree, dict):
        for key, value in tree.items():
            out |= keys(value, f"{prefix}{key}.")
    else:
        out.add(prefix.rstrip("."))
    return out


# --- manifest ---------------------------------------------------------------
check("the manifest is for swedish_hockey", manifest.get("domain") == "swedish_hockey")
rest = [key for key in manifest if key not in ("domain", "name")]
check(
    "the manifest starts with domain and name, then the rest in order",
    list(manifest)[:2] == ["domain", "name"] and rest == sorted(rest),
    list(manifest),
)
for key in ("codeowners", "documentation", "issue_tracker", "version", "iot_class"):
    check(f"the manifest has {key}", bool(manifest.get(key)))
check(
    "the version is three numbers",
    re.fullmatch(r"\d+\.\d+\.\d+", manifest.get("version", "")) is not None,
)
check("hacs.json names the integration", bool(hacs.get("name")))

# --- translations -----------------------------------------------------------
check("en.json is strings.json, word for word", en == strings)
missing = keys(strings) - keys(sv)
extra = keys(sv) - keys(strings)
check("sv.json translates every string", not missing, sorted(missing)[:10])
check("sv.json has nothing strings.json does not", not extra, sorted(extra)[:10])

# --- services ---------------------------------------------------------------
yaml_text = open(os.path.join(COMP, "services.yaml"), encoding="utf-8").read()
services = re.findall(r"^([a-z_]+):\s*$", yaml_text, flags=re.MULTILINE)
check("services.yaml declares services", len(services) > 5, services)
for service in services:
    check(f"service {service} has a name and description", bool(
        strings.get("services", {}).get(service, {}).get("name")
        and strings["services"][service].get("description")
    ))
    block = re.search(
        rf"^{service}:\s*$(.*?)(?=^[a-z_]+:\s*$|\Z)", yaml_text, flags=re.MULTILINE | re.DOTALL
    ).group(1)
    fields = re.findall(r"^    ([a-z_]+):\s*$", block, flags=re.MULTILINE)
    described = strings["services"][service].get("fields", {})
    undocumented = [field for field in fields if field not in described]
    check(f"every field of {service} is described", not undocumented, undocumented)
stale = set(strings.get("services", {})) - set(services)
check("no strings for services that no longer exist", not stale, stale)

# --- the card the integration serves ---------------------------------------
card = os.path.join(COMP, "www", "hockey-match-card.js")
check("the built card is in www/, which the integration serves", os.path.isfile(card))
head = open(card, encoding="utf-8").read(300) if os.path.isfile(card) else ""
check("it is the build, not a hand-edited file", "GENERATED from frontend/src" in head)
init = open(os.path.join(COMP, "__init__.py"), encoding="utf-8").read()
check("setup serves and registers the card", "await async_setup_card(hass)" in init)
check("http, which serves it, is a dependency", "http" in manifest.get("dependencies", []))
check(
    "lovelace, whose resources it keeps, is set up first where it is used",
    "lovelace" in manifest.get("dependencies", []) + manifest.get("after_dependencies", []),
)
check(
    "the manifest points at the ha-swedish-hockey repository",
    manifest.get("documentation") == "https://github.com/thrawnarn/ha-swedish-hockey"
    and manifest.get("issue_tracker") == "https://github.com/thrawnarn/ha-swedish-hockey/issues",
)

done()
