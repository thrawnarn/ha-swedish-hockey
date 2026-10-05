"""Load the integration's pure modules without Home Assistant installed.

The tests are plain scripts: the standard library and nothing else, so they run
the same on a laptop, in CI and inside a Home Assistant add-on container. Each
one imports this file, which stubs the little of Home Assistant and aiohttp the
modules touch at import time, then loads them as the package `sh`.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
COMP = os.path.join(ROOT, "custom_components", "swedish_hockey")


def _mod(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module
    return module


class _ClientError(Exception):
    pass


_mod(
    "aiohttp",
    ClientError=_ClientError,
    ClientSession=object,
    ClientTimeout=lambda **kwargs: kwargs,
)

_now = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)


def _parse_datetime(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


_mod("homeassistant")
_util = _mod("homeassistant.util")
_util.dt = _mod(
    "homeassistant.util.dt",
    UTC=timezone.utc,
    utcnow=lambda: _now,
    now=lambda tz=None: _now,
    as_utc=lambda value: value.astimezone(timezone.utc),
    as_local=lambda value: value,
    get_time_zone=lambda name: timezone.utc,
    parse_datetime=_parse_datetime,
)

_package = types.ModuleType("sh")
_package.__path__ = [COMP]
sys.modules["sh"] = _package


def load(name: str):
    """Import custom_components/swedish_hockey/<name>.py as sh.<name>."""
    full = f"sh.{name}"
    if full in sys.modules:
        return sys.modules[full]
    spec = importlib.util.spec_from_file_location(full, os.path.join(COMP, f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    sys.modules[full] = module
    spec.loader.exec_module(module)
    return module


_results = {"passed": 0, "failed": 0}


def check(name: str, condition: bool, detail: object = "") -> None:
    """Print one PASS/FAIL line; the name reads as a specification."""
    if condition:
        _results["passed"] += 1
        print(f"PASS {name}")
    else:
        _results["failed"] += 1
        print(f"FAIL {name}{f' -- {detail}' if detail != '' else ''}")


def done() -> None:
    """Print the total and exit non-zero on any failure."""
    total = _results["passed"] + _results["failed"]
    print(f"{_results['passed']}/{total} passed")
    sys.exit(1 if _results["failed"] else 0)
