/**
 * What every part of the card is handed: Home Assistant, the card's settings,
 * the controller that knows where the dialog is, and what the footer and the
 * dialog both read from the sensors -- worked out once per render, so no two
 * parts can read them differently.
 */

import type { HockeyController } from "./controller";
import type { CardConfig, Game, HomeAssistant, Row, TableRow } from "./types";

/** What the sensors hold for the dialog's views and the footer's buttons. */
export interface Sources {
  /** The match log, while a game is on or its result still held. */
  events: Row[] | null | undefined;
  table: TableRow[] | undefined;
  /** The table counting tonight's games in; only while they are played. */
  liveTable: TableRow[] | null;
  results: Game[] | undefined;
  liveGames: number;
}

/** A button along the card's foot. */
export interface BarButton {
  id: string;
  side: "left" | "right";
  icon: string;
  label: string;
  badge: string | null;
  show: boolean;
}

export interface Ctx {
  hass: HomeAssistant;
  /** The card's settings, with the defaults filled in. */
  config: CardConfig;
  ctl: HockeyController;
  locale: string | undefined;
  sources: Sources;
}
