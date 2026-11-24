"""Schedule coordinator for the Svensk hockey integration."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CoreState, HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import (
    Clip,
    Game,
    GameScore,
    Goal,
    HockeyApiError,
    LeagueClient,
    LiveGame,
    Standing,
    Team,
    club_key,
    create_client,
    parse_score,
)
from .push import (
    STATE_ENDED,
    GameBroadcaster,
    PushGame,
    apply_overview,
    apply_scorer,
    overview_is_game,
)
from .league_stats import LeagueStatistics
from .odds import OddsBook
from .matchup import form_of as _form_of
from .swehockey import SHEET_TTL, GameSheet, SwehockeyClient
from .tv import async_tv_listings, match_channels
from .const import (
    CONF_LEAGUE,
    CONF_TEAMS,
    DOMAIN,
    END_SETTLE,
    END_SETTLE_MARGIN,
    HIGHLIGHTS_AFTER,
    HIGHLIGHTS_IDLE,
    HIGHLIGHTS_INTERVAL,
    LEAGUE_NAMES,
    CONF_LIVE_INTERVAL,
    DEFAULT_LIVE_INTERVAL,
    LIVE_IDLE_MAX,
    LIVE_IDLE_MIN,
    LIVE_RECENT_AFTER,
    LIVE_TABLE_INTERVAL,
    LIVE_WINDOW_AFTER,
    LIVE_WINDOW_BEFORE,
    SCAN_INTERVAL,
    SCHEDULE_HOLD,
    SCHEDULE_RETRY_INTERVAL,
    STATE_POST_GAME,
    TABLE_BEHIND_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)

# Fired once per goal, from whichever of the push stream and the poll sees it
# first, and once when a game is over. Automations listen for these rather
# than watching the sensors change.
EVENT_GOAL = f"{DOMAIN}_goal"
EVENT_GAME_END = f"{DOMAIN}_game_end"
# Fired when more is known about a goal already announced: the scorer, the
# assists or the strength, which the push stream often sends without.
EVENT_GOAL_UPDATED = f"{DOMAIN}_goal_updated"
# Odds are read while a game is this close, and every ODDS_REFRESH then.
ODDS_AHEAD = timedelta(days=3)
ODDS_AFTER = timedelta(hours=1)
ODDS_REFRESH = timedelta(minutes=30)
# How long an update waits for a reference to the message it should edit.
_REFERENCE_WAIT = 60
# A goal the stream has counted but not described yet is held this long for
# its scorer before it is announced without one.
_PUSH_DETAIL_WAIT = 5
# A goal taken back is remembered this long, so that if the feed only stumbled
# - one stale reading, then the goal again - it comes back without a second
# announcement.
_RETRACT_KEEP = timedelta(minutes=5)
# Which goals have been announced, kept across restarts so a restart in the
# middle of a game does not announce the whole game again.
_GOAL_LOG_VERSION = 1
_GOAL_LOG_GAMES = 30


@dataclass(slots=True)
class LeagueData:
    """The full season as last fetched from a league."""

    teams: dict[str, Team] = field(default_factory=dict)
    games: list[Game] = field(default_factory=list)
    standings: list[Standing] = field(default_factory=list)
    # "official" when the league published the table, "results" when it was
    # worked out from the games that have been played.
    standings_source: str = "official"

    def games_for(self, team_key: str) -> list[Game]:
        """Return this team's games, in chronological order."""
        return [game for game in self.games if game.involves(team_key)]

    def results_for(self, team_key: str) -> list[Game]:
        """Return this team's played games, most recent first."""
        played = [game for game in self.games_for(team_key) if game.has_result]
        return sorted(played, key=lambda game: game.start, reverse=True)

    def game_for(self, uid: str) -> Game | None:
        """Return a game by its league id."""
        for game in self.games:
            if game.uid == uid:
                return game
        return None

    def standing_for(self, team_key: str) -> Standing | None:
        """Return a team's row in the table, if the table lists it."""
        wanted = team_key.casefold()
        for row in self.standings:
            if row.team_code.casefold() == wanted:
                return row
        return None


type SwedishHockeyConfigEntry = ConfigEntry[SwedishHockeyCoordinator]


class SwedishHockeyCoordinator(DataUpdateCoordinator[LeagueData]):
    """Fetch and cache one league's season schedule."""

    config_entry: SwedishHockeyConfigEntry

    def __init__(
        self, hass: HomeAssistant, entry: SwedishHockeyConfigEntry
    ) -> None:
        """Initialise the coordinator for the league of this entry."""
        self.league: str = entry.data[CONF_LEAGUE]
        self.league_name: str = LEAGUE_NAMES.get(self.league, self.league)
        self.client: LeagueClient = create_client(
            self.league, async_get_clientsession(hass)
        )
        # The federation's game sheets, for the numbers the league leaves out.
        self.swehockey = SwehockeyClient(async_get_clientsession(hass), self.league)
        # The push stream, open only while a followed team is playing.
        self.push = GameBroadcaster(hass, entry, async_get_clientsession(hass))
        self._goal_store: Store[dict[str, Any]] = Store(
            hass, _GOAL_LOG_VERSION, f"{DOMAIN}.{entry.entry_id}.goals"
        )
        self._goal_log: dict[str, Any] | None = None
        # One live-score coordinator per followed team, keyed by team code.
        self.live: dict[str, LiveScoreCoordinator] = {}
        # One coordinator for the rest of the league, feeding the live table.
        self.scores = LeagueScoreCoordinator(hass, entry, self)
        # And one for the highlight clips of the followed teams.
        self.highlights = HighlightsCoordinator(hass, entry, self)
        # The league's statistics tables, read only when someone asks.
        self.statistics = LeagueStatistics(
            self.client, lambda: self.data.teams if self.data else {}
        )
        # Svenska Spel's odds for the games it has opened betting on.
        self.odds = OddsBook(async_get_clientsession(hass), self.league)
        # When the schedule was last read, and whether a failed read is being
        # covered by it (SCHEDULE_HOLD).
        self._fetched_at = dt_util.utcnow()
        self._holding = False
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} {self.league}",
            config_entry=entry,
            update_interval=SCAN_INTERVAL,
        )

    async def async_odds(self) -> dict[str, dict[str, Any]]:
        """Return the bookmaker's odds for games still to come, by game uid."""
        return await self.odds.async_odds(self.data.games if self.data else [])

    async def async_refresh_odds(self, _now: Any = None) -> None:
        """Read the odds again while a game is near, and tell the sensors.

        The bookmaker opens betting a day or two before a round, so nothing is
        asked for while the next game is further off than that; the services
        still read the odds whenever a card asks for a list.
        """
        if not self.data:
            return
        now = dt_util.utcnow()
        if not any(
            not game.has_result and now - ODDS_AFTER < game.start < now + ODDS_AHEAD
            for game in self.data.games
        ):
            return
        await self.async_odds()
        self.async_update_listeners()

    async def async_goal_log(self) -> dict[str, Any]:
        """Return what has been announced, game by game, loading it once."""
        if self._goal_log is None:
            self._goal_log = await self._goal_store.async_load() or {}
        return self._goal_log

    @callback
    def async_save_goal_log(self) -> None:
        """Write the goal log back, keeping only the most recent games."""
        if self._goal_log is None:
            return
        while len(self._goal_log) > _GOAL_LOG_GAMES:
            self._goal_log.pop(next(iter(self._goal_log)))
        self._goal_store.async_delay_save(lambda: self._goal_log or {}, 2)

    @callback
    def async_sync_scores(self) -> None:
        """Run the league-wide score poll while any team is followed live."""
        self.scores.async_set_enabled(
            any(live.enabled for live in self.live.values())
        )

    async def _async_update_data(self) -> LeagueData:
        """Fetch the season schedule.

        Called once a day, and whenever `homeassistant.update_entity` is used
        on one of this league's calendars. Home Assistant unschedules the timer
        entirely while no enabled entity is listening, so a league whose
        calendars are all disabled is never fetched at all.
        """
        try:
            teams, games = await self.client.async_fetch()
        except HockeyApiError as err:
            now = dt_util.utcnow()
            if self.data is None or now - self._fetched_at > SCHEDULE_HOLD:
                raise UpdateFailed(str(err)) from err
            # Once per outage: the retries come every quarter of an hour.
            log = _LOGGER.debug if self._holding else _LOGGER.warning
            log(
                "Could not read the %s schedule, keeping the one from %s: %s",
                self.league_name,
                dt_util.as_local(self._fetched_at).strftime("%Y-%m-%d %H:%M"),
                err,
            )
            self._holding = True
            self.update_interval = SCHEDULE_RETRY_INTERVAL
            return self.data
        self._fetched_at = dt_util.utcnow()
        self._holding = False

        # A broken table must not take the schedule down with it, so keep the
        # last one we managed to read.
        standings = self.data.standings if self.data else []
        source = self.data.standings_source if self.data else "official"
        try:
            standings = await self.client.async_standings()
            source = "official"
        except HockeyApiError as err:
            _LOGGER.warning("Could not read the %s table: %s", self.league_name, err)

        # A league does not always publish a table - early in a season its own
        # stats page can still be empty - but every played game is in the
        # schedule, so the table can be worked out from the results instead.
        if not standings:
            standings = standings_from_results(games)
            source = "results"
            if standings:
                _LOGGER.debug(
                    "No %s table published, using one built from results",
                    self.league_name,
                )

        # The table the league publishes trails its results by a while after
        # every game night; until it has caught up, the results say more.
        self.update_interval = SCAN_INTERVAL
        if source == "official" and (behind := table_behind(standings, games)):
            _LOGGER.debug(
                "The %s table is missing games for %s, using one built from "
                "results until it catches up",
                self.league_name,
                ", ".join(behind),
            )
            standings = standings_from_results(games)
            source = "results"
            self.update_interval = TABLE_BEHIND_INTERVAL

        games = await self._async_with_tv(games)
        return LeagueData(
            teams=teams, games=games, standings=standings, standings_source=source
        )

    async def _async_with_tv(self, games: list[Game]) -> list[Game]:
        """Put the TV channels tv.nu lists on the games.

        tv.nu drops a game from its page once it is over, and is not the
        league, so neither a game falling off it nor the page failing to read
        takes away a channel already found.
        """
        known = {game.uid: game.tv for game in self.data.games} if self.data else {}
        try:
            found = match_channels(
                games,
                await async_tv_listings(
                    async_get_clientsession(self.hass), self.league
                ),
            )
        except HockeyApiError as err:
            _LOGGER.warning("Could not read TV channels from tv.nu: %s", err)
            found = {}
        return [
            replace(game, tv=tv)
            if (tv := found.get(game.uid) or known.get(game.uid))
            else game
            for game in games
        ]


class LiveScoreCoordinator(DataUpdateCoordinator[LiveGame | None]):
    """Follow one team's game while it is being played.

    The schedule already says when the team plays, so there is nothing to
    discover by polling: outside a game window this makes no request at all and
    simply sleeps until the next puck drop. It is idle entirely while its
    switch is off.
    """

    config_entry: SwedishHockeyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: SwedishHockeyConfigEntry,
        schedule: SwedishHockeyCoordinator,
        team_key: str,
    ) -> None:
        """Initialise the live coordinator for one team."""
        self._schedule = schedule
        self._team_key = team_key
        self._enabled = False
        self.game: Game | None = None
        self.is_live = False
        self._data_game_uid: str | None = None
        # The next poll is one the push stream asked for, on a goal: it must
        # not be answered from the last reading.
        self._fresh = False
        self._announce_on_start = False
        # The federation's sheet for the same game, read beside the feed.
        self.sheet: GameSheet | None = None
        self._sheet_game_uid: str | None = None
        self._sheet_final = False
        # What the push stream has said about the game, and its id there.
        self.push: PushGame | None = None
        self._push_game_uid: str | None = None
        self._push_uuid: str | None = None
        self._push_wait: Any = None
        self._goal_log: dict[str, Any] | None = None
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} live {team_key}",
            config_entry=entry,
            update_interval=None,
        )

    @property
    def enabled(self) -> bool:
        """Return True while live scoring is switched on."""
        return self._enabled

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Turn live scoring on or off."""
        if enabled == self._enabled:
            return
        self._enabled = enabled
        self._schedule.async_sync_scores()
        if enabled:
            self.update_interval = LIVE_IDLE_MIN
            self.config_entry.async_create_task(
                self.hass, self.async_request_refresh(), eager_start=True
            )
            return
        # Stop the timer; _async_update_data would make no request anyway.
        self.update_interval = None
        self.is_live = False
        self._async_stop_push()
        self.async_update_listeners()

    async def _async_update_data(self) -> LiveGame | None:
        """Fetch the live game, but only when there is one to fetch."""
        if not self._enabled:
            self.update_interval = None
            self.is_live = False
            self._async_stop_push()
            return self.data

        if self._goal_log is None:
            self._goal_log = await self._schedule.async_goal_log()

        game = self._async_live_game()
        self.is_live = game is not None
        # Keep the last game on file: the card shows the result for a while
        # after the final whistle, and needs to know who played.
        if game is not None:
            self.game = game
        if game is None:
            self.update_interval = self._async_idle_interval()
            self._async_stop_push()
            # Keep the last final score on show until the next game starts.
            return self.data

        if self._push_game_uid != game.uid:
            self.push = None
            self._push_uuid = None
            self._push_game_uid = game.uid

        # Only carry readings forward within the same game.
        previous = self.data if self._data_game_uid == game.uid else None
        try:
            fresh, self._fresh = self._fresh, False
            live = await self._schedule.client.async_live_game(game, previous, fresh=fresh)
        except HockeyApiError as err:
            raise UpdateFailed(str(err)) from err
        self._data_game_uid = game.uid
        await self._async_update_sheet(game, live.finished)

        # The stream only adds speed; it is opened for a game being played and
        # closed with it, and the poll goes on at its own pace regardless.
        if live.finished:
            self._async_stop_push()
        else:
            self._schedule.push.async_watch(self._team_key, self._async_on_push)

        self.update_interval = (
            self._async_idle_interval() if live.finished else self._async_live_interval()
        )
        self._async_announce(self._merge(live), game, live)
        if live.finished and self.awaiting_result():
            # The end is held for a score that is not level yet; look again
            # soon rather than at the next game.
            self.update_interval = self._async_live_interval()
        return live

    @property
    def merged(self) -> LiveGame | None:
        """Return the live game with what the push stream knows ahead of it."""
        return self._merge(self.data)

    @property
    def push_connected(self) -> bool:
        """Return True while the push stream is open for this game."""
        return self.is_live and self._schedule.push.connected and self.push is not None

    def _merge(self, feed: LiveGame | None) -> LiveGame | None:
        """Add the goals the stream has counted and the poll has not yet.

        The poll stays the record: the stream can only put goals on the end of
        it, and only while it has counted more than the poll has. Once the poll
        catches up, its own goals - with their assists - are what is shown.
        """
        push = self.push
        if (
            feed is None
            or push is None
            or self._push_game_uid != self._data_game_uid
            or feed.finished
        ):
            return feed
        scored = parse_score(feed.score) or (0, 0)
        if push.total <= sum(scored):
            return feed

        goals = list(feed.goals)
        by_total = {
            sum(parse_score(goal.score) or (0, 0)): goal for goal in push.goals.values()
        }
        for total in range(sum(scored) + 1, push.total + 1):
            if (goal := by_total.get(total)) is not None:
                goals.append(goal)
        if not goals or goals[-1].score != push.score:
            # Counted but not described yet: say who scored by which side's
            # tally went up, and leave the rest for the poll.
            game = self.game
            last = parse_score(goals[-1].score) if goals else None
            last = last or scored
            side = game.home if game and push.home > last[0] else game.away if game else None
            goals.append(
                Goal(
                    period=push.period,
                    time=push.period_time,
                    team_code=side.key if side else None,
                    team_name=side.name if side else None,
                    score=push.score,
                    note=None,
                    scorer=None,
                    assists=[],
                )
            )
        return replace(feed, goals=goals, current_period=push.period or feed.current_period)

    @callback
    def _async_on_push(self, kind: str, body: dict[str, Any]) -> None:
        """Take a message from the stream."""
        if kind == "connection":
            self.async_update_listeners()
            return
        game = self.game
        if game is None or not self.is_live or self._push_game_uid != game.uid:
            return

        before = self.merged
        before_total = sum(parse_score(before.score) or (0, 0)) if before else 0
        if kind == "gameOverview":
            if self._push_uuid is None:
                if not overview_is_game(body, game):
                    return
                self._push_uuid = str(body.get("gameUuid") or "") or None
                _LOGGER.debug("Push stream follows %s as %s", game.uid, self._push_uuid)
            elif body.get("gameUuid") != self._push_uuid:
                return
            self.push = apply_overview(self.push, body)
        elif kind == "gameScorer":
            if self._push_uuid is None or body.get("gameUuid") != self._push_uuid:
                return
            self.push = apply_scorer(self.push, body)
        else:
            return

        after = self.merged
        self.async_update_listeners()
        after_total = sum(parse_score(after.score) or (0, 0)) if after else 0
        ended = self.push is not None and self.push.state == STATE_ENDED
        if after_total == before_total and not ended:
            # Nothing new; but a goal held for its scorer may now have one.
            if kind == "gameScorer" and self._push_wait is not None:
                self._async_announce_now()
            return

        # The poll fills in what the stream leaves out - and is the one that
        # says the game is over - so ask it now rather than at its next turn.
        self._fresh = True
        self.config_entry.async_create_task(
            self.hass, self.async_request_refresh(), eager_start=True
        )
        if after_total <= before_total:
            return
        if kind == "gameScorer":
            self._async_announce_now()
        elif self._push_wait is None:
            self._push_wait = async_call_later(
                self.hass, _PUSH_DETAIL_WAIT, self._async_announce_later
            )

    @callback
    def _async_announce_later(self, _now: Any) -> None:
        self._push_wait = None
        self._async_announce(self.merged, self.game, self.data)

    @callback
    def _async_announce_started(self, _hass: HomeAssistant) -> None:
        self._announce_on_start = False
        self._async_announce(self.merged, self.game, self.data)

    @callback
    def _async_look_again(self, _now: Any) -> None:
        # A plain lambda here was run in a worker thread - Home Assistant only
        # keeps a callback on the loop - and firing from there is refused.
        self._async_announce(self.merged, self.game, self.data)

    @callback
    def _async_announce_now(self) -> None:
        if self._push_wait is not None:
            self._push_wait()
            self._push_wait = None
        self._async_announce(self.merged, self.game, self.data)

    @callback
    def _async_stop_push(self) -> None:
        self._schedule.push.async_unwatch(self._team_key)
        if self._push_wait is not None:
            self._push_wait()
            self._push_wait = None

    @callback
    def _async_announce(
        self, live: LiveGame | None, game: Game | None, feed: LiveGame | None
    ) -> None:
        """Fire an event for every goal not announced yet, and for the end.

        A goal already announced is announced again, as an update, when more
        is known about it than when it went out - the scorer, the assists or
        the strength. The update waits for a reference to what was sent (see
        `async_set_goal_reference`), so a message can be edited rather than a
        second one sent; with no reference after a minute it goes without.

        A goal that drops off the score is forgotten, so the one that replaces
        it is announced; but if the same goal comes back within
        `_RETRACT_KEEP` - the feed only served one stale reading - it is taken
        back in quietly rather than announced twice.

        A game seen for the first time when it is already over - after a long
        restart, or the first time this runs - is noted without a word: those
        goals are old news.
        """
        if live is None or game is None or self._goal_log is None:
            return
        if self.hass.state is not CoreState.running:
            # Automations listen only once Home Assistant has started; an
            # event fired before then - a game that ended during a restart -
            # reaches no one, and would be marked as sent all the same.
            if not self._announce_on_start:
                self._announce_on_start = True
                async_at_started(self.hass, self._async_announce_started)
            return
        now = dt_util.utcnow()
        record = self._goal_log.get(game.uid)
        if record is None:
            record = {"goals": [], "ended": False, "details": {}}
            self._goal_log[game.uid] = record
            if live.finished:
                record["goals"] = [goal.score for goal in live.goals if goal.score]
                record["details"] = {
                    goal.score: self._detail(goal, now) for goal in live.goals if goal.score
                }
                record["ended"] = True
                self._schedule.async_save_goal_log()
                return
        details: dict[str, dict[str, Any]] = record.setdefault("details", {})

        # A goal taken back leaves the score lower than one already announced;
        # forget those so the goal that replaces it is announced in turn.
        total_now = sum(parse_score(live.score) or (0, 0))
        changed = False
        kept = [
            score for score in record["goals"] if sum(parse_score(score) or (0, 0)) <= total_now
        ]
        retracted: dict[str, dict[str, Any]] = record.setdefault("retracted", {})
        if kept != record["goals"]:
            for score in set(record["goals"]) - set(kept):
                if (detail := details.pop(score, None)) is not None:
                    retracted[score] = detail | {"retracted_at": now.isoformat()}
            record["goals"] = kept
            changed = True
        for score, detail in list(retracted.items()):
            at = dt_util.parse_datetime(detail.get("retracted_at") or "")
            if at is None or now - at > _RETRACT_KEEP:
                del retracted[score]
                changed = True
        announced: list[str] = record["goals"]

        feed_goals = {id(goal) for goal in (feed.goals if feed else [])}
        for goal in live.goals:
            if not goal.score:
                continue
            source = "poll" if id(goal) in feed_goals else "push"
            if goal.score not in announced:
                announced.append(goal.score)
                changed = True
                gone = retracted.pop(goal.score, None)
                if gone is not None and _same_goal(goal, self._is_ours(goal), gone):
                    # The feed went back a goal and forward again: it is the
                    # goal already announced, so take it back in, reference
                    # and all, and let anything new about it go as an update.
                    gone.pop("retracted_at", None)
                    details[goal.score] = gone
                else:
                    details[goal.score] = self._detail(goal, now)
                    self.hass.bus.async_fire(
                        EVENT_GOAL,
                        self._event_data(game)
                        | goal.as_dict()
                        | {"ours": self._is_ours(goal), "source": source},
                    )
                    continue

            known = details.get(goal.score)
            if known is None:
                # Announced before details were kept; nothing to compare with.
                details[goal.score] = self._detail(goal, now)
                changed = True
                continue
            if _richer(goal, known):
                known["previous"] = {
                    "scorer": known.get("scorer"),
                    "assists": known.get("assists") or [],
                    "note": known.get("note"),
                }
                known.update(self._detail(goal, None))
                known["source"] = source
                known["pending"] = True
                changed = True
                if known.get("reference") is None:
                    # Nothing else may come along to send it once the wait is
                    # over - the game can end - so look again then.
                    async_call_later(self.hass, _REFERENCE_WAIT + 1, self._async_look_again)
            if known.get("pending") and self._async_fire_update(game, known, now):
                changed = True

        if live.finished and not record["ended"]:
            score, decided_in = self._final_score(game, live)
            if score is None or score[0] == score[1]:
                # Neither league ends a game level, so a level "final" is a
                # record that has not caught up: Västerås-Leksand 2026-11-13
                # was published finished at 0-0 although Leksand won in
                # overtime, and went out as a loss. Wait for the federation's
                # sheet to settle it; only after END_SETTLE does it go out
                # without a winner.
                seen = record.setdefault("finished_seen", now.isoformat())
                if seen == now.isoformat():
                    changed = True
                waited = now - (dt_util.parse_datetime(seen) or now)
                closing = game.start + LIVE_WINDOW_AFTER - END_SETTLE_MARGIN
                if waited < END_SETTLE and now < closing:
                    if changed:
                        self._schedule.async_save_goal_log()
                    return
            record["ended"] = True
            record.pop("finished_seen", None)
            changed = True
            is_home = game.home.key == self._team_key
            won = None
            if score is not None and score[0] != score[1]:
                won = (score[0] > score[1]) == is_home
            self.hass.bus.async_fire(
                EVENT_GAME_END,
                self._event_data(game)
                | {
                    "score": f"{score[0]}-{score[1]}" if score else live.score,
                    "decided_in": decided_in,
                    "we_won": won,
                },
            )
        if changed:
            self._schedule.async_save_goal_log()

    def _final_score(
        self, game: Game, live: LiveGame
    ) -> tuple[tuple[int, int] | None, str | None]:
        """Return the final score and how it was decided.

        The feed's score unless it is level and the federation's sheet for
        the same game is not: then the sheet's, which writes overtime as a
        fourth period and a shootout as a fifth.
        """
        score = parse_score(live.score)
        sheet = self.sheet if self._sheet_game_uid == game.uid else None
        if score is not None and score[0] != score[1]:
            return score, live.decided_in
        if sheet is None or (settled := sheet.score) is None or settled[0] == settled[1]:
            return score, live.decided_in
        periods = len(sheet.period_scores)
        decided_in = "SO" if periods >= 5 else "OT" if periods == 4 else live.decided_in
        return settled, decided_in

    @callback
    def awaiting_result(self) -> bool:
        """Return True while a finished game's end waits on its score."""
        record = (self._goal_log or {}).get(self._data_game_uid or "")
        return bool(record) and not record.get("ended") and "finished_seen" in record

    def _detail(self, goal: Goal, at: datetime | None) -> dict[str, Any]:
        """Return what is kept about an announced goal."""
        detail = goal.as_dict() | {"ours": self._is_ours(goal)}
        if at is not None:
            detail |= {"announced_at": at.isoformat(), "reference": None, "pending": False}
        return detail

    @callback
    def _async_fire_update(
        self, game: Game, known: dict[str, Any], now: datetime
    ) -> bool:
        """Fire the update for a goal if it can go now; return True if it went."""
        announced_at = dt_util.parse_datetime(known.get("announced_at") or "")
        waited = (now - announced_at).total_seconds() if announced_at else None
        if known.get("reference") is None and waited is not None and waited < _REFERENCE_WAIT:
            return False
        known["pending"] = False
        self.hass.bus.async_fire(
            EVENT_GOAL_UPDATED,
            self._event_data(game)
            | {
                key: known.get(key)
                for key in (
                    "period", "time", "team_code", "team_name", "score", "note",
                    "strength", "scorer", "assists", "ours", "reference", "previous",
                )
            }
            | {"source": known.get("source")},
        )
        return True

    @callback
    def async_set_goal_reference(self, game_id: str, score: str, reference: str) -> bool:
        """Keep what was sent for a goal, and send any update held for it."""
        if self._goal_log is None:
            return False
        record = self._goal_log.get(game_id)
        known = (record or {}).get("details", {}).get(score)
        if known is None:
            return False
        known["reference"] = reference
        game = self.game
        if known.get("pending") and game is not None and game.uid == game_id:
            self._async_fire_update(game, known, dt_util.utcnow())
        self._schedule.async_save_goal_log()
        return True

    def _event_data(self, game: Game) -> dict[str, Any]:
        """Return what every event says about the game."""
        return {
            "config_entry_id": self.config_entry.entry_id,
            "team": self._team_key,
            "game_id": game.uid,
            "home_team": game.home.name,
            "away_team": game.away.name,
            "home_code": game.home.key,
            "away_code": game.away.key,
            "is_home": game.home.key == self._team_key,
        }

    def _is_ours(self, goal: Goal) -> bool:
        """Return True if the followed team scored the goal."""
        game = self.game
        team = None
        if game is not None:
            team = game.home if game.home.key == self._team_key else game.away
        if team is None:
            return False
        code = club_key(goal.team_code)
        if code and code in (club_key(team.key), club_key(team.short_name)):
            return True
        name = club_key(goal.team_name)
        return bool(name) and (
            name == club_key(team.name) or name.startswith(club_key(team.short_name))
        )

    async def _async_update_sheet(self, game: Game, finished: bool) -> None:
        """Read the federation's sheet for the game, if it has one.

        The sheet is extra numbers, so it never fails the update: a page that
        cannot be read leaves the last sheet of the same game on show. The
        client keeps a read for a minute; the one after the final whistle is
        made fresh, since nothing reads the game again after it.
        """
        if self._sheet_game_uid != game.uid:
            self.sheet = None
            self._sheet_final = False
            self._sheet_game_uid = game.uid
        if self._sheet_final:
            return
        # Waiting on the sheet for a final score: a minute's cache is enough.
        waiting = finished and self.sheet is not None
        try:
            sheet = await self._schedule.swehockey.async_sheet(
                game, max_age=0 if finished and not waiting else SHEET_TTL
            )
        except HockeyApiError as err:
            _LOGGER.debug("Could not read the game sheet for %s: %s", game.uid, err)
            return
        if sheet is not None:
            self.sheet = sheet
            # A finished game's sheet still level has not had its last goal
            # written in yet; read it again until it has.
            score = sheet.score
            self._sheet_final = finished and not (score is not None and score[0] == score[1])

    @callback
    def _async_live_interval(self) -> timedelta:
        """Return how often to re-read a game that is being played."""
        seconds = self.config_entry.options.get(
            CONF_LIVE_INTERVAL, DEFAULT_LIVE_INTERVAL
        )
        return timedelta(seconds=int(seconds))

    def _games(self) -> list[Game]:
        """Return this team's games, in chronological order."""
        data = self._schedule.data
        return data.games_for(self._team_key) if data else []

    @callback
    def _async_live_game(self) -> Game | None:
        """Return the game to read: one being played, or a just-finished one.

        The match log only exists in play-by-play, so after a restart a recently
        finished game is read once to bring it back. `_data_game_uid` stops that
        from repeating on every idle wake-up.
        """
        now = dt_util.utcnow()
        games = self._games()
        for game in games:
            if game.start - LIVE_WINDOW_BEFORE <= now <= game.start + LIVE_WINDOW_AFTER:
                return game

        past = [game for game in games if game.start <= now]
        if not past:
            return None
        last = past[-1]
        if (
            last.has_result
            and self._data_game_uid != last.uid
            and now - last.start < LIVE_RECENT_AFTER
        ):
            return last
        return None

    @callback
    def _async_idle_interval(self) -> timedelta:
        """Sleep until the next game is about to start."""
        now = dt_util.utcnow()
        for game in self._games():
            if (start := game.start - LIVE_WINDOW_BEFORE) > now:
                return max(LIVE_IDLE_MIN, min(start - now, LIVE_IDLE_MAX))
        return LIVE_IDLE_MAX


class LeagueScoreCoordinator(DataUpdateCoordinator[dict[str, GameScore]]):
    """Follow the score of every game being played in the league.

    The per-team coordinator above only ever reads the followed team's game,
    which is all the card needs for a scoreline. A live table needs the rest of
    tonight's fixtures as well - every result in play moves the table.
    """

    config_entry: SwedishHockeyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: SwedishHockeyConfigEntry,
        schedule: SwedishHockeyCoordinator,
    ) -> None:
        """Initialise the league-wide score coordinator."""
        self._schedule = schedule
        self._enabled = False
        # Whether the last poll still had a game to be decided, so the end of
        # the night can be noticed as it happens, and which games were over by
        # then, so each final whistle can be.
        self._pending = False
        self._finished: set[str] = set()
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} scores {schedule.league}",
            config_entry=entry,
            update_interval=None,
        )

    @property
    def enabled(self) -> bool:
        """Return True while the league-wide poll is running."""
        return self._enabled

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Start or stop following the rest of the league."""
        if enabled == self._enabled:
            return
        self._enabled = enabled
        if enabled:
            self.update_interval = LIVE_IDLE_MIN
            self.config_entry.async_create_task(
                self.hass, self.async_request_refresh(), eager_start=True
            )
            return
        self.update_interval = None
        self.async_set_updated_data({})

    @callback
    def _async_games_now(self) -> list[Game]:
        """Return every game whose window is open, played or not."""
        now = dt_util.utcnow()
        data = self._schedule.data
        return [
            game
            for game in (data.games if data else [])
            if game.start - LIVE_WINDOW_BEFORE <= now <= game.start + LIVE_WINDOW_AFTER
        ]

    async def _async_update_data(self) -> dict[str, GameScore]:
        """Read the score of tonight's games, when there are any on."""
        if not self._enabled:
            self.update_interval = None
            return {}

        games = self._async_games_now()
        if not games:
            self.update_interval = self._async_idle_interval()
            return {}

        try:
            scores = await self._schedule.client.async_scores(games)
        except HockeyApiError as err:
            raise UpdateFailed(str(err)) from err

        # Keep the cadence up while anything is still to be decided; once every
        # game in the window has finished there is nothing left to poll for.
        pending = any(not score.finished for score in scores.values())
        _LOGGER.debug(
            "Read %s of %s games in tonight's window, %s still being played",
            len(scores),
            len(games),
            sum(score.in_progress for score in scores.values()),
        )

        # Every final whistle changes the table, the results and - once the
        # night is over - the next fixture, all of which come from the
        # schedule. Fetching it as each game ends keeps the card off a table
        # that is hours old; until the league publishes it, the live table
        # counts the game in on its own.
        finished = {uid for uid, score in scores.items() if score.finished}
        if finished - self._finished or (self._pending and not pending):
            _LOGGER.debug(
                "%s av kvällens matcher är slut, hämtar serien på nytt",
                len(finished),
            )
            self.config_entry.async_create_task(
                self.hass, self._schedule.async_request_refresh(), eager_start=True
            )
        self._finished = finished
        self._pending = pending
        self.update_interval = (
            LIVE_TABLE_INTERVAL if pending else self._async_idle_interval()
        )
        return scores

    @callback
    def _async_idle_interval(self) -> timedelta:
        """Sleep until the next game in the league is about to start."""
        now = dt_util.utcnow()
        data = self._schedule.data
        for game in data.games if data else []:
            if (start := game.start - LIVE_WINDOW_BEFORE) > now:
                return max(LIVE_IDLE_MIN, min(start - now, LIVE_IDLE_MAX))
        return LIVE_IDLE_MAX


# Swedish elite hockey pays three points for a win in regulation, two for one
# in overtime or a shootout and one for losing there. A game in progress is
# projected as if the whistle went now: the side in front takes the regulation
# three, and a game that is still level is on its way to overtime, so both
# sides are credited the point each has already banked.
WIN_POINTS = 3
OT_WIN_POINTS = 2
OT_LOSS_POINTS = 1
TIE_POINTS = 1


def live_standings(
    data: LeagueData, scores: dict[str, GameScore]
) -> tuple[list[Standing], set[str], set[str]]:
    """Return the table as it stands with tonight's games counted in.

    A game counts from the moment the league has a score for it until the
    published table picks it up: a result from earlier in the evening moves the
    table every bit as much as one still in play, and the league can be an hour
    behind on it. A club plays at most once a night, so whether its published
    row already includes tonight is decided by comparing that row's game count
    with the games it has a result for outside tonight's window.

    Returns the re-ranked rows, the codes of the clubs playing right now, and
    the ids of the games counted in.
    """
    rows = {row.team_code.casefold(): row for row in data.standings}
    if not rows:
        return [], set(), set()

    tonight = set(scores)
    played_before: dict[str, int] = {}
    for game in data.games:
        if not game.has_result or game.uid in tonight:
            continue
        for key in (game.home.key, game.away.key):
            played_before[key.casefold()] = played_before.get(key.casefold(), 0) + 1

    playing: set[str] = set()
    counted: set[str] = set()
    for uid, score in scores.items():
        if score.home_score is None or score.away_score is None:
            continue
        if not score.in_progress and not score.finished:
            continue
        if (game := data.game_for(uid)) is None:
            continue
        home = rows.get(game.home.key.casefold())
        away = rows.get(game.away.key.casefold())
        if home is None or away is None:
            continue
        # Already in the published table: one more game against its name than
        # it has results for on the other nights is this one.
        if any(
            (row.games_played or 0) > played_before.get(row.team_code.casefold(), 0)
            for row in (home, away)
        ):
            continue

        home_points, away_points = _points_for(score)
        rows[home.team_code.casefold()] = _counted(
            home, score.home_score, score.away_score, home_points
        )
        rows[away.team_code.casefold()] = _counted(
            away, score.away_score, score.home_score, away_points
        )
        counted.add(uid)
        if score.in_progress:
            playing.update({game.home.key, game.away.key})

    ordered = sorted(
        rows.values(),
        key=lambda row: (
            -(row.points or 0),
            -(row.goal_difference or 0),
            -(row.goals_for or 0),
            row.team_name,
        ),
    )
    return [
        replace(row, rank=rank) for rank, row in enumerate(ordered, start=1)
    ], playing, counted


def _points_for(score: GameScore) -> tuple[int, int]:
    """Return the points a game is worth to the home and away side.

    A finished game pays what the league pays; one still being played is
    projected as if the whistle went now, with a level game on its way to
    overtime and both sides credited the point they have already banked.
    """
    if score.home_score == score.away_score:
        return TIE_POINTS, TIE_POINTS
    home_ahead = score.home_score > score.away_score
    if score.finished:
        decided = (score.decided_in or "").upper()
        win, loss = (
            (OT_WIN_POINTS, OT_LOSS_POINTS)
            if decided and decided not in ("FT", "REG")
            else (WIN_POINTS, 0)
        )
    else:
        win, loss = WIN_POINTS, 0
    return (win, loss) if home_ahead else (loss, win)


def _counted(row: Standing, scored: int, conceded: int, points: int) -> Standing:
    """Return a table row with one more game counted into it."""
    goals_for = (row.goals_for or 0) + scored
    goals_against = (row.goals_against or 0) + conceded
    return replace(
        row,
        games_played=(row.games_played or 0) + 1,
        goals_for=goals_for,
        goals_against=goals_against,
        goal_difference=goals_for - goals_against,
        points=(row.points or 0) + points,
    )


def games_by_team(games: list[Game]) -> dict[str, list[Game]]:
    """Return each club's played games, oldest first."""
    played: dict[str, list[Game]] = {}
    for game in games:
        if not game.has_result:
            continue
        played.setdefault(game.home.key, []).append(game)
        played.setdefault(game.away.key, []).append(game)
    return played


def table_behind(standings: list[Standing], games: list[Game]) -> list[str]:
    """Return the clubs a published table has not counted every result for.

    Only games the league calls finished are counted: one being played can
    carry a score in the schedule, and is in no table yet.
    """
    played: dict[str, int] = {}
    for game in games:
        if game.state == STATE_POST_GAME and game.has_result:
            for key in (game.home.key, game.away.key):
                played[key.casefold()] = played.get(key.casefold(), 0) + 1
    return [
        row.team_code
        for row in standings
        if row.games_played is not None
        and row.games_played < played.get(row.team_code.casefold(), 0)
    ]


def standings_from_results(
    games: list[Game], last: int | None = None
) -> list[Standing]:
    """Return a league table worked out from the games that have been played.

    The same points as the leagues themselves award: three for a win in
    regulation, two for one in overtime or a shootout and one for losing
    there. Teams level on points are separated on goal difference and then
    goals scored, which is the usual first pass - a league's own tie-breaks
    can go further, so this is a stand-in for a published table, not a
    replacement for one.

    With `last`, only that many of each club's most recent games count, which
    is a table of form rather than of the season.
    """
    rows: dict[str, dict[str, Any]] = {}

    def row_for(team: Team) -> dict[str, Any]:
        return rows.setdefault(
            team.key,
            {
                "team_name": team.name,
                "games_played": 0,
                "wins": 0,
                "losses": 0,
                "overtime_wins": 0,
                "overtime_losses": 0,
                "goals_for": 0,
                "goals_against": 0,
                "points": 0,
            },
        )

    # Counted a club at a time rather than a game at a time: with `last` the
    # same game can belong to one club's recent form and not the other's.
    for team_key, team_games in games_by_team(games).items():
        for game in team_games[-last:] if last else team_games:
            is_home = game.home.key == team_key
            row = row_for(game.home if is_home else game.away)
            ours = (game.home_score if is_home else game.away_score) or 0
            theirs = (game.away_score if is_home else game.home_score) or 0
            row["games_played"] += 1
            row["goals_for"] += ours
            row["goals_against"] += theirs

            if ours == theirs:  # no hockey game ends level; be safe
                row["points"] += TIE_POINTS
                continue
            extra_time = (game.decided_in or "FT").upper() not in ("FT", "")
            if ours > theirs:
                row["overtime_wins" if extra_time else "wins"] += 1
                row["points"] += 2 if extra_time else WIN_POINTS
            else:
                row["overtime_losses" if extra_time else "losses"] += 1
                row["points"] += TIE_POINTS if extra_time else 0

    table = [
        Standing(
            rank=None,
            team_code=code,
            team_name=row["team_name"],
            games_played=row["games_played"],
            wins=row["wins"],
            losses=row["losses"],
            overtime_wins=row["overtime_wins"],
            overtime_losses=row["overtime_losses"],
            goals_for=row["goals_for"],
            goals_against=row["goals_against"],
            goal_difference=row["goals_for"] - row["goals_against"],
            points=row["points"],
        )
        for code, row in rows.items()
    ]
    ordered = sorted(
        table,
        key=lambda row: (
            -(row.points or 0),
            -(row.goal_difference or 0),
            -(row.goals_for or 0),
            row.team_name,
        ),
    )
    return [replace(row, rank=rank) for rank, row in enumerate(ordered, start=1)]


class HighlightsCoordinator(DataUpdateCoordinator[dict[str, list[Clip]]]):
    """Follow the highlight clips of the followed teams.

    Both leagues publish their clips on one page, so a single read covers every
    team on it. Clips only appear after a game, so the page is read every
    quarter of an hour for a while after one and a few times a day otherwise.
    """

    config_entry: SwedishHockeyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: SwedishHockeyConfigEntry,
        schedule: SwedishHockeyCoordinator,
    ) -> None:
        """Initialise the highlights coordinator for a league's teams."""
        self._schedule = schedule
        self._team_keys: list[str] = list(
            entry.options.get(CONF_TEAMS, entry.data.get(CONF_TEAMS, []))
        )
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} highlights {schedule.league}",
            config_entry=entry,
            update_interval=HIGHLIGHTS_IDLE,
        )

    async def _async_update_data(self) -> dict[str, list[Clip]]:
        """Read the clips of each followed team."""
        data = self._schedule.data
        # Start from what is already on show: one team's read failing must not
        # blank another's sensor, and a page that is briefly unreadable should
        # leave the last clip up rather than take the sensor unavailable.
        clips: dict[str, list[Clip]] = dict(self.data or {})
        for team_key in self._team_keys:
            if (team := (data.teams.get(team_key) if data else None)) is None:
                continue
            try:
                clips[team_key] = await self._schedule.client.async_highlights(team)
            except HockeyApiError as err:
                _LOGGER.warning(
                    "Could not read highlights for %s: %s", team.name, err
                )

        self.update_interval = (
            HIGHLIGHTS_INTERVAL if self._async_game_just_played() else HIGHLIGHTS_IDLE
        )
        return clips

    @callback
    def _async_game_just_played(self) -> bool:
        """Return True while a clip could still turn up from a recent game."""
        now = dt_util.utcnow()
        data = self._schedule.data
        if data is None:
            return False
        for team_key in self._team_keys:
            for game in data.games_for(team_key):
                if game.has_result and timedelta(0) <= now - game.start < HIGHLIGHTS_AFTER:
                    return True
        return False


def table_rows(
    data: LeagueData,
    standings: list[Standing],
    *,
    self_key: str | None = None,
    playing: set[str] | None = None,
    official: dict[str, int | None] | None = None,
    form_games: int = 0,
) -> list[dict[str, Any]]:
    """Return a table as plain rows for a card to draw."""
    played = games_by_team(data.games) if form_games else {}
    rows = []
    for row in standings:
        known = data.teams.get(row.team_code)
        entry: dict[str, Any] = {
            "rank": row.rank,
            "team_code": row.team_code,
            "team": known.name if known else row.team_name,
            "logo": known.logo if known else None,
            "games_played": row.games_played,
            "wins": row.wins,
            "losses": row.losses,
            "overtime_wins": row.overtime_wins,
            "overtime_losses": row.overtime_losses,
            "goals_for": row.goals_for,
            "goals_against": row.goals_against,
            "goal_difference": row.goal_difference,
            "points": row.points,
            "is_self": bool(self_key)
            and row.team_code.casefold() == self_key.casefold(),
        }
        if form_games:
            entry["form"] = _form_of(played.get(row.team_code, []), row.team_code, form_games)
        if playing is not None:
            entry["live"] = row.team_code in playing
            was = (official or {}).get(row.team_code)
            entry["rank_change"] = (
                was - row.rank if was is not None and row.rank is not None else 0
            )
        rows.append(entry)
    return rows


def _same_goal(goal: Goal, ours: bool, known: dict[str, Any]) -> bool:
    """Return True if a goal is one announced before, as far as can be told.

    The same side, in the same period, at much the same time on the clock and
    by the same player - each compared only where both readings say. The
    shirt number is left out: one feed gives it and another does not.
    """
    if ours != bool(known.get("ours")):
        return False
    if goal.period and known.get("period") and str(goal.period) != str(known["period"]):
        return False
    seconds, known_seconds = _clock_seconds(goal.time), _clock_seconds(known.get("time"))
    if seconds is not None and known_seconds is not None and abs(seconds - known_seconds) > 60:
        return False
    name, known_name = _player(goal.scorer), _player(known.get("scorer"))
    return not (name and known_name and name != known_name)


def _clock_seconds(value: str | None) -> int | None:
    """Return "04:46" as seconds."""
    match = re.fullmatch(r"\s*(\d+):(\d{2})\s*", value or "")
    return int(match[1]) * 60 + int(match[2]) if match else None


def _player(value: str | None) -> str:
    """Return a player's name without the shirt number, for comparing."""
    return re.sub(r"^#?\d+\s+", "", (value or "").strip()).casefold()


def _richer(goal: Goal, known: dict[str, Any]) -> bool:
    """Return True if a goal says something the announced one did not.

    Only ever more: a field that has gone blank - the push stream's version of
    a goal the poll had already described - is not news.
    """
    if goal.scorer and goal.scorer != known.get("scorer"):
        return True
    if goal.assists and list(goal.assists) != list(known.get("assists") or []):
        return True
    return bool(goal.note) and goal.note != known.get("note")
