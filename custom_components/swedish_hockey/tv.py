"""Which TV channel shows a game, from the tv.nu listings.

Neither league says where a game is broadcast - SHL's and Hockeyallsvenskan's
own payloads carry no channel at all - but tv.nu keeps a page per league with
every game of the coming week or so and the channels showing it. The page is
server rendered, and the listing sits in it as a JSON string assigned to
``__INITIAL_STATE__``.

tv.nu writes the clubs its own way ("AIK IF", "Nybro Vikings IF", "VIK
Västerås"), so a listing is paired with a game by its start time first and the
names only have to tell apart the games that start together.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from aiohttp import ClientError, ClientSession

from homeassistant.util import dt as dt_util

from .api import TIMEOUT, USER_AGENT, Game, HockeyApiError, Team
from .const import LEAGUE_HOCKEYALLSVENSKAN, LEAGUE_SHL

_LOGGER = logging.getLogger(__name__)

TV_URL = "https://www.tv.nu/sport/ishockey/liga/{slug}"
TV_SLUGS = {LEAGUE_SHL: "shl", LEAGUE_HOCKEYALLSVENSKAN: "hockeyallsvenskan"}

_STATE = re.compile(r"__INITIAL_STATE__\s*=\s*")
# A listing is stamped with the scheduled puck drop, the same moment the league
# gives; the slack is only there for a game moved without tv.nu catching up.
_SLACK = timedelta(minutes=30)
# The words that say what kind of club it is rather than which one.
_GENERIC = frozenset(
    {"if", "ik", "is", "hc", "hk", "hf", "bk", "sk", "hockey", "herr", "club"}
)


@dataclass(frozen=True, slots=True)
class TvListing:
    """One game as tv.nu lists it."""

    start: datetime
    home: str
    away: str
    channels: tuple[str, ...]


async def async_tv_listings(session: ClientSession, league: str) -> list[TvListing]:
    """Return the league's games that tv.nu lists a channel for."""
    if (slug := TV_SLUGS.get(league)) is None:
        return []
    url = TV_URL.format(slug=slug)
    try:
        async with session.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT
        ) as response:
            response.raise_for_status()
            page = await response.text()
    except (ClientError, TimeoutError) as err:
        raise HockeyApiError(f"Could not fetch {url}: {err}") from err

    if (match := _STATE.search(page)) is None:
        raise HockeyApiError("tv.nu did not embed a listing")
    try:
        # A JSON string holding a JSON document.
        text, _ = json.JSONDecoder().raw_decode(page, match.end())
        state = json.loads(text)
    except (TypeError, ValueError) as err:
        raise HockeyApiError(f"Unexpected listing from tv.nu: {err}") from err

    listings = []
    for raw in state.get("sportPageSchedule") or []:
        if (listing := _listing(raw, slug)) is not None:
            listings.append(listing)
    return listings


def _listing(raw: Any, slug: str) -> TvListing | None:
    """Build a listing from a tv.nu sport event."""
    if not isinstance(raw, dict) or raw.get("tournamentSlug") not in (None, slug):
        return None
    home = (raw.get("team1") or {}).get("name")
    away = (raw.get("team2") or {}).get("name")
    stamp = raw.get("eventTime")
    if not home or not away or not isinstance(stamp, (int, float)):
        return None

    # The broadcast channels first, then the streaming services: "TV4 Hockey"
    # says more about where to look than "TV4 Play", which shows every game.
    channels: list[str] = []
    for broadcast in raw.get("broadcasts") or []:
        if not isinstance(broadcast, dict) or broadcast.get("isRerun"):
            continue
        channels.append((broadcast.get("channel") or {}).get("name"))
    for episode in raw.get("playEpisodes") or []:
        if isinstance(episode, dict):
            channels.append((episode.get("playProvider") or {}).get("name"))
    unique = tuple(dict.fromkeys(name.strip() for name in channels if name))
    if not unique:
        return None

    return TvListing(
        start=datetime.fromtimestamp(stamp / 1000, tz=dt_util.UTC),
        home=str(home),
        away=str(away),
        channels=unique,
    )


def match_channels(
    games: list[Game], listings: list[TvListing]
) -> dict[str, tuple[str, ...]]:
    """Return the channels of each game tv.nu lists, keyed by game uid.

    A club plays one game at a time, so among the games starting together one
    side's name is enough to say which is which. Both sides are still counted,
    so a name that half fits two games goes to the one that fits it better.
    """
    candidates: list[tuple[int, str, TvListing]] = []
    for game in games:
        for listing in listings:
            if abs(listing.start - game.start) > _SLACK:
                continue
            score = _names_match(listing.home, game.home) + _names_match(
                listing.away, game.away
            )
            if score:
                candidates.append((score, game.uid, listing))

    channels: dict[str, tuple[str, ...]] = {}
    used: set[int] = set()
    for _, uid, listing in sorted(candidates, key=lambda item: -item[0]):
        if uid in channels or id(listing) in used:
            continue
        channels[uid] = listing.channels
        used.add(id(listing))
    return channels


def _words(name: str | None) -> set[str]:
    """Return the words of a club name that say which club it is."""
    return {
        word
        for word in re.findall(r"\w+", str(name or "").casefold())
        if word not in _GENERIC
    }


def _names_match(listed: str, team: Team) -> bool:
    """Return True if tv.nu's name for a club is this team.

    Swedish writes a club in the genitive as often as not - Leksand and
    Leksands IF, Djurgården and Djurgårdens IF - so a word may run a letter or
    two past the other, but no further: VIK is not Nybro Vikings.
    """
    theirs = _words(listed)
    ours = _words(team.name) | _words(team.short_name) | _words(team.key)
    for a in theirs:
        for b in ours:
            short, long_ = sorted((a, b), key=len)
            if len(short) >= 3 and long_.startswith(short) and len(long_) - len(short) <= 2:
                return True
    return False
