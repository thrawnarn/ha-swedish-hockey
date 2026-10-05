import { test } from "node:test";
import assert from "node:assert/strict";
import { hassWith, settle } from "./harness.mjs";

async function editor(tag) {
  const element = document.createElement(tag);
  element.hass = hassWith();
  element.setConfig({ team: "Norrby" });
  document.body.appendChild(element);
  await settle(element);
  return element;
}

const names = (schema) => schema.flatMap((s) => (s.schema ? s.schema.map((f) => f.name) : [s.name]));

test("the card's editor offers the teams this Home Assistant has", async () => {
  const element = await editor("hockey-match-card-editor");
  const form = element.shadowRoot.querySelector("ha-form");
  assert.deepEqual(form.schema[0].selector.select.options, [{ value: "Norrby", label: "Norrby" }]);
  assert.ok(names(form.schema).includes("show_powerplay"));
  assert.equal(form.computeLabel({ name: "result_hours" }), "Hold result (hours)");
  element.remove();
});

test("an edit is sent on as the whole config", async () => {
  const element = await editor("hockey-match-card-editor");
  let sent = null;
  element.addEventListener("config-changed", (ev) => (sent = ev.detail.config));
  element.shadowRoot
    .querySelector("ha-form")
    .dispatchEvent(new CustomEvent("value-changed", { detail: { value: { show_tv: false } } }));
  assert.equal(sent.team, "Norrby");
  assert.equal(sent.show_tv, false);
  assert.equal(sent.show_table, true, "the defaults are filled in");
  element.remove();
});

test("the badge's editor leaves out what only the card face shows", async () => {
  const element = await editor("hockey-match-badge-editor");
  const fields = names(element.shadowRoot.querySelector("ha-form").schema);
  for (const gone of ["title", "show_powerplay", "show_shots"]) assert.ok(!fields.includes(gone), gone);
  assert.ok(fields.includes("show_table"));
  element.remove();
});

test("the card picker suggests the first team found", () => {
  const Card = customElements.get("hockey-match-card");
  const Badge = customElements.get("hockey-match-badge");
  assert.deepEqual(Card.getStubConfig(hassWith()), { type: "custom:hockey-match-card", team: "Norrby" });
  assert.deepEqual(Badge.getStubConfig(hassWith()), { type: "custom:hockey-match-badge", team: "NOR" });
});
