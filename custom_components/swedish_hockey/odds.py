"""Odds for games still to come, from Svenska Spel.

Svenska Spel's odds come from Kambi, whose offering API the site's own pages
read without a key: one list per league of the games it has opened betting
on - in practice the next round, a day or two ahead - each with its main
market, the three-way bet on regular time: home win, draw, away win after
sixty minutes ("Match Odds - Ordinarie tid", 1X2). Odds are written in
thousandths there (1380 is 1.38).

A bookmaker spells the clubs its own way ("HV 71", "Visby Roma HK"), so the
games are paired with the league's by start time and club name, as tv.nu's
listings are. The list is read at most every few minutes and its last answer
kept, so a card opening the schedule twice does not ask twice, and a
bookmaker having a bad minute does not take the odds off the page.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from aiohttp import ClientError, ClientSession

from homeassistant.util import dt as dt_util

from .api import TIMEOUT, USER_AGENT, Game, HockeyApiError
from .const import LEAGUE_HOCKEYALLSVENSKAN, LEAGUE_SHL
from .tv import pair_listings

_LOGGER = logging.getLogger(__name__)

SOURCE = "Svenska Spel"
KAMBI_URL = "https://eu.offering-api.kambicdn.com/offering/v2018/svenskaspel"
LIST_URL = f"{KAMBI_URL}/listView/ice_hockey/sweden/{{group}}/all/matches.json"
PARAMS = {"lang": "sv_SE", "market": "SE"}
# Kambi's name for each league's group.
GROUPS = {LEAGUE_SHL: "shl", LEAGUE_HOCKEYALLSVENSKAN: "hockeyallsvenskan"}

# Odds move, but not by the minute before a game; this spares the bookmaker
# a request every time someone opens a list.
ODDS_TTL = 10 * 60

# The three outcomes of the regular-time market, as Kambi types them.
_OUTCOMES = {"OT_ONE": "home", "OT_CROSS": "draw", "OT_TWO": "away"}


@dataclass(frozen=True, slots=True)
class OddsListing:
    """A game as the bookmaker lists it, with its odds."""

    start: datetime
    home: str
    away: str
    odds: dict[str, Any]


def _main_market(offers: list[Any]) -> dict[str, Any] | None:
    """Return the three-way regular-time market among a game's offers."""
    for offer in offers or []:
        if not isinstance(offer, dict):
            continue
        outcomes = {
            _OUTCOMES[outcome.get("type")]: outcome
            for outcome in offer.get("outcomes") or []
            if isinstance(outcome, dict) and outcome.get("type") in _OUTCOMES
        }
        if len(outcomes) != 3:
            continue
        if any(outcome.get("status", "OPEN") != "OPEN" for outcome in outcomes.values()):
            continue
        try:
            prices = {side: int(outcome["odds"]) / 1000 for side, outcome in outcomes.items()}
        except (KeyError, TypeError, ValueError):
            continue
        criterion = offer.get("criterion") or {}
        return {
            **prices,
            # "Match Odds - Ordinarie tid": the part after the dash is what
            # the market covers.
            "market": str(criterion.get("label") or "").split(" - ")[-1] or None,
            "source": SOURCE,
        }
    return None


def parse_odds(payload: Any) -> list[OddsListing]:
    """Return the games still to come in a Kambi list, with their odds."""
    listings: list[OddsListing] = []
    for item in (payload or {}).get("events") or []:
        event = (item or {}).get("event") or {}
        if event.get("state") != "NOT_STARTED":
            continue
        start = dt_util.parse_datetime(str(event.get("start") or ""))
        home, away = event.get("homeName"), event.get("awayName")
        if start is None or not home or not away:
            continue
        odds = _main_market(item.get("betOffers") or [])
        if odds is None:
            continue
        listings.append(
            OddsListing(start=dt_util.as_utc(start), home=home, away=away, odds=odds)
        )
    return listings


class OddsBook:
    """One league's odds, read when asked for and kept a little while."""

    def __init__(self, session: ClientSession, league: str) -> None:
        """Initialise for a league; a league Kambi does not list has no odds."""
        self._session = session
        self._group = GROUPS.get(league)
        self._listings: list[OddsListing] = []
        self._read_at: float | None = None
        self._read_iso: str | None = None
        self._known: dict[str, dict[str, Any]] = {}

    def known(self) -> dict[str, dict[str, Any]]:
        """Return the odds last paired with games, keyed by game uid."""
        return self._known

    async def async_odds(self, games: list[Game]) -> dict[str, dict[str, Any]]:
        """Return odds for the games the bookmaker lists, keyed by game uid.

        Never raises: odds are an extra, and a list that cannot be read
        leaves the last one in place.
        """
        if self._group is None:
            return {}
        fresh = self._read_at is not None and time.monotonic() - self._read_at < ODDS_TTL
        if not fresh:
            try:
                self._listings = parse_odds(await self._async_get())
                self._read_at = time.monotonic()
                self._read_iso = dt_util.utcnow().isoformat()
            except HockeyApiError as err:
                _LOGGER.debug("Could not read odds from %s: %s", SOURCE, err)
                # Asked again in a minute rather than on every call.
                self._read_at = time.monotonic() - ODDS_TTL + 60
        upcoming = [game for game in games if not game.has_result]
        paired = pair_listings(upcoming, self._listings)
        self._known = {
            uid: {**listing.odds, "updated": self._read_iso} for uid, listing in paired.items()
        }
        return self._known

    async def _async_get(self) -> Any:
        url = LIST_URL.format(group=self._group)
        try:
            async with self._session.get(
                url, params=PARAMS, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT
            ) as response:
                response.raise_for_status()
                return await response.json(content_type=None)
        except (ClientError, TimeoutError, ValueError) as err:
            raise HockeyApiError(f"Could not fetch {url}: {err}") from err
