/**
 * What every part of the card is built on.
 *
 * The parts render into the card's own shadow root rather than one each, so
 * the card's single stylesheet reaches all of them and the theme variables do
 * not have to be threaded through a dozen boundaries. The card owns the
 * styles; its parts own their markup and behaviour.
 */

import { LitElement } from "lit";
import type { Ctx } from "./context";

export class LightElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

/** A part of the card: handed the moment (`ctx`), which is a new object every
 *  time the card renders, so every part renders with it. */
export class PartElement extends LightElement {
  declare ctx: Ctx;

  static override properties = {
    ctx: { attribute: false },
  };
}

/** Register once. A second copy of the card on the page -- an old resource
 *  URL still cached next to a new one -- must not take the page down with
 *  "already defined". */
export function define(name: string, element: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, element);
}

/** Enter and Space on something drawn as a button, as a click would be. */
export function onActivate(action: (ev: KeyboardEvent) => void) {
  return (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      action(ev);
    }
  };
}

/** The message of whatever was thrown. */
export function errorText(err: unknown): string {
  return (err as Error)?.message || String(err);
}
