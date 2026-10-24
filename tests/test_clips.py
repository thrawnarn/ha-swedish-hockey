"""Highlight clips: the league's YouTube feed tops up its highlights page.

The page has been seen a day behind the channel, so a clip the feed has and
the page has not yet is put first; the feed only reaches back fifteen uploads,
so it never replaces the page.
"""

import asyncio

from _rig import check, done, load

api = load("api")
Team = api.Team
Clip = api.Clip


def entry(video: str, title: str, published: str) -> str:
    return (
        "<entry><yt:videoId>" + video + "</yt:videoId><title>" + title
        + "</title><published>" + published + "</published></entry>"
    )


FEED = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"'
    ' xmlns="http://www.w3.org/2005/Atom"><title>Ligan</title>'
    + entry("week6", "Alla powerplaymål: Vecka 6", "2026-10-24T07:09:11+00:00")
    + entry("aby2", "Bstad vs. Aby | Highlights 23/10", "2026-10-23T21:19:43+00:00")
    + entry("cdal", "Cdal vs. Dby | Highlights 23/10", "2026-10-23T20:40:04+00:00")
    + entry("aby1", "Aby vs. Bstad | Highlights 21/10", "2026-10-21T19:52:39+00:00")
    + "</feed>"
)

feed = api.parse_clip_feed(FEED)
check("only game clips come from the feed", [c.video_id for _, c in feed] == ["aby2", "cdal", "aby1"], feed)
check(
    "a feed clip reads like a page clip",
    feed[0][1].heading == "Bstad vs. Aby"
    and feed[0][1].subheading == "Highlights 23/10"
    and feed[0][1].url.endswith("v=aby2")
    and feed[0][1].thumbnail.endswith("/aby2/hqdefault.jpg"),
    feed[0],
)

try:
    api.parse_clip_feed("<html>nope")
    check("a broken feed is an API error", False)
except api.HockeyApiError:
    check("a broken feed is an API error", True)


def clip(video: str) -> Clip:
    return Clip("x vs. y", None, f"https://y/{video}", None, video)


page = [clip("aby1"), clip("aby0")]
check(
    "a feed clip newer than the page's newest goes first",
    [c.video_id for c in api.newer_from_feed(page, feed)] == ["aby2", "cdal"],
)
check(
    "nothing is added once the page has caught up",
    api.newer_from_feed([clip("aby2"), *page], feed) == [],
)
check(
    "a page further behind than the feed reaches takes all of it",
    [c.video_id for c in api.newer_from_feed([clip("old")], feed)] == ["aby2", "cdal", "aby1"],
)
check("an empty feed adds nothing", api.newer_from_feed(page, []) == [])

PAGE = (
    '"title":"Aby","videoCards":[{"youtubeId":"aby1","heading":"Aby vs. Bstad",'
    '"subHeading":"Omgång 13"},{"youtubeId":"aby0","heading":"Eby vs. Aby",'
    '"subHeading":"Omgång 12"}]'
)


class FakeClient(api.HockeyallsvenskanClient):
    def __init__(self, feed_text):
        super().__init__(None)
        self.feed_text = feed_text

    async def _async_get(self, url, **kwargs):
        if url == api.HA_YOUTUBE_FEED_URL:
            if isinstance(self.feed_text, Exception):
                raise self.feed_text
            return self.feed_text
        return PAGE


aby = Team(key="ABY", name="Aby IF", short_name="Aby", logo=None)
clips = asyncio.run(FakeClient(FEED).async_highlights(aby))
check(
    "a club's clips take only its own games from the feed",
    [c.video_id for c in clips] == ["aby2", "aby1", "aby0"],
    clips,
)
clips = asyncio.run(FakeClient(api.HockeyApiError("down")).async_highlights(aby))
check("a feed that is down leaves the page's clips", [c.video_id for c in clips] == ["aby1", "aby0"])
every = asyncio.run(FakeClient(FEED).async_all_clips())
check("every clip includes the feed's newer ones", [c.video_id for c in every] == ["aby2", "cdal", "aby1", "aby0"])

done()
