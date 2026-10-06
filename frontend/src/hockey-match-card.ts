/**
 * The bundle's entry point: register the card, the badge, their editors and
 * every part they are built from, and put the card and the badge in the
 * dashboard's pickers.
 */

import { define } from "./base";
import { HockeyMatchBadge } from "./card/badge";
import { HockeyMatchCard } from "./card/card";
import { HockeyDialog } from "./dialog/dialog";
import { HockeyTeamPicker } from "./dialog/picker";
import { HockeyMatchBadgeEditor, HockeyMatchCardEditor } from "./editor/editor";
import { HockeyLoading } from "./parts/loading";
import { HockeyEventsView } from "./views/events";
import { HockeyGameView } from "./views/game";
import { HockeyLeagueView } from "./views/league";
import { HockeyPlayerView } from "./views/player";
import { HockeyPreviewView } from "./views/preview";
import { HockeyRecapView } from "./views/recap";
import { HockeyResultsView } from "./views/results";
import { HockeyScheduleView } from "./views/schedule";
import { HockeyStatsView } from "./views/stats";
import { HockeyTableView } from "./views/table";
import { HockeyTeamView } from "./views/team";
import { HockeyTodayView } from "./views/today";

// The parts first, so a card that renders at once finds them defined.
define("hockey-loading", HockeyLoading);
define("hockey-team-picker", HockeyTeamPicker);
define("hockey-league-view", HockeyLeagueView);
define("hockey-today-view", HockeyTodayView);
define("hockey-table-view", HockeyTableView);
define("hockey-schedule-view", HockeyScheduleView);
define("hockey-stats-view", HockeyStatsView);
define("hockey-team-view", HockeyTeamView);
define("hockey-recap-view", HockeyRecapView);
define("hockey-player-view", HockeyPlayerView);
define("hockey-preview-view", HockeyPreviewView);
define("hockey-game-view", HockeyGameView);
define("hockey-events-view", HockeyEventsView);
define("hockey-results-view", HockeyResultsView);
define("hockey-dialog", HockeyDialog);

define("hockey-match-card-editor", HockeyMatchCardEditor);
define("hockey-match-card", HockeyMatchCard);
define("hockey-match-badge-editor", HockeyMatchBadgeEditor);
define("hockey-match-badge", HockeyMatchBadge);

interface PickerEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
}

declare global {
  interface Window {
    customCards?: PickerEntry[];
    customBadges?: PickerEntry[];
  }
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "hockey-match-card")) {
  window.customCards.push({
    type: "hockey-match-card",
    name: "Hockey Match",
    description: "Live score while a game is on, next fixture otherwise.",
    preview: false,
  });
}

window.customBadges = window.customBadges || [];
if (!window.customBadges.some((badge) => badge.type === "hockey-match-badge")) {
  window.customBadges.push({
    type: "hockey-match-badge",
    name: "Hockey Match",
    description: "Next game, or the score while one is on. Tap for the table.",
    preview: true,
  });
}
