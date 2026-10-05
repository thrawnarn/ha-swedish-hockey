/**
 * <hockey-loading>: something to look at while a read is out.
 *
 * The shape of what is coming, shimmering and fading away down the panel,
 * under a line saying what is being fetched. Widths vary row to row, as names
 * do, but are the same every time, so nothing jumps while it waits.
 */

import { html, nothing, type TemplateResult } from "lit";
import { LightElement } from "../base";

export type LoadingShape = "fixtures" | "games" | "table" | "cards" | "hero";

const WIDTHS = [62, 46, 74, 54, 40, 68, 50, 58, 44];

const bone = (cls: string, width?: number) =>
  html`<span class="sk ${cls}" style=${width ? `width: ${width}%` : nothing}></span>`;

const tableRow = (i: number) => html`
  <div class="sk-row">
    ${bone("sk-num")}${bone("sk-crest")}${bone("sk-line", WIDTHS[i % WIDTHS.length])}
    ${bone("sk-num")}${bone("sk-num")}${bone("sk-num")}
  </div>
`;

const fixture = (i: number) => html`
  <div class="sk-fixture">
    ${bone("sk-when")}
    <span class="sk-side">${bone("sk-crest")}${bone("sk-line", WIDTHS[i % 9])}</span>
    <span class="sk-side">${bone("sk-crest")}${bone("sk-line", WIDTHS[(i + 4) % 9])}</span>
  </div>
`;

const card = (c: number) => html`
  <div class="sk-card">
    ${bone("sk-line", 70)}
    <span class="sk-side">${bone("sk-avatar")}${bone("sk-line", 60)}</span>
    ${[0, 1, 2, 3].map(
      (r) => html`<span class="sk-side">${bone("sk-crest")}${bone("sk-line", WIDTHS[c + r])}</span>`,
    )}
  </div>
`;

const rows = (n: number, row: (i: number) => TemplateResult) =>
  Array.from({ length: n }, (_, i) => row(i));

function skeleton(shape: LoadingShape) {
  switch (shape) {
    case "table":
      return rows(9, tableRow);
    case "cards":
      return html`
        ${bone("sk-block sk-ours")} ${bone("sk-heading")}
        <div class="sk-cards">${card(0)}${card(3)}</div>
      `;
    case "hero":
      return html`${bone("sk-block sk-hero")}${rows(5, tableRow)}`;
    // One day's games, or one club's season: no day headings over them.
    case "games":
      return rows(5, fixture);
    default:
      return html`
        ${bone("sk-heading")}${rows(2, fixture)} ${bone("sk-heading")}${rows(3, (i) =>
          fixture(i + 2),
        )}
      `;
  }
}

export class HockeyLoading extends LightElement {
  declare label: string;
  declare shape: LoadingShape;

  static override properties = {
    label: {},
    shape: {},
  };

  constructor() {
    super();
    this.label = "";
    this.shape = "fixtures";
  }

  protected override render() {
    return html`
      <div class="loading" role="status">
        <div class="loading-label"><span class="spinner"></span><span>${this.label}</span></div>
        <div class="skeleton" aria-hidden="true">${skeleton(this.shape)}</div>
      </div>
    `;
  }
}

/** The loader, as a view writes it. */
export const loading = (label: string, shape: LoadingShape = "fixtures") =>
  html`<hockey-loading .label=${label} .shape=${shape}></hockey-loading>`;
