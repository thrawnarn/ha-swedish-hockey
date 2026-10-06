"""Earlier seasons from the federation's archive.

The pages are the site's own markup, cut down and filled with made-up clubs.
What matters: the season picker and a season's series are found, a schedule's
rows become games with the date carried down, overtime and shootouts are told
apart (and playoffs, which have no shootout), a playoff round written under
the clubs is not taken for a club, and a finished series is read once.
"""

import asyncio

from _rig import check, done, load

api = load("api")
archive = load("archive")
Team = api.Team
run = asyncio.run

OVERVIEW = """
<select>
<option id="/ScheduleAndResults/Overview/900" selected="selected" value="/ScheduleAndResults/Overview/900">2026-27</option>
<option id="/ScheduleAndResults/Overview/800" value="/ScheduleAndResults/Overview/800">2025-26</option>
<option id="/ScheduleAndResults/Overview/700" value="/ScheduleAndResults/Overview/700">2024-25</option>
<option id="/ScheduleAndResults/Schedule/600" value="/ScheduleAndResults/Schedule/600">2020-21</option>
</select>
"""

SEASON = """
<ul>
<li class="closedItem list-group-item border-0">
   <a href="/ScheduleAndResults/Overview/810">Ligan</a>
</li>
<li class="openItem list-group-item border-0">
   <a href="/ScheduleAndResults/Overview/800">Slutspel Ligan</a>
   <ul><li class="openItem list-group-item"><a href="/ScheduleAndResults/Overview/800">Overview</a></li></ul>
</li>
<li class="closedItem list-group-item border-0">
   <a href="/ScheduleAndResults/Overview/820">Play Out Ligan</a>
</li>
</ul>
"""

SCHEDULE = """
<table>
<tr><th>Round</th><th>Date</th><th>Game</th><th>Result</th></tr>
<tr><td class="tdOdd">2025-09-19</td><td><span class="lnkTooltip" title="1">2025-09-19 19:00</span></td><td>19:00</td>
<td class="tdOdd standardPaddingTop">Aby IF - Bstad HC</td><td>3 - 1</td><td> (0-0, 1-1, 2-0) </td><td>7298</td><td>Aby Arena</td></tr>
<tr><td>19:00</td><td>19:00</td><td>Cby IK - Aby IF</td><td>1 - 2</td><td> (0-0, 0-1, 1-0, 0-0, 0-1) </td><td>3178</td><td>Cby Hall</td></tr>
<tr><td class="tdOdd">2025-10-02</td><td>2025-10-02 18:00</td><td>18:00</td>
<td>Bstad HC - Aby IF</td><td>5 - 4</td><td> (1-1, 1-2, 2-1, 1-0) </td><td>0</td><td>Bstad Rink</td></tr>
<tr><td>19:00</td><td>19:00</td><td>Aby IF - Cby IK</td><td></td><td></td><td></td><td>Aby Arena</td></tr>
</table>
"""

PLAYOFF = """
<table>
<tr><td>1</td><td><div class="dateLink"><span class="lnkTooltip" title="9">2026-03-09 19:00</span></div></td>
<td>Bstad HC - Aby IF<br /><i>Kvartsfinal 1</i></td><td>3 - 4</td><td> (0-1, 2-2, 1-0, 0-0, 0-1) </td><td>1001</td><td>Bstad Rink </td></tr>
</table>
"""

# --- the pages ----------------------------------------------------------------------
check("the season picker lists every season, newest first",
      archive.parse_seasons(OVERVIEW) == [(2026, "Overview", "900"), (2025, "Overview", "800"),
                                          (2024, "Overview", "700"), (2020, "Schedule", "600")])
check("a season's series are found from its menu, each once",
      archive.parse_series(SEASON) == [("810", "Ligan"), ("800", "Slutspel Ligan"), ("820", "Play Out Ligan")])

games = archive.parse_archive(SCHEDULE, 2025, "Ligan", "Ligan")
check("every played game is read, and the unplayed one left out", len(games) == 3, games)
first, second, third = games
check("the clubs and the score", (first.home, first.away, first.home_score, first.away_score)
      == ("Aby IF", "Bstad HC", 3, 1))
check("the date is carried down to a day's later games", second.start == "2025-09-19T19:00")
check("each game keeps its own time", third.start == "2025-10-02T18:00", third.start)
check("three periods is regulation", first.decided_in == "FT")
check("a fifth period in a league game is the shootout", second.decided_in == "SO")
check("a fourth is overtime", third.decided_in == "OT")
check("the crowd and the arena", (first.attendance, first.venue) == (7298, "Aby Arena"))
check("an empty arena is no crowd, not zero", third.attendance is None)

playoff = archive.parse_archive(PLAYOFF, 2025, "Ligan", "Slutspel Ligan")[0]
check("the round under a playoff fixture is not part of a club's name", playoff.away == "Aby IF", playoff.away)
check("playoffs have no shootout: extra periods are overtime", playoff.decided_in == "OT")

# --- finding meetings ---------------------------------------------------------------
LEAGUES = """
<a onclick="pageVisited('/ScheduleAndResults/Overview/900','SHL')">SHL</a>
<a onclick="pageVisited('/ScheduleAndResults/Overview/901','HockeyAllsvenskan')">HockeyAllsvenskan</a>
"""
PAGES = {
    "https://stats.swehockey.se/ScheduleAndResults/Live/": LEAGUES,
    "https://stats.swehockey.se/ScheduleAndResults/Overview/900": OVERVIEW,
    "https://stats.swehockey.se/ScheduleAndResults/Overview/901": OVERVIEW.replace("/900", "/901"),
    "https://stats.swehockey.se/ScheduleAndResults/Overview/800": SEASON,
    "https://stats.swehockey.se/ScheduleAndResults/Overview/700": "<ul></ul>",
    "https://stats.swehockey.se/ScheduleAndResults/Schedule/810": SCHEDULE,
    "https://stats.swehockey.se/ScheduleAndResults/Schedule/800": PLAYOFF,
    "https://stats.swehockey.se/ScheduleAndResults/Schedule/820": "<table></table>",
}
read = []


async def fetch(url):
    read.append(url)
    if url not in PAGES:
        raise api.HockeyApiError(f"no page {url}")
    return PAGES[url]


saved = {}


async def load_store():
    return None


def save(data):
    saved["data"] = data()


AABY = Team(key="AAA", name="Aby", short_name="Aby")
BSTAD = Team(key="BBB", name="Bstad", short_name="Bstad")
store = archive.Archive(fetch, load_store, save)
found, searched = run(store.async_meetings(AABY, BSTAD, seasons=2))
check("meetings in either order are found", len(found) == 3, found)
check("newest first", [game.start for game, _ in found] == ["2026-03-09T19:00", "2025-10-02T18:00", "2025-09-19T19:00"])
check("each says whether the first club was at home", [home for _, home in found] == [False, False, True])
check("a game against someone else is not a meeting", all("Cby IK" not in (g.home, g.away) for g, _ in found))
check("the seasons searched are named, both leagues", searched == ["2025-26 SHL", "2024-25 SHL", "2025-26 HockeyAllsvenskan", "2024-25 HockeyAllsvenskan"], searched)
check("the current season's games are not read: they are the league's own",
      not any(url.endswith(("/Schedule/900", "/Schedule/901")) for url in read), read)
check("what was read is kept", "810" in saved["data"]["series"] and saved["data"]["seasons"])

before = len(read)
again = archive.Archive(fetch, lambda: _stored(saved["data"]), save)


async def _stored(data):
    return data


found_again, _ = run(again.async_meetings(AABY, BSTAD, seasons=2))
schedules_read = [url for url in read[before:] if "/Schedule/" in url]
check("a finished series is read once, then kept across restarts", schedules_read == [], read[before:])
check("... and gives the same meetings", len(found_again) == 3)

done()
