"""Constants for the Svensk hockey integration."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "swedish_hockey"

CONF_LEAGUE = "league"
CONF_TEAMS = "teams"
CONF_GAME_DURATION = "game_duration"
CONF_LIVE_INTERVAL = "live_interval"

LEAGUE_SHL = "shl"
LEAGUE_HOCKEYALLSVENSKAN = "hockeyallsvenskan"

LEAGUE_NAMES: dict[str, str] = {
    LEAGUE_SHL: "SHL",
    LEAGUE_HOCKEYALLSVENSKAN: "Hockeyallsvenskan",
}

# A hockey game lasts three 20 minute periods plus two intermissions; 2.5 hours
# is what the leagues themselves budget for a broadcast slot.
DEFAULT_GAME_DURATION = 150
MIN_GAME_DURATION = 30
MAX_GAME_DURATION = 480

# The schedule itself barely moves, but the league table and the results ride
# along with it, and those change every game night. The coordinator also
# refreshes as soon as a night's games are over, so this is the backstop rather
# than the mechanism - and `homeassistant.update_entity` on any of the
# calendars forces a refresh whenever you want it sooner still.
SCAN_INTERVAL = timedelta(hours=6)
# The league enters a result at the final whistle but republishes its table
# some while later, so a table read as a game ends can still be missing it.
# Until it counts every finished game it is read again at this pace.
TABLE_BEHIND_INTERVAL = timedelta(minutes=10)

# Live scoring polls only while a game is actually on. Outside that window the
# coordinator still wakes up, but makes no API call - it just works out how long
# to sleep until the next puck drop.
# How often to re-read a game in progress. Hockeyallsvenskan's own site polls
# this feed every 60s; 20 is brisker without being rude, and it is a setting so
# it can be tuned without touching code.
DEFAULT_LIVE_INTERVAL = 20
MIN_LIVE_INTERVAL = 10
MAX_LIVE_INTERVAL = 300
LIVE_IDLE_MIN = timedelta(minutes=1)
LIVE_IDLE_MAX = timedelta(hours=1)
LIVE_WINDOW_BEFORE = timedelta(minutes=5)
# The live table reads every game being played in the league, not just the
# followed one, so it runs at its own slower cadence - a table that is a minute
# behind a goal in someone else's game is still a useful table.
LIVE_TABLE_INTERVAL = timedelta(minutes=2)
LIVE_WINDOW_AFTER = timedelta(hours=4)
# After a restart, a game that finished this recently is re-read once so the
# match log and result come back. Once read it is not fetched again.
LIVE_RECENT_AFTER = timedelta(hours=12)

# Highlight clips turn up some time after the final whistle - usually within a
# couple of hours, now and then not until the next morning. The page is read
# often for a while after a game and left alone for the rest of the day.
HIGHLIGHTS_INTERVAL = timedelta(minutes=15)
HIGHLIGHTS_IDLE = timedelta(hours=6)
HIGHLIGHTS_AFTER = timedelta(hours=8)

# How many games of form to show beside a team in the table.
FORM_GAMES = 5

STATE_PRE_GAME = "pre-game"
STATE_ONGOING = "ongoing"
STATE_POST_GAME = "post-game"
