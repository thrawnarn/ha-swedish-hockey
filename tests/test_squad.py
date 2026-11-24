"""The clubs' squads in figures, and each club's place among the others.

Both leagues' profiles go through the same sums: Hockeyallsvenskan writes
positions as LW/CE/RD and countries in three letters, the SHL as F/D/GK and
in two, and either may leave a field empty or put a zero in it.
"""

from datetime import date

from _rig import check, done, load

api = load("api")
squad = load("squad")
Team = api.Team

AAA = Team(key="AAA", name="Aby IF", short_name="Aby")
BBB = Team(key="BBB", name="Bstad HC", short_name="Bstad")
TEAMS = {"AAA": AAA, "BBB": BBB}
TODAY = date(2026, 10, 22)


def find(*spellings):
    for spelling in spellings:
        if spelling in TEAMS:
            return TEAMS[spelling]
    return None


def player(team, name, position, height, weight, born, shoots="L", country="SWE"):
    return {
        "team": team,
        "name": name,
        "position_code": position,
        "height": height,
        "weight": weight,
        "birth_date": born,
        "shoots": shoots,
        "country": country,
    }


profiles = [
    player("AAA", "Anders Ett", "GK", 190, 90, "1996-10-22"),
    player("AAA", "Bertil Två", "LD", 186, 88, "2000-10-22", "R", "FIN"),
    player("AAA", "Carl Tre", "CE", 180, 80, "2004-10-22"),
    # A zero is a gap in the record, not a player of no height.
    player("AAA", "David Fyra", "RW", 0, None, None, None, None),
    player("BBB", "Erik Fem", "G", 184, 84, "1990-10-22", "Right", "SE"),
    player("BBB", "Filip Sex", "F", 182, 82, "1998-10-22", "left", "CA"),
    # Not a club in this league: left out of everything.
    player("ZZZ", "Gustav Sju", "F", 200, 120, "1980-01-01"),
]
result = squad.squad_figures(profiles, find, TODAY)
teams = {row["team_code"]: row for row in result["teams"]}
aaa, bbb = teams["AAA"], teams["BBB"]

check("a club outside the league is left out", set(teams) == {"AAA", "BBB"}, teams.keys())
check("every registered player is counted", aaa["players"] == 4, aaa["players"])
check("the average leaves the gaps out", aaa["height"] == 185.3 and aaa["weight"] == 86.0, aaa)
check("age comes from the birth date", aaa["age"] == 26.0 and bbb["age"] == 32.0, (aaa["age"], bbb["age"]))
check(
    "positions are grouped whichever way the league writes them",
    set(aaa["positions"]) == {"gk", "d", "f"} and set(bbb["positions"]) == {"gk", "f"},
    (aaa["positions"], bbb["positions"]),
)
check("a group's figures are its own", aaa["positions"]["f"]["height"] == 180.0, aaa["positions"]["f"])
check("shots are read from either spelling", bbb["shoots"] == {"left": 1, "right": 1}, bbb["shoots"])
check(
    "countries come out in two letters with a Swedish name, most first",
    aaa["countries"][0] == {"country": "SE", "name": "Sverige", "players": 2}
    and aaa["countries"][1]["name"] == "Finland",
    aaa["countries"],
)
check("home grown counts Swedes", aaa["home_grown"] == 2 and bbb["home_grown"] == 1)
check("the tallest is named", aaa["tallest"] == {"player": "Anders Ett", "value": 190}, aaa["tallest"])
check("the youngest is named with his age", aaa["youngest"]["player"] == "Carl Tre", aaa["youngest"])
check("first place is the tallest", aaa["ranks"]["height"] == 1 and bbb["ranks"]["height"] == 2)
check("... and the oldest", bbb["ranks"]["age"] == 1, bbb["ranks"])
check("the league is everyone in it", result["league"]["players"] == 6, result["league"])
check("the league names its clubs", result["league"]["clubs"] == 2)

level = squad.squad_figures(
    [player("AAA", "A", "F", 180, 80, "2000-01-01"), player("BBB", "B", "F", 180, 81, "2000-01-01")],
    find,
    TODAY,
)
check("level clubs share a place", [row["ranks"]["height"] for row in level["teams"]] == [1, 1])

shl = api._shl_profile(
    "AAA",
    {"positionCode": "D"},
    {"uuid": "x", "fullName": "Hans Åtta", "jerseyNumber": 8, "nationality": "SE"},
    {"height": 188, "weight": 91, "dateOfBirth": "1999-05-01", "shoots": "Left"},
)
check(
    "an SHL player comes out in the shape of a Hockeyallsvenskan profile",
    shl["position_code"] == "D" and shl["shoots"] == "L" and shl["height"] == 188
    and shl["birth_date"] == "1999-05-01" and shl["team"] == "AAA",
    shl,
)

done()
