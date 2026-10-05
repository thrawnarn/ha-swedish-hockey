"""The helpers every league payload goes through.

A club answers to several names (LIF, Leksand, Leksands IF) and which one a
payload carries varies from endpoint to endpoint, so matching on anything but
the club code has to be forgiving in a precise way. These pin that down, along
with the small parsers the feeds lean on.
"""

from datetime import datetime, timezone

from _rig import check, done, load

api = load("api")
Team = api.Team

TEAMS = {
    "LIF": Team(key="LIF", name="Leksands IF", short_name="Leksand"),
    "SSK": Team(key="SSK", name="Södertälje SK", short_name="Södertälje"),
    "VIS": Team(key="VIS", name="Visby/Roma", short_name="Visby/Roma"),
    "VHC": Team(key="VHC", name="Vimmerby HC", short_name="Vimmerby"),
    "MODO": Team(key="MODO", name="MoDo Hockey", short_name="MoDo"),
}

# --- club_key ---------------------------------------------------------------
check("club_key keeps letters and digits only", api.club_key("Leksands IF") == "leksandsif")
check("club_key folds case and Swedish letters alike", api.club_key("ÖREBRO hk") == "örebrohk")
check("club_key of nothing is empty", api.club_key(None) == "")

# --- match_team -------------------------------------------------------------
check("a club code matches outright", api.match_team(TEAMS, "LIF") is TEAMS["LIF"])
check("a code matches whatever its case", api.match_team(TEAMS, "lif") is TEAMS["LIF"])
check("the short name matches", api.match_team(TEAMS, "Leksand") is TEAMS["LIF"])
check("the full name matches", api.match_team(TEAMS, "Leksands IF") is TEAMS["LIF"])
check(
    "the device's short spelling finds the club the schedule spells in full",
    api.match_team(TEAMS, "Södertälje") is TEAMS["SSK"],
)
check(
    "a name the league writes with a slash still matches",
    api.match_team(TEAMS, "Visby Roma") is TEAMS["VIS"],
)
check("an unknown club matches nothing", api.match_team(TEAMS, "Frölunda") is None)
check("an empty name matches nothing", api.match_team(TEAMS, "  ") is None)

# --- parse_score ------------------------------------------------------------
check("a plain score splits into home and away", api.parse_score("3-2") == (3, 2))
check("an en dash works as well as a hyphen", api.parse_score("1–4") == (1, 4))
check("spaces round the dash are ignored", api.parse_score(" 10 - 0 ") == (10, 0))
check("half a score is no score", api.parse_score("3") is None)
check("no score is no score", api.parse_score(None) is None)

# --- season_year ------------------------------------------------------------
check(
    "October belongs to the season that began that year",
    api.season_year(datetime(2026, 10, 5, tzinfo=timezone.utc)) == 2026,
)
check(
    "March belongs to the season that began the year before",
    api.season_year(datetime(2027, 3, 1, tzinfo=timezone.utc)) == 2026,
)
check(
    "July starts the new season",
    api.season_year(datetime(2027, 7, 1, tzinfo=timezone.utc)) == 2027,
)

# --- goal clock and strength ------------------------------------------------
check("Hockeyallsvenskan's seconds become mm:ss", api._clock("77") == "01:17")
check("a whole period of seconds is 16:00", api._clock("960") == "16:00")
check("SHL's ready-made clock is kept", api._clock("09:07") == "09:07")
check("no time is None", api._clock("") is None)
check("PP1 is a power play goal", api._strength("PP1") == "PP")
check("SH2 is a boxplay goal, BP in Swedish", api._strength("sh2") == "BP")
check("an even-strength goal says nothing", api._strength("EQ") is None)

# --- carousel headings ------------------------------------------------------
check(
    "a carousel heading that is the everyday name is the club",
    api._is_club("Leksand", TEAMS["LIF"]),
)
check(
    "a code only counts as an outright match: VIS is not Vimmerby's",
    not api._is_club("VIS", TEAMS["VHC"]),
)

done()
