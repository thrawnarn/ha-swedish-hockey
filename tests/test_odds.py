"""Svenska Spel's odds for games still to come.

The bookmaker's list is Kambi's, in its own shape and with its own spelling
of the clubs. What matters: only the three-way regular-time market is taken,
in decimals; a game already started, or one without that market open, has no
odds; the odds land on the right game even where the bookmaker spells a club
differently; the list is read once every few minutes; and a list that cannot
be read leaves the last odds in place rather than failing anything.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from _rig import check, done, load

api = load("api")
odds = load("odds")
Team, Game = api.Team, api.Game
run = asyncio.run

START = datetime(2026, 10, 7, 17, 0, tzinfo=timezone.utc)


def event(eid, home, away, prices, state="NOT_STARTED", start=START, status="OPEN", label="Match Odds - Ordinarie tid"):
    outcomes = [
        {"type": kind, "odds": price, "status": status, "label": mark}
        for kind, price, mark in zip(("OT_ONE", "OT_CROSS", "OT_TWO"), prices, ("1", "X", "2"))
    ]
    return {
        "event": {
            "id": eid,
            "homeName": home,
            "awayName": away,
            "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "state": state,
        },
        "betOffers": [{"criterion": {"label": label}, "outcomes": outcomes, "tags": ["MAIN"]}],
    }


PAYLOAD = {
    "events": [
        event(1, "Leksands IF", "Nybro Vikings IF", (1380, 5800, 6750)),
        event(2, "Rögle BK", "HV 71", (1750, 4500, 4250)),
        event(3, "Almtuna IS", "AIK", (2100, 4200, 2900), state="STARTED"),
        event(4, "BIK Karlskoga", "Mora IK", (1750, 4700, 3900), status="SUSPENDED"),
        {"event": {"id": 5, "homeName": "A", "awayName": "B", "start": "nonsense", "state": "NOT_STARTED"}, "betOffers": []},
    ]
}

# --- reading the list -----------------------------------------------------------
listings = odds.parse_odds(PAYLOAD)
check("games with the main market open are read", [l.home for l in listings] == ["Leksands IF", "Rögle BK"], listings)
first = listings[0].odds
check("odds are decimals, not Kambi's thousandths", (first["home"], first["draw"], first["away"]) == (1.38, 5.8, 6.75), first)
check("the market says what it covers", first["market"] == "Ordinarie tid")
check("and where the odds come from", first["source"] == "Svenska Spel")
check("a game already started has no odds here", all(l.home != "Almtuna IS" for l in listings))
check("a suspended market is no odds", all(l.home != "BIK Karlskoga" for l in listings))
check("an empty answer is no odds", odds.parse_odds({}) == [] and odds.parse_odds(None) == [])

# --- onto the league's games ------------------------------------------------------
LIF = Team(key="LIF", name="Leksand", short_name="Leksand")
NVIF = Team(key="NVIF", name="Nybro Vikings", short_name="Nybro")
RBK = Team(key="RBK", name="Rögle BK", short_name="Rögle")
HV71 = Team(key="HV71", name="HV71", short_name="HV71")
GAMES = [
    Game(uid="g1", start=START, home=LIF, away=NVIF),
    Game(uid="g2", start=START + timedelta(days=1), home=RBK, away=HV71),
    Game(uid="g3", start=START - timedelta(days=3), home=LIF, away=RBK, state="post-game", home_score=2, away_score=1),
]


class Response:
    def __init__(self, payload, fail=False):
        self.payload, self.fail = payload, fail

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def raise_for_status(self):
        if self.fail:
            raise api.HockeyApiError("503")

    async def json(self, content_type=None):
        return self.payload


class Session:
    def __init__(self, payload):
        self.payload, self.calls, self.fail = payload, 0, False

    def get(self, url, **kwargs):
        self.calls += 1
        self.url = url
        return Response(self.payload, self.fail)


# The bookmaker's Rögle game starts a day later than its listed start here,
# so it must not pair with g1; it pairs with g2 by time and one club's name.
PAYLOAD["events"][1] = event(2, "Rögle BK", "HV 71", (1750, 4500, 4250), start=START + timedelta(days=1))
session = Session(PAYLOAD)
book = odds.OddsBook(session, "hockeyallsvenskan")
found = run(book.async_odds(GAMES))
check("each game gets its own odds", found["g1"]["home"] == 1.38 and found["g2"]["away"] == 4.25, found)
check("a club spelled the bookmaker's way still finds its game", "g2" in found)
check("a game already played gets none", "g3" not in found)
check("the league's list is asked for", session.url.endswith("/listView/ice_hockey/sweden/hockeyallsvenskan/all/matches.json"))
check("each carries when it was read", bool(found["g1"].get("updated")))

run(book.async_odds(GAMES))
check("the list is read once every few minutes", session.calls == 1)

book._read_at -= odds.ODDS_TTL + 1
session.fail = True
kept = run(book.async_odds(GAMES))
check("a list that cannot be read leaves the last odds", kept["g1"]["home"] == 1.38 and session.calls == 2)
run(book.async_odds(GAMES))
check("... and is not asked again on every call", session.calls == 2)

check("a league the bookmaker does not list has no odds",
      run(odds.OddsBook(Session(PAYLOAD), "elsewhere").async_odds(GAMES)) == {})

done()
