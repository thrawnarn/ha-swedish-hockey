"""How two clubs come into a game, from the season in memory.

A preview is only worth reading if its numbers are the ones a table would
give: a shootout win is a win but not three points, a run of wins goes on
through overtime, home form is home games only, and this season's meetings
are counted from the side the reader is looking from.
"""

from datetime import date, datetime, timedelta, timezone

from _rig import check, done, load

api = load("api")
matchup = load("matchup")
Team, Game = api.Team, api.Game

AAA = Team(key="AAA", name="Aby IF", short_name="Aby")
BBB = Team(key="BBB", name="Bstad HC", short_name="Bstad")
CCC = Team(key="CCC", name="Cby IK", short_name="Cby")
START = datetime(2026, 9, 1, 17, 0, tzinfo=timezone.utc)


def game(day, home, away, home_score=None, away_score=None, decided_in="FT", uid=None):
    played = home_score is not None
    return Game(
        uid=uid or f"g{day}-{home.key}-{away.key}",
        start=START + timedelta(days=day),
        home=home,
        away=away,
        state="post-game" if played else "pre-game",
        home_score=home_score,
        away_score=away_score,
        decided_in=decided_in if played else None,
    )


GAMES = [
    game(0, AAA, BBB, 3, 1),            # AAA win at home
    game(2, CCC, AAA, 2, 3, "OT"),      # AAA overtime win away
    game(4, AAA, CCC, 1, 2, "SO"),      # AAA shootout loss at home
    game(6, BBB, AAA, 4, 0),            # AAA loss away, against BBB
    game(8, AAA, BBB, 2, 1, "SO"),      # AAA shootout win at home, against BBB
    game(10, AAA, BBB),                  # to come
    game(12, BBB, AAA),                  # to come
]

# --- one game from one side -------------------------------------------------
check("a regulation win is a win", matchup.outcome(GAMES[0], "AAA") == "win")
check("... and the same game a loss for the other side", matchup.outcome(GAMES[0], "BBB") == "loss")
check("an overtime win is kept apart", matchup.outcome(GAMES[1], "AAA") == "otwin")
check("a shootout loss is an overtime loss", matchup.outcome(GAMES[2], "AAA") == "otloss")
check("a game not played has no outcome", matchup.outcome(GAMES[5], "AAA") is None)
check("nor has a game the club is not in", matchup.outcome(GAMES[1], "BBB") is None)

# --- record and points ----------------------------------------------------------
rec = matchup.record(GAMES, "AAA")
check("the record counts each kind of result",
      (rec["wins"], rec["overtime_wins"], rec["overtime_losses"], rec["losses"]) == (1, 2, 1, 1), rec)
check("points are 3-2-1-0", rec["points"] == 3 + 2 + 2 + 1 + 0, rec)
check("goals for and against are counted from the club's side",
      (rec["goals_for"], rec["goals_against"]) == (3 + 3 + 1 + 0 + 2, 1 + 2 + 2 + 4 + 1), rec)
check("games to come are not in a record", rec["games"] == 5)

# --- runs -------------------------------------------------------------------------
check("a single win after a loss is a run of one",
      matchup.streak(GAMES[:5], "AAA") == {"kind": "win", "count": 1})
check("a run of wins goes on through an overtime win",
      matchup.streak(GAMES[:2], "AAA") == {"kind": "win", "count": 2})
check("a shootout loss continues a run of losses",
      matchup.streak(GAMES[:4], "AAA") == {"kind": "loss", "count": 2})
check("no games, no run", matchup.streak([], "AAA") is None)

# --- form ------------------------------------------------------------------------
form = matchup.form_of(GAMES[:5], "AAA", 3)
check("form is the last few games, oldest first",
      [entry["result"] for entry in form] == ["otloss", "loss", "otwin"], form)
check("... each written from the club's side", form[1]["score"] == "0-4" and form[1]["opponent"] == "BBB")
check("asking for no form gives none", matchup.form_of(GAMES, "AAA", 0) == [])

# --- coming into a game ---------------------------------------------------------
summary = matchup.team_summary(
    GAMES, AAA, GAMES[5].start, local_date=lambda moment: moment.date(), form_games=5
)
check("home form is home games only",
      [entry["is_home"] for entry in summary["home_form"]] == [True, True, True])
check("away form is away games only",
      [entry["is_home"] for entry in summary["away_form"]] == [False, False])
check("the home record is the home games'", summary["home_record"]["games"] == 3)
check("rest is the days since the last game", summary["rest_days"] == 2)
check("the last game names who it was against", summary["last_game"]["opponent_name"] == "Bstad HC")
check("the summary carries the club", summary["team_code"] == "AAA")

later = matchup.team_summary(GAMES, AAA, GAMES[6].start, local_date=lambda m: m.date())
check("rest for a game further off is from the game before it, played or not",
      later["rest_days"] == 2 and later["last_game"]["start"] == GAMES[4].start.isoformat())

early = matchup.team_summary(GAMES, AAA, GAMES[2].start, local_date=lambda m: m.date())
check("only games before the one previewed count", early["record"]["games"] == 2)

fresh = matchup.team_summary([], CCC, START, local_date=lambda m: m.date())
check("a club yet to play has empty form and no rest", fresh["form"] == [] and fresh["rest_days"] is None)

# --- meetings ------------------------------------------------------------------------
between = matchup.meetings(GAMES, "AAA", "BBB")
check("every game between the two, played and to come, in order",
      [g.start.day for g in between] == [1, 7, 9, 11, 13])
results = [
    {"home_code": g.home.key, "home_score": g.home_score, "away_score": g.away_score, "decided_in": g.decided_in}
    for g in between
]
h2h = matchup.head_to_head(results, "AAA")
check("meetings are counted from the side asked about",
      (h2h["games"], h2h["wins"], h2h["losses"]) == (3, 2, 1), h2h)
check("... with the goals each way", (h2h["goals_for"], h2h["goals_against"]) == (5, 6), h2h)
check("... and how many needed more than sixty minutes", h2h["overtime"] == 1, h2h)
check("from the other side it is the mirror", matchup.head_to_head(results, "BBB")["wins"] == 1)

done()
