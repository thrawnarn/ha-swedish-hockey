/** The visual editors for the card and the badge, both one `ha-form`. */

import { html, LitElement, nothing } from "lit";
import { DEFAULTS } from "../constants";
import { findTeams } from "../teams";
import type { CardConfig, HomeAssistant } from "../types";

interface FormField {
  name: string;
  required?: boolean;
  type?: string;
  flatten?: boolean;
  selector?: Record<string, unknown>;
  schema?: FormField[];
}

const LABELS: Record<string, string> = {
  team: "Team",
  title: "Title",
  show_clock: "Clock",
  show_powerplay: "Power play",
  show_shots: "Shots on goal",
  show_tv: "TV channel",
  show_events: "Event log",
  show_table: "League table",
  show_results: "Previous results",
  show_stats: "Statistics",
  result_hours: "Hold result (hours)",
};

const HELPERS: Record<string, string> = {
  team: "Entities are found from the team’s device.",
  result_hours: "How long the finished result stays up. 0 to switch straight to the next game.",
};

export class HockeyMatchCardEditor extends LitElement {
  declare hass: HomeAssistant;
  protected declare _config: CardConfig;

  static override properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  setConfig(config: CardConfig): void {
    this._config = { ...DEFAULTS, ...config };
  }

  // Built per render rather than as a static schema: the team options come
  // from whatever devices this Home Assistant actually has.
  protected schema(): FormField[] {
    const teams = findTeams(this.hass).map((t) => ({ value: t.team, label: t.team }));
    return [
      {
        name: "team",
        required: true,
        selector: { select: { mode: "dropdown", options: teams, custom_value: true } },
      },
      { name: "title", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        flatten: true,
        schema: [
          { name: "show_clock", selector: { boolean: {} } },
          { name: "show_powerplay", selector: { boolean: {} } },
          { name: "show_shots", selector: { boolean: {} } },
          { name: "show_tv", selector: { boolean: {} } },
          { name: "show_events", selector: { boolean: {} } },
          { name: "show_table", selector: { boolean: {} } },
          { name: "show_results", selector: { boolean: {} } },
          { name: "show_stats", selector: { boolean: {} } },
        ],
      },
      {
        name: "result_hours",
        selector: { number: { min: 0, max: 48, step: 1, mode: "box" } },
      },
    ];
  }

  protected override render() {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .schema=${this.schema()}
        .data=${this._config}
        .computeLabel=${(s: FormField) => LABELS[s.name] ?? s.name}
        .computeHelper=${(s: FormField) => HELPERS[s.name] ?? ""}
        @value-changed=${this.changed}
      ></ha-form>
    `;
  }

  private changed(ev: CustomEvent) {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: { ...this._config, ...ev.detail.value } },
      }),
    );
  }
}

// The card's editor, less what only the card face shows.
export class HockeyMatchBadgeEditor extends HockeyMatchCardEditor {
  protected override schema(): FormField[] {
    const drop = new Set(["title", "show_powerplay", "show_shots"]);
    return super
      .schema()
      .filter((s) => !drop.has(s.name))
      .map((s) => (s.schema ? { ...s, schema: s.schema.filter((f) => !drop.has(f.name)) } : s));
  }
}
