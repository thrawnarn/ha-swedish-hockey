"""Goalkeepers coming and going, as a game's summary tells it.

The feeds log both goalkeepers in at the start and out at the final whistle,
and the SHL's at every period's end and start too. A summary keeps only what
a reader would want told - who started, who replaced whom, who was pulled
for an extra skater and came back - and says which it was.
"""

from _rig import check, done, load

api = load("api")
GameEvent = api.GameEvent


def event(kind, period, clock, team, player):
    minutes, seconds = clock.split(":")
    return GameEvent(
        kind=kind,
        period=period,
        time=clock,
        seconds=int(minutes) * 60 + int(seconds),
        team_code=team,
        team_name=None,
        player=player,
    )


def rank(period):
    return int(period) if str(period).isdigit() else {"OT": 4, "SO": 5}.get(period, 99)


def told(events):
    return [
        (e.kind, e.team_code, e.player, e.detail)
        for e in api.goalie_moves(events, rank)
        if e.kind.startswith("goalie")
    ]


game = [
    event("goalie_in", "1", "00:00", "AAA", "#1 Anders Ett"),
    event("goalie_in", "1", "00:00", "BBB", "#30 Bertil Två"),
    event("goalie_out", "1", "20:00", "AAA", "#1 Anders Ett"),
    event("goalie_in", "2", "00:00", "AAA", "#1 Anders Ett"),
    event("goalie_out", "2", "09:57", "AAA", "#1 Anders Ett"),
    event("goalie_in", "2", "09:57", "AAA", "#35 Carl Tre"),
    event("goalie_out", "3", "18:00", "BBB", "#30 Bertil Två"),
    event("goal", "3", "18:20", "AAA", "#9 David Fyra"),
    event("goalie_in", "3", "18:31", "BBB", "#30 Bertil Två"),
    event("goalie_out", "3", "20:00", "AAA", "#35 Carl Tre"),
    event("goalie_out", "3", "20:00", "BBB", "#30 Bertil Två"),
]
moves = told(game)
check("both starters are named", moves[:2] == [
    ("goalie_in", "AAA", "#1 Anders Ett", "Startar i mål"),
    ("goalie_in", "BBB", "#30 Bertil Två", "Startar i mål"),
], moves)
check(
    "a change of goalkeeper says who replaced whom",
    moves[2:4] == [
        ("goalie_out", "AAA", "#1 Anders Ett", "Byts ut"),
        ("goalie_in", "AAA", "#35 Carl Tre", "Ersätter #1 Anders Ett"),
    ],
    moves,
)
check(
    "a pulled goalkeeper goes off for a skater and comes back",
    moves[4:] == [
        ("goalie_out", "BBB", "#30 Bertil Två", "Ut för en extra utespelare"),
        ("goalie_in", "BBB", "#30 Bertil Två", "Tillbaka i mål"),
    ],
    moves,
)
check("the period breaks and the final whistle are left out", len(moves) == 6, moves)
check(
    "everything else is passed through untouched",
    [e.kind for e in api.goalie_moves(game, rank)].count("goal") == 1,
)

overtime = [
    event("goalie_in", "1", "00:00", "AAA", "#1 Anders Ett"),
    event("goalie_out", "OT", "05:00", "AAA", "#1 Anders Ett"),
    event("goal", "SO", "00:00", "AAA", "#9 David Fyra"),
]
check("overtime ends at five minutes, not twenty", told(overtime) == [
    ("goalie_in", "AAA", "#1 Anders Ett", "Startar i mål"),
], told(overtime))

done()
