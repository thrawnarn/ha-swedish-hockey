"""Goals as they happen, from the stream shl.se's own game center listens to.

Sportality, who run the SHL and Hockeyallsvenskan sites, push every game of
the day in both leagues down one Server-Sent Events stream. Two kinds of
message matter here:

- ``gameOverview``: a game's score, its state (Ongoing, PeriodBreak, Overtime,
  Shootout, GameEnded) and the period and time in it.
- ``gameScorer``: a goal, with the period, the time, the scorer and the
  strength (EQ, PP1, SH1) - the assists are often still empty when it lands.

A new connection is first sent the day so far: every game's overview, but only
some of the goals. So the overview is what the score is taken from, and a goal
message only ever adds the detail to a goal the overview has already counted.

This is an addition to the polled feeds, not a replacement for them: the poll
carries on underneath at its usual pace, and a stream that drops, stalls or
starts sending something else leaves the sensors exactly where polling alone
would have them.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .api import USER_AGENT, Game, Goal, club_key
from .tv import _names_match

_LOGGER = logging.getLogger(__name__)

STREAM_URL = "https://game-broadcaster.s8y.se/live/game"
# The stream sends nothing between events - no keep-alive - and a connection
# that has quietly died looks the same as a quiet period. Reconnecting after
# five silent minutes costs one replay of the day, a few kilobytes.
_READ_TIMEOUT = ClientTimeout(total=None, sock_connect=15, sock_read=300)
_RETRY_MIN = 5
_RETRY_MAX = 120

STATE_ENDED = "GameEnded"


@dataclass(slots=True)
class PushGame:
    """One game as the stream has last described it."""

    uuid: str
    home: int
    away: int
    state: str | None = None
    period: str | None = None
    period_time: str | None = None
    # Goals the stream has sent, keyed by the score they made ("2-1").
    goals: dict[str, Goal] = field(default_factory=dict)
    updated: datetime = field(default_factory=dt_util.utcnow)

    @property
    def score(self) -> str:
        """Return the score as the feeds write it."""
        return f"{self.home}-{self.away}"

    @property
    def total(self) -> int:
        """Return the goals scored in the game."""
        return self.home + self.away


Listener = Callable[[str, dict[str, Any]], None]


class GameBroadcaster:
    """Hold the stream open while anyone is watching a game, and pass it on."""

    def __init__(
        self, hass: HomeAssistant, entry: ConfigEntry, session: ClientSession
    ) -> None:
        """Initialise the stream reader for a config entry."""
        self._hass = hass
        self._entry = entry
        self._session = session
        self._listeners: dict[str, Listener] = {}
        self._task: asyncio.Task[None] | None = None
        self.connected = False

    @callback
    def async_watch(self, key: str, listener: Listener) -> None:
        """Start passing messages to a listener, opening the stream if needed."""
        self._listeners[key] = listener
        if self._task is None or self._task.done():
            self._task = self._entry.async_create_background_task(
                self._hass, self._async_run(), f"swedish_hockey push {self._entry.title}"
            )

    @callback
    def async_unwatch(self, key: str) -> None:
        """Stop passing messages to a listener, closing the stream if it was last."""
        self._listeners.pop(key, None)
        if not self._listeners:
            self.async_stop()

    @callback
    def async_stop(self) -> None:
        """Close the stream."""
        self._listeners.clear()
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None
        self.connected = False

    async def _async_run(self) -> None:
        """Read the stream for as long as there is a listener, reconnecting."""
        delay = _RETRY_MIN
        while self._listeners:
            try:
                await self._async_read()
                # A clean end of stream: the server closed it, so come back
                # soon but not at once.
                delay = _RETRY_MIN
            except asyncio.CancelledError:
                raise
            except (ClientError, TimeoutError, ValueError) as err:
                _LOGGER.debug("Push stream dropped, polling carries on: %s", err)
                delay = min(delay * 2, _RETRY_MAX)
            finally:
                self._set_connected(False)
            if self._listeners:
                await asyncio.sleep(delay)

    async def _async_read(self) -> None:
        """Read one connection's worth of the stream."""
        async with self._session.get(
            STREAM_URL,
            headers={"User-Agent": USER_AGENT, "Accept": "text/event-stream"},
            timeout=_READ_TIMEOUT,
        ) as response:
            response.raise_for_status()
            self._set_connected(True)
            data: list[str] = []
            async for raw in response.content:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line:
                    if data:
                        self._dispatch("\n".join(data))
                        data = []
                    continue
                if line.startswith(":"):
                    continue
                name, _, value = line.partition(":")
                if name == "data":
                    data.append(value[1:] if value.startswith(" ") else value)

    def _set_connected(self, connected: bool) -> None:
        if connected != self.connected:
            self.connected = connected
            _LOGGER.debug("Push stream %s", "connected" if connected else "closed")
            for listener in list(self._listeners.values()):
                listener("connection", {"connected": connected})

    def _dispatch(self, text: str) -> None:
        """Hand one message to every listener."""
        try:
            message = json.loads(text)
        except ValueError:
            return
        if not isinstance(message, dict):
            return
        for kind, body in message.items():
            if kind in ("gameOverview", "gameScorer") and isinstance(body, dict):
                for listener in list(self._listeners.values()):
                    try:
                        listener(kind, body)
                    except Exception:  # noqa: BLE001 - one listener must not stop the rest
                        _LOGGER.exception("Push listener failed on %s", kind)


def overview_is_game(body: dict[str, Any], game: Game) -> bool:
    """Return True if an overview is about this game.

    SHL's own uuids are the stream's, so for SHL the id says it. A
    Hockeyallsvenskan game has an id of the league's own, so it is told by its
    day and its two clubs, which the stream gives as codes and names both.
    """
    if body.get("gameUuid") == game.uid:
        return True
    home = body.get("homeTeam") or {}
    away = body.get("awayTeam") or {}
    source = str(home.get("gameSourceId") or "")
    day = dt_util.as_local(game.start).strftime("%Y%m%d")
    if source and not source.startswith(day):
        return False
    return _side_is(home, game.home) and _side_is(away, game.away)


def _side_is(side: dict[str, Any], team: Any) -> bool:
    code = club_key(side.get("teamCode") or side.get("teamId"))
    if code and code in (club_key(team.key), club_key(team.short_name)):
        return True
    name = side.get("teamName")
    return bool(name) and _names_match(str(name), team)


def apply_overview(current: PushGame | None, body: dict[str, Any]) -> PushGame | None:
    """Return the game updated from an overview message."""
    home = _int(body.get("homeGoals", (body.get("homeTeam") or {}).get("score")))
    away = _int(body.get("awayGoals", (body.get("awayTeam") or {}).get("score")))
    uuid = str(body.get("gameUuid") or "")
    if home is None or away is None or not uuid:
        return current
    clock = body.get("time") or {}
    game = current if current is not None and current.uuid == uuid else PushGame(uuid, home, away)
    game.home = home
    game.away = away
    game.state = body.get("state") or game.state
    period = clock.get("period")
    game.period = str(period) if period not in (None, "") else game.period
    game.period_time = clock.get("periodTime") or game.period_time
    game.updated = dt_util.utcnow()
    return game


def apply_scorer(current: PushGame | None, body: dict[str, Any]) -> PushGame | None:
    """Return the game with a goal message's detail added."""
    if current is None or body.get("gameUuid") != current.uuid:
        return current
    if body.get("type") not in (None, "goal"):
        return current
    home = _int(body.get("homeTeamValue"))
    away = _int(body.get("awayTeamValue"))
    if home is None or away is None:
        return current
    team = body.get("teamDetails") or {}
    scorer = body.get("scorer")
    number = body.get("playerNumber")
    if scorer and number:
        scorer = f"#{number} {scorer}"
    current.goals[f"{home}-{away}"] = Goal(
        period=str(body["period"]) if body.get("period") not in (None, "") else None,
        time=body.get("time"),
        team_code=team.get("teamCode"),
        team_name=team.get("teamName"),
        score=f"{home}-{away}",
        note=body.get("goalStatus"),
        scorer=scorer or None,
        assists=[name for name in (_assist(item) for item in body.get("assist") or []) if name],
    )
    # A goal can land before the overview that counts it.
    if home + away > current.total:
        current.home, current.away = home, away
    current.updated = dt_util.utcnow()
    return current


def _assist(item: Any) -> str | None:
    """Return an assist as "#14 Calle Karlsson", whatever shape it came in."""
    if isinstance(item, str):
        return item.strip() or None
    if isinstance(item, dict):
        name = item.get("name") or " ".join(
            str(part) for part in (item.get("firstName"), item.get("lastName")) if part
        )
        number = item.get("playerNumber") or item.get("jersey")
        if name and number:
            return f"#{number} {name}"
        return name or None
    return None


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
