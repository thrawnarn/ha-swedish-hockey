"""News about a club, read out of a Google News feed.

The search is by club code, since the leagues' names are no good to search
on; the titles lose the paper's name they end in; a story syndicated to
several papers shows once; and the local papers' machine-written junior
results are left out.
"""

import asyncio

from _rig import check, done, load

api = load("api")
news = load("news")
Team = api.Team

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item><title>Förlust mot Bstad - Aby IF</title><link>https://news.example/1</link>
<pubDate>Wed, 21 Oct 2026 19:40:00 GMT</pubDate><source url="https://aby.example">Aby IF</source></item>
<item><title>Ny tränare klar - Kvällsbladet</title><link>https://news.example/2</link>
<pubDate>Thu, 22 Oct 2026 08:00:00 GMT</pubDate><source url="https://kb.example">Kvällsbladet</source></item>
<item><title>Ny tränare klar - Morgonposten</title><link>https://news.example/3</link>
<pubDate>Thu, 22 Oct 2026 07:00:00 GMT</pubDate><source url="https://mp.example">Morgonposten</source></item>
<item><title>4-2-seger för Aby IF U16 mot Bstad - Lokalbladet</title><link>https://news.example/4</link>
<pubDate>Thu, 22 Oct 2026 09:00:00 GMT</pubDate><source url="https://lb.example">Lokalbladet</source></item>
<item><title>Aby–Bstad på TV: kanal, tid och streaming - Tvguiden</title><link>https://news.example/6</link>
<pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><source url="https://tv.example">Tvguiden</source></item>
<item><title>Aby IF - Bstad - TV4 Play</title><link>https://news.example/8</link>
<pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><source url="https://tv4play.example">TV4 Play</source></item>
<item><title>Profilsida / Aby IF - Mv Ungdom - Svenskalag</title><link>https://news.example/7</link>
<pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><source url="https://svenskalag.example">Svenskalag</source></item>
<item><title>Speltips: Aby IF - Bstad 22/10 - Tipssajten</title><link>https://news.example/5</link>
<pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><source url="https://tips.example">Tipssajten</source></item>
</channel></rss>"""

items = news.parse_news(FEED)
check("newest first", [i["url"] for i in items] == ["https://news.example/2", "https://news.example/1"], items)
check("the title loses the paper's name", items[0]["title"] == "Ny tränare klar", items[0])
check("the paper is named on its own", items[0]["source"] == "Kvällsbladet" and items[0]["source_url"] == "https://kb.example")
check("a syndicated story shows once", sum(i["title"] == "Ny tränare klar" for i in items) == 1)
check("betting tips are left out", not any("Speltips" in i["title"] for i in items), items)
check("TV guides and youth team pages are left out", [i["url"] for i in items] == ["https://news.example/2", "https://news.example/1"], items)
check("junior results are left out", not any("U16" in i["title"] for i in items), items)
check("the time is kept", items[0]["published"].startswith("2026-10-22T08:00:00"), items[0])
check("a broken feed is no news", news.parse_news("<rss><channel>") == [])

LIF = Team(key="LIF", name="Leksand", short_name="LIF")
check("a known club is searched by its full name", news.news_query(LIF) == '"Leksands IF" hockey')
check("an unknown one by its name and the sport", news.news_query(Team(key="ZZZ", name="Zby HC", short_name="Zby")) == '"Zby HC" hockey')

asked = []


async def fetch(url, params):
    asked.append(params["q"])
    return FEED


async def twice():
    reader = news.NewsReader(fetch)
    first = await reader.async_news(LIF)
    second = await reader.async_news(LIF)
    return first, second


first, second = asyncio.run(twice())
headline = "intitle:Leksand (hockey OR ishockey OR SHL OR Hockeyallsvenskan)"
check(
    "by the club's name, by the papers' name for it in a headline, and that again for the last days",
    sorted(asked) == sorted(['"Leksands IF" hockey when:30d', f"{headline} when:30d", f"{headline} when:3d"]),
    asked,
)
check("the two searches are one list", [i["url"] for i in first] == ["https://news.example/2", "https://news.example/1"], first)
check("a second ask within ten minutes is not read again", len(asked) == 3 and first is second)

done()
