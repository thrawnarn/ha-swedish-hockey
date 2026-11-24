"""Which goals are announced, and when a goal is announced again.

Every announcement is a message on someone's phone, so a goal must go out once.
The feed can serve a stale reading - the score a goal lower, then the goal back
on the next poll - and that must not send the same goal twice. A goal that
really is taken back, and replaced by another, is still news.
"""

from datetime import timedelta

import _rig
from _rig import check, done, load

api = load("api")
coordinator = load("coordinator")
Goal, LiveGame, Team, Game = api.Goal, api.LiveGame, api.Team, api.Game

BBB = Team(key="BBB", name="Bstad HC", short_name="Bstad")
HOME = Team(key="AAA", name="Aby IF", short_name="Aby")
GAME = Game(
    uid="g1",
    start=_rig._now,
    home=HOME,
    away=BBB,
    state="live",
    home_score=None,
    away_score=None,
)


class _Bus:
    def __init__(self):
        self.fired = []

    def async_fire(self, event, data):
        self.fired.append((event, data))


class _Schedule:
    def async_save_goal_log(self):
        pass


class _Hass:
    def __init__(self):
        self.bus = _Bus()
        self.state = _rig._CoreState.running


class _Entry:
    entry_id = "entry"


def live_coordinator():
    live = object.__new__(coordinator.LiveScoreCoordinator)
    live.hass = _Hass()
    live.config_entry = _Entry()
    live._team_key = "BBB"
    live._schedule = _Schedule()
    live._goal_log = {}
    live.game = GAME
    live.push = None
    live.data = None
    live._announce_on_start = False
    live.sheet = None
    live._sheet_game_uid = "g1"
    live._data_game_uid = None
    return live


def goal(score, time, scorer, assists=(), period="1"):
    return Goal(
        period=period,
        time=time,
        team_code="BBB",
        team_name="Bstad HC",
        score=score,
        note="EQ",
        scorer=scorer,
        assists=list(assists),
    )


def reading(*goals):
    return LiveGame(finished=False, decided_in=None, goals=list(goals))


def at(seconds):
    coordinator.dt_util.utcnow = lambda: _rig._now + timedelta(seconds=seconds)


def goals_fired(live):
    return [data["score"] for event, data in live.hass.bus.fired if event == coordinator.EVENT_GOAL]


def updates_fired(live):
    return [data for event, data in live.hass.bus.fired if event == coordinator.EVENT_GOAL_UPDATED]


FIRST = goal("0-1", "03:27", "#16 Ada Ek")
FIRST_ASSISTED = goal("0-1", "03:27", "#16 Ada Ek", ["#14 Bo Al"])
SECOND = goal("0-2", "04:46", "Cia Berg", ["Dan Ås"])
SECOND_NUMBERED = goal("0-2", "04:46", "#12 Cia Berg", ["#8 Dan Ås"])


def announce(live, seconds, game):
    at(seconds)
    live._async_announce(game, GAME, game)


# As seen live: 0-2, then a poll with only 0-1, then 0-2 again.
live = live_coordinator()
announce(live, 0, reading(FIRST))
live.async_set_goal_reference("g1", "0-1", "101")
announce(live, 80, reading(FIRST, SECOND))
live.async_set_goal_reference("g1", "0-2", "102")
announce(live, 90, reading(FIRST_ASSISTED))
announce(live, 110, reading(FIRST_ASSISTED, SECOND))
check(
    "a goal that drops off for one reading and comes back is announced once",
    goals_fired(live) == ["0-1", "0-2"],
    goals_fired(live),
)
details = live._goal_log["g1"]["details"]
check(
    "the goal taken back in keeps the reference to the message already sent",
    details["0-2"]["reference"] == "102",
    details["0-2"],
)
check(
    "the goal taken back in is on the list of goals announced",
    live._goal_log["g1"]["goals"] == ["0-1", "0-2"],
    live._goal_log["g1"]["goals"],
)

announce(live, 130, reading(FIRST_ASSISTED, SECOND_NUMBERED))
updates = updates_fired(live)
check(
    "what the returning goal adds goes out as an edit of the message sent",
    any(u["score"] == "0-2" and u["reference"] == "102" for u in updates),
    updates,
)

# A goal taken back for good and replaced by another one is news.
live = live_coordinator()
announce(live, 0, reading(FIRST))
announce(live, 60, reading(FIRST, SECOND))
announce(live, 120, reading(FIRST))
announce(live, 400, reading(FIRST, goal("0-2", "09:12", "#36 Eva Lind")))
check(
    "a different player's goal at the same score is announced",
    goals_fired(live) == ["0-1", "0-2", "0-2"],
    goals_fired(live),
)

live = live_coordinator()
announce(live, 0, reading(FIRST))
announce(live, 60, reading(FIRST, SECOND))
announce(live, 120, reading(FIRST))
announce(live, 120 + 6 * 60, reading(FIRST, SECOND))
check(
    "a goal back after the feed has shown it gone for minutes is announced again",
    goals_fired(live) == ["0-1", "0-2", "0-2"],
    goals_fired(live),
)

live = live_coordinator()
announce(live, 0, reading(FIRST))
announce(live, 60, reading(FIRST, SECOND))
announce(live, 120, reading(FIRST))
announce(live, 140, reading(FIRST, goal("0-2", "07:30", None)))
check(
    "a goal at the same score minutes later on the clock is a new goal",
    goals_fired(live) == ["0-1", "0-2", "0-2"],
    goals_fired(live),
)

# A game that ended while Home Assistant was restarting.
live = live_coordinator()
live.hass.state = _rig._CoreState.starting
finished = LiveGame(finished=True, decided_in=None, goals=[FIRST])
live._goal_log["g1"] = {"goals": ["0-1"], "ended": False, "details": {}}
_rig.started.clear()
announce(live, 0, finished)
check(
    "nothing is announced before Home Assistant has started, nor marked as sent",
    not live.hass.bus.fired and live._goal_log["g1"]["ended"] is False,
    live.hass.bus.fired,
)
announce(live, 5, finished)
check("it asks once to be called when Home Assistant has started", len(_rig.started) == 1, _rig.started)
live.hass.state = _rig._CoreState.running
live.data = finished
_rig.started[0](live.hass)
check(
    "and then the end goes out",
    [event for event, _ in live.hass.bus.fired] == [coordinator.EVENT_GAME_END],
    live.hass.bus.fired,
)

# A goal update held for a reference looks again later, on the loop.
live = live_coordinator()
_rig.calls_later.clear()
announce(live, 0, reading(FIRST))
announce(live, 10, reading(FIRST_ASSISTED))
check(
    "the look again after the reference wait is a callback method, not a lambda",
    _rig.calls_later and getattr(_rig.calls_later[-1][1], "__name__", "") == "_async_look_again",
    _rig.calls_later,
)

# A game the league publishes finished at 0-0 although it was won in overtime
# (Västerås-Leksand 2026-11-13 went out as a loss): the end waits for the
# federation's sheet, and goes out with its score.
swehockey = load("swehockey")


def sheet(*periods):
    side = swehockey.SideSheet()
    return swehockey.GameSheet(game_id="1", home=side, away=side, period_scores=periods)


def ends(live):
    return [data for event, data in live.hass.bus.fired if event == coordinator.EVENT_GAME_END]


level = LiveGame(finished=True, decided_in="OT", goals=[])
live = live_coordinator()
live._goal_log["g1"] = {"goals": [], "ended": False, "details": {}}
live._data_game_uid = "g1"
announce(live, 0, level)
check(
    "a finished game with a level score is not announced as over",
    not ends(live) and live._goal_log["g1"]["ended"] is False,
    live.hass.bus.fired,
)
check("and the coordinator says it is waiting on the result", live.awaiting_result())
live.sheet = sheet("0-0", "0-0", "0-0", "0-1")
announce(live, 120, level)
end = ends(live)
check(
    "once the sheet has the winning goal, the end goes out with the sheet's score",
    len(end) == 1 and end[0]["score"] == "0-1" and end[0]["decided_in"] == "OT",
    end,
)
check("and the away side that scored it won", end and end[0]["we_won"] is True, end)
check("and nothing is waited on any more", not live.awaiting_result())
announce(live, 180, level)
check("the end goes out once", len(ends(live)) == 1, ends(live))

live = live_coordinator()
live._goal_log["g1"] = {"goals": [], "ended": False, "details": {}}
live.sheet = sheet("1-0", "0-1", "0-0", "0-0", "1-0")
announce(live, 0, level)
end = ends(live)
check(
    "a fifth period on the sheet is a shootout, won here by the home side",
    len(end) == 1 and end[0]["score"] == "2-1" and end[0]["decided_in"] == "SO"
    and end[0]["we_won"] is False,
    end,
)

live = live_coordinator()
live._goal_log["g1"] = {"goals": [], "ended": False, "details": {}}
announce(live, 0, level)
announce(live, 29 * 60, level)
check("nothing goes out while the wait lasts", not ends(live), ends(live))
announce(live, 30 * 60, level)
end = ends(live)
check(
    "after the wait the end goes out without a winner rather than not at all",
    len(end) == 1 and end[0]["we_won"] is None and end[0]["score"] == "0-0",
    end,
)

live = live_coordinator()
live._goal_log["g1"] = {"goals": [], "ended": False, "details": {}}
announce(live, 4 * 3600 - 60, level)
check(
    "the end goes out before the live window closes, however short the wait",
    len(ends(live)) == 1,
    ends(live),
)

check(
    "the shirt number does not make a scorer someone else",
    coordinator._same_goal(SECOND_NUMBERED, True, SECOND.as_dict() | {"ours": True}),
)
check(
    "a goal by the other side is not the same goal",
    not coordinator._same_goal(SECOND, False, SECOND.as_dict() | {"ours": True}),
)

done()
