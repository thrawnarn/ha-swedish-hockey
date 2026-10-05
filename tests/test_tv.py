"""Pairing tv.nu's listings with the league's games.

Neither league says which channel shows a game, so tv.nu's league page is read
and its listings matched to games by start time and club name. tv.nu writes
the clubs its own way ("AIK IF", "VIK Västerås"), so the name rule has to
accept a genitive or a suffix without letting VIK claim Nybro Vikings.
"""

from datetime import datetime, timedelta, timezone

from _rig import check, done, load

api = load("api")
tv = load("tv")
Team = api.Team

LIF = Team(key="LIF", name="Leksands IF", short_name="Leksand")
AIK = Team(key="AIK", name="AIK", short_name="AIK")
VIK = Team(key="VIK", name="Västerås IK", short_name="Västerås")
NYB = Team(key="NYB", name="Nybro Vikings", short_name="Nybro")
MODO = Team(key="MODO", name="MoDo Hockey", short_name="MoDo")
BIK = Team(key="BIK", name="BIK Karlskoga", short_name="Karlskoga")

START = datetime(2026, 10, 7, 17, 0, tzinfo=timezone.utc)


def game(uid, home, away, start=START):
    return api.Game(uid=uid, start=start, home=home, away=away)


def listing(home, away, channels, start=START):
    return tv.TvListing(start=start, home=home, away=away, channels=tuple(channels))


check("the genitive matches: Leksands is Leksand", tv._names_match("Leksands IF", LIF))
check("a club's generic suffix is ignored: AIK IF is AIK", tv._names_match("AIK IF", AIK))
check("a city name matches its club", tv._names_match("VIK Västerås", VIK))
check("VIK is not Nybro Vikings", not tv._names_match("VIK Västerås", NYB))
check("Vikings is not Västerås", not tv._names_match("Nybro Vikings", VIK))
check("an unrelated club does not match", not tv._names_match("Leksands IF", MODO))

games = [game("g1", LIF, MODO), game("g2", BIK, AIK)]
listings = [
    listing("BIK Karlskoga", "AIK IF", ["TV4 Play"]),
    listing("Leksands IF", "MoDo Hockey", ["TV4 Hockey", "TV4 Play"]),
]
paired = tv.match_channels(games, listings)
check("each game gets its own listing's channels", paired.get("g1") == ("TV4 Hockey", "TV4 Play"), paired)
check("games starting together are told apart by name", paired.get("g2") == ("TV4 Play",), paired)

late = [listing("Leksands IF", "MoDo Hockey", ["TV4"], start=START + timedelta(hours=2))]
check("a listing far from the start time is not paired", tv.match_channels(games[:1], late) == {})

one = [listing("Leksands IF", "MoDo Hockey", ["TV4"])]
twice = tv.match_channels([game("a", LIF, MODO), game("b", LIF, MODO)], one)
check("one listing is given to one game only", len(twice) == 1, twice)

done()
