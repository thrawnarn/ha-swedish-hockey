"""News about a club: its own site and the papers, through Google News.

Neither league publishes news by club - their sites carry the league's own
articles, suspensions and players of the week - but Google News finds the
club's own site, the national papers and the local one. Three searches are
made and put together: the club's full name anywhere in an article, which
finds its own site and anything that names it properly; its everyday name in
the headline, which finds the papers - they write "Leksand stäms på halv
miljon", not "Leksands IF"; and that again over the last few days only. A
search answers with at most a hundred items, picked by relevance rather than
date, so over a month a story out this morning can be left out - which is how
the papers' versions of that one went missing. The answers are RSS feeds,
read here and kept a little while.
"""

from __future__ import annotations

import asyncio
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable
from email.utils import parsedate_to_datetime
from typing import Any

from aiohttp import ClientError, ClientSession

from .api import TIMEOUT, USER_AGENT, HockeyApiError, Team, club_key

NEWS_URL = "https://news.google.com/rss/search"
# Swedish news, from the last month: enough for a quiet club to have some,
# and a busy one is cut to the newest anyway.
NEWS_PARAMS = {"hl": "sv", "gl": "SE", "ceid": "SE:sv"}
NEWS_WINDOW = "30d"
NEWS_FRESH = "3d"
# Short enough that a story out this hour is there the next time someone
# looks: Google itself takes a while to list one.
NEWS_TTL = 10 * 60

# What to search for, by club code. The integration's names are what each
# league writes, and those are no good to search on: "Kalmar" is a town,
# "Västerås" a city and "Djurgården Hockey Herr" no paper's name for the club.
# A club whose name is shared with its football or bandy side has "hockey"
# added. A club not here is searched as its name and "hockey".
NEWS_QUERIES = {
    # Hockeyallsvenskan
    "AIK": '"AIK Hockey"',
    "AIS": '"Almtuna" hockey',
    "BIK": '"BIK Karlskoga"',
    "IKO": '"IK Oskarshamn"',
    "KHC": '"Kalmar HC"',
    "LIF": '"Leksands IF" hockey',
    "MIK": '"Mora IK"',
    "MORA": '"Mora IK"',
    "MODO": '"MoDo Hockey" OR "Modo Hockey"',
    "NVIF": '"Nybro Vikings"',
    "SSK": '"Södertälje SK"',
    "VHC": '"Vimmerby Hockey" OR "Vimmerby HC"',
    "VIK": '"Västerås IK" OR "VIK Hockey"',
    "VIS": '"Visby/Roma" OR "Visby Roma"',
    "ÖIK": '"Östersunds IK"',
    # SHL
    "BIF": '"Brynäs IF"',
    "DIF": '"Djurgården Hockey" OR "Djurgårdens IF Hockey"',
    "FBK": '"Färjestad BK" OR "Färjestad" hockey',
    "FHC": '"Frölunda HC" OR "Frölunda Hockey"',
    "HV71": '"HV71"',
    "IFB": '"Björklöven"',
    "LHC": '"Linköping HC"',
    "LHF": '"Luleå Hockey"',
    "MIF": '"Malmö Redhawks"',
    "OHK": '"Örebro Hockey"',
    "RBK": '"Rögle BK"',
    "SAIK": '"Skellefteå AIK"',
    "TIK": '"Timrå IK"',
    "VLH": '"Växjö Lakers"',
}

# The name the papers put in a headline, by club code. Searched as a headline
# word with a hockey word anywhere in the article: "Kalmar" or "Västerås"
# anywhere at all matched every hockey page that links to a story about them,
# and in a headline alone it found the towns' fires and council meetings.
NEWS_HEADLINES = {
    # Hockeyallsvenskan
    "AIK": "AIK",
    "AIS": "Almtuna",
    "BIK": "Karlskoga",
    "IKO": "Oskarshamn",
    "KHC": "Kalmar",
    "LIF": "Leksand",
    "MIK": "Mora",
    "MORA": "Mora",
    "MODO": "Modo",
    "NVIF": "Nybro",
    "SSK": "Södertälje",
    "VHC": "Vimmerby",
    "VIK": "Västerås",
    "VIS": "Visby",
    "ÖIK": "Östersund",
    # SHL
    "BIF": "Brynäs",
    "DIF": "Djurgården",
    "FBK": "Färjestad",
    "FHC": "Frölunda",
    "HV71": "HV71",
    "IFB": "Björklöven",
    "LHC": "Linköping",
    "LHF": "Luleå",
    "MIF": "Redhawks",
    "OHK": "Örebro",
    "RBK": "Rögle",
    "SAIK": "Skellefteå",
    "TIK": "Timrå",
    "VLH": "Växjö",
}

# The local papers write up every junior game by machine, and each one names
# the club: "4-2-seger för BIK Karlskoga U16 mot VIK Hockey". Those are not
# news about the team this integration follows.
_JUNIOR = re.compile(r"\b[UJ]\s?\d{2}\b", re.IGNORECASE)
# Betting sites write a page for every game, "Speltips: Aby - Bstad", and
# Google files it as news.
_BETTING = re.compile(r"speltips|odds\s*&|tippade resultat|bettingtips", re.IGNORECASE)
# Nor are the TV guides' pages for every game - "Vimmerby–Västerås på TV:
# kanal, tid och streaming" - which the headline search finds by the dozen.
_TV_GUIDE = re.compile(
    r"stream|tv-tid|tv-kanal|kanal, tid|på tv4 play|var kan man se|så ser du",
    re.IGNORECASE,
)
# Every youth team's page on Svenskalag, the clubs' team-site host, is news to
# Google.
# Nor are the listings of every game - the TV schedules, and the sites that
# write each result up by machine.
_NOT_NEWS_SOURCES = {"svenskalag", "tv4 play", "tv.nu", "tvmatchen.nu", "hurbra.se"}


def _known(table: dict[str, str], team: Team) -> str | None:
    for key in (team.key, club_key(team.key).upper()):
        if key in table:
            return table[key]
    return None


def news_query(team: Team) -> str:
    """Return what to search for to find a club's name in an article."""
    return _known(NEWS_QUERIES, team) or f'"{team.name}" hockey'


def headline_query(team: Team) -> str:
    """Return what to search for to find a club in a paper's headline."""
    name = _known(NEWS_HEADLINES, team) or team.short_name
    # Not the club code as well: DIF and AIK are the football clubs too.
    return f"intitle:{name} (hockey OR ishockey OR SHL OR Hockeyallsvenskan)"


def news_searches(team: Team) -> list[str]:
    """Return every search made for a club, each with its time window."""
    headline = headline_query(team)
    return [
        f"{news_query(team)} when:{NEWS_WINDOW}",
        f"{headline} when:{NEWS_WINDOW}",
        f"{headline} when:{NEWS_FRESH}",
    ]


def merge_news(*feeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return several searches' items as one list, newest first, each once."""
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for item in (item for feed in feeds for item in feed):
        key = club_key(item["title"])
        if key not in seen:
            seen.add(key)
            merged.append(item)
    merged.sort(key=lambda row: row["published"] or "", reverse=True)
    return merged


def parse_news(feed: str) -> list[dict[str, Any]]:
    """Return a Google News feed's items, newest first, without repeats.

    Each title ends in " - <the paper>", which the source says already; the
    same story syndicated to three papers has the same title in each, and
    only the first is kept.
    """
    try:
        root = ET.fromstring(feed)
    except ET.ParseError:
        return []
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        source_el = item.find("source")
        source = (source_el.text or "").strip() if source_el is not None else ""
        if source and title.endswith(f" - {source}"):
            title = title[: -len(f" - {source}")].rstrip()
        link = (item.findtext("link") or "").strip()
        if (
            not title
            or not link
            or source.casefold() in _NOT_NEWS_SOURCES
            or any(rule.search(title) for rule in (_JUNIOR, _BETTING, _TV_GUIDE))
        ):
            continue
        key = club_key(title)
        if key in seen:
            continue
        seen.add(key)
        try:
            published = parsedate_to_datetime(item.findtext("pubDate") or "")
        except (TypeError, ValueError):
            published = None
        items.append(
            {
                "title": title,
                "source": source or None,
                "source_url": source_el.get("url") if source_el is not None else None,
                "url": link,
                "published": published.isoformat() if published else None,
            }
        )
    items.sort(key=lambda row: row["published"] or "", reverse=True)
    return items


def feed_reader(
    session: ClientSession,
) -> Callable[[str, dict[str, str]], Awaitable[str]]:
    """Return a function that reads a feed, given its URL and query."""

    async def read(url: str, params: dict[str, str]) -> str:
        try:
            async with session.get(
                url, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT
            ) as response:
                response.raise_for_status()
                return await response.text()
        except (ClientError, TimeoutError) as err:
            raise HockeyApiError(f"Could not fetch the news: {err}") from err

    return read


class NewsReader:
    """Google News for each club, read when asked for and kept half an hour.

    Shared by both leagues. Two asking at once about the same club share a
    read.
    """

    def __init__(self, fetch: Callable[[str, dict[str, str]], Awaitable[str]]) -> None:
        """Remember how to fetch a page: a URL and its query, the text back."""
        self._fetch = fetch
        self._kept: dict[str, tuple[float, list[dict[str, Any]]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def async_news(self, team: Team) -> list[dict[str, Any]]:
        """Return the news about a club, newest first."""
        queries = news_searches(team)
        key = " | ".join(queries)
        async with self._locks.setdefault(key, asyncio.Lock()):
            now = time.monotonic()
            kept = self._kept.get(key)
            if kept and now - kept[0] < NEWS_TTL:
                return kept[1]
            feeds = await asyncio.gather(
                *(
                    self._fetch(NEWS_URL, {"q": query, **NEWS_PARAMS})
                    for query in queries
                )
            )
            items = merge_news(*(parse_news(feed) for feed in feeds))
            self._kept[key] = (now, items)
            return items
