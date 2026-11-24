/**
 * The card, running in a real DOM (happy-dom), against a Home Assistant made
 * of plain objects and the made-up league in fixture.mjs.
 *
 * Tests load the built bundle -- the file a browser would load -- and the pure
 * modules separately, both built by `node build.mjs --test`.
 */

// Times are written in the dashboard's clock, so the tests pin one: a game at
// 17:00 UTC reads 19:00, wherever the tests run.
process.env.TZ = "Europe/Stockholm";

// The card writes Swedish through Intl. A Node built on a system ICU with only
// English data (Alpine's icu-data-en) quietly answers in English instead, and
// the failures then look like the card's own bugs.
if (new Intl.RelativeTimeFormat("sv", { numeric: "auto" }).format(0, "day") !== "i dag") {
  throw new Error(
    "This Node has no Swedish locale data: install full ICU data (Alpine: " +
      "apk add icu-data-full) or point ICU_DATA at a directory holding it.",
  );
}

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { NOW, REGISTRY, sensors, services } from "./fixture.mjs";

GlobalRegistrator.register({ url: "http://localhost/", width: 390, height: 844 });

// One fixed moment: "today", "tomorrow" and whether a result is still held
// all depend on the clock.
{
  const FIXED = NOW.getTime();
  const Real = globalThis.Date;
  class FixedDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(FIXED);
      else super(...args);
    }
    static now() {
      return FIXED;
    }
  }
  globalThis.Date = FixedDate;
}

// Home Assistant's own elements, as far as the card needs them to exist.
customElements.define("ha-card", class extends HTMLElement {});
customElements.define("ha-icon", class extends HTMLElement {});
customElements.define("ha-form", class extends HTMLElement {});

await import("../.cache/hockey-match-card.js");
export const I = await import("../.cache/internals.mjs");

/**
 * A Home Assistant: the fixture's sensors and registry, Swedish and a 24-hour
 * clock, and every service call recorded. `answers` replaces what a service
 * answers; an answer may be a promise, so a test can hold a reply back.
 */
export function hassWith({ states = sensors(), answers = {}, entities, devices } = {}) {
  const full = {};
  for (const [id, value] of Object.entries(states)) {
    full[id] = { entity_id: id, state: String(value.state ?? ""), attributes: value.attributes || {} };
  }
  const table = { ...services(), ...answers };
  const hass = {
    states: full,
    entities: entities ?? REGISTRY.entities,
    devices: devices ?? REGISTRY.devices,
    locale: { language: "sv", time_format: "24" },
    language: "sv",
    calls: [],
    async callService(domain, service, data, target, notify, returnResponse) {
      hass.calls.push({ domain, service, data, returnResponse });
      const answer = table[service];
      const value = typeof answer === "function" ? await answer(data) : await answer;
      return { response: value ?? {} };
    },
    async callWS() {
      return {};
    },
  };
  return hass;
}

/** The calls made to one service, in order. */
export const callsTo = (hass, service) => hass.calls.filter((c) => c.service === service);

/** A reply the test lets go of when it chooses. */
export function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

export const CARD_CONFIG = { type: "custom:hockey-match-card", team: "Norrby" };

/** Put a card (or a badge) on the page and wait for it to draw. */
export async function mount(config = CARD_CONFIG, hass = hassWith(), tag = "hockey-match-card") {
  const card = document.createElement(tag);
  card.setConfig(config);
  card.hass = hass;
  document.body.appendChild(card);
  await settle(card);
  return card;
}

/** Wait until the card, everything inside it, and any service replies have
 *  finished. Parts render into the card's shadow root, so one walk finds
 *  them all. */
export async function settle(card) {
  for (let pass = 0; pass < 30; pass++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = [];
    const visit = (node) => {
      if (!node) return;
      if (node.updateComplete && node.isUpdatePending) pending.push(node.updateComplete);
      for (const child of node.children ?? []) visit(child);
    };
    visit(card);
    visit(card.shadowRoot);
    if (!pending.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!card.isUpdatePending) return;
    }
    await Promise.all(pending);
  }
}

/** The first element matching, anywhere in the card. */
export const $ = (card, selector) => card.shadowRoot.querySelector(selector);
export const $$ = (card, selector) => [...card.shadowRoot.querySelectorAll(selector)];

/** Text as a reader sees it: whitespace folded. */
export const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Click the first element matching (or carrying the given text), then wait. */
export async function tap(card, selector, containing = null) {
  const node = containing
    ? $$(card, selector).find((el) => text(el).includes(containing))
    : $(card, selector);
  if (!node) throw new Error(`nothing to tap: ${selector}${containing ? ` "${containing}"` : ""}`);
  node.click();
  await settle(card);
  return node;
}

/** Choose an option in a native select, as the phone's picker would. */
export async function choose(card, selector, value) {
  const select = $(card, selector);
  if (!select) throw new Error(`no select: ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await settle(card);
}

/** Leave the card on the page no longer. */
export function unmount(card) {
  card.remove();
}
