"""How often Hockeyallsvenskan's play-by-play is asked, and what a refusal does.

StatNet's play-by-play refuses an address that asks too often (429), and on a
game night one reading every poll was refused most of the time - each refusal
a reading without scorers. So it is read when the game record, which is not
limited, shows a goal or the end, or once a minute otherwise; a refusal stops
all asking for a while; and a reading just made answers whoever asks next.
"""

import asyncio
import types
from datetime import datetime, timezone

from _rig import check, done, load

api = load("api")
Game, Team = api.Game, api.Team

clock = {"now": 1000.0}
api.time = types.SimpleNamespace(monotonic=lambda: clock["now"])

GAME = Game(
    uid="g1",
    start=datetime(2026, 10, 5, 17, 0, tzinfo=timezone.utc),
    home=Team(key="AAA", name="Aby IF", short_name="Aby"),
    away=Team(key="BBB", name="Bstad HC", short_name="Bstad"),
    state="live",
    stat_net_number="101",
    home_ext_id="AAA",
    away_ext_id="BBB",
)


def pbp_goal(score, seconds, scorer):
    return {
        "type": "Goal",
        "time": str(seconds),
        "eventDescription": "EQ",
        "runningScore": score,
        "team": {"name": "Bstad HC", "code": "BBB"},
        "player": {"name": scorer, "jerseyToday": "12"},
    }


class Client(api.HockeyallsvenskanClient):
    """The real client with the two sites replaced by what a test says."""

    def __init__(self):
        super().__init__(None)
        self.goals = []
        self.record = {"homeScore": "0", "awayScore": "0", "currentPeriod": "P1"}
        self.refuse = False
        self.posts = 0
        self.gets = 0

    async def _async_post(self, url, payload):
        self.posts += 1
        if self.refuse:
            raise api.HockeyRateLimited("Too many requests")
        return {"game_info": {}, "game_events": [{"Period": 1, "Events": list(self.goals)}]}

    async def _async_get(self, url, **kwargs):
        self.gets += 1
        return {"data": [dict(self.record)]}


def read(client, previous=None, *, at, fresh=False):
    clock["now"] = 1000.0 + at
    return asyncio.run(client.async_live_game(GAME, previous, fresh=fresh))


# A poll every 20 seconds with nothing happening.
client = Client()
live = read(client, at=0)
for at in (20, 40):
    live = read(client, live, at=at)
check("with nothing on the record, play-by-play is not read again within a minute", client.posts == 1, client.posts)
live = read(client, live, at=60)
check("a minute on, it is read for the shots and events in between", client.posts == 2, client.posts)

# A goal: the record has it before the next quiet minute is up.
client.goals = [pbp_goal("0-1", 200, "Ada Ek")]
client.record["awayScore"] = "1"
live = read(client, live, at=80)
check("a goal on the record has play-by-play read at once", client.posts == 3, client.posts)
check("and the reading names the scorer", live.goals and live.goals[-1].scorer == "#12 Ada Ek", live.goals)

client.record["currentPeriod"] = "P2"
live = read(client, live, at=100)
check("a new period on the record is taken from the record", live.current_period == "2" and client.posts == 3, (live.current_period, client.posts))

client.record["awayScore"] = "0"
live = read(client, live, at=120)
check("a record behind the last reading is not news", client.posts == 3 and live.score == "0-1", (client.posts, live.score))
client.record["awayScore"] = "1"

live = read(client, live, at=125, fresh=True)
check("the push stream's goal asks for a fresh reading regardless", client.posts == 4, client.posts)

# Refused.
client = Client()
live = read(client, at=0)
client.refuse = True
client.goals = [pbp_goal("0-1", 200, "Ada Ek")]
client.record["awayScore"] = "1"
live = read(client, live, at=20)
check("a refusal falls back to the record, which still has the goal", live.score == "0-1" and live.goals[-1].scorer is None, live.goals)
posts = client.posts
for at in (40, 60, 79):
    live = read(client, live, at=at, fresh=True)
check("after a refusal nothing more is asked for a minute, even on a goal", client.posts == posts, client.posts - posts)
live = read(client, live, at=81)
check("a minute on it is asked again", client.posts == posts + 1, client.posts - posts)
posts = client.posts
live = read(client, live, at=81 + 119)
check("a second refusal in a row waits twice as long", client.posts == posts, client.posts - posts)
client.refuse = False
live = read(client, live, at=81 + 121)
check("and once answered, the scorer the record could not give comes in", live.goals[-1].scorer == "#12 Ada Ek", live.goals)
live = read(client, live, at=81 + 141)
check("once the scorer is known, the quiet minute applies again", client.posts == posts + 1, client.posts - posts)

client = Client()
client.refuse = True
for at in range(0, 3000, 20):
    read(client, None, at=at, fresh=True)
check("refusals going on all night wait five minutes at most", client._pbp_backoff == api.HA_PBP_BACKOFF_MAX, client._pbp_backoff)

# A service asking just after the live sensor read the game.
client = Client()
live = read(client, at=0)
gets = client.gets
answer = read(client, None, at=10)
check("a reading under half a minute old answers a service without asking", client.posts == 1 and client.gets == gets and answer is live, client.posts)
read(client, None, at=40)
check("an older one is read again", client.posts == 2, client.posts)

done()
