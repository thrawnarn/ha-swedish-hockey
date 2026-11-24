/** Which of Home Assistant's entities belong to which followed team. */

import { PLATFORM } from "./constants";
import type { EntityIds, FoundTeam, HomeAssistant } from "./types";

// Entities are grouped by device, one device per team.
//
// Narrow to this integration's entities *first*: `in_progress` on its own also
// matches every update.* entity in Home Assistant, which would list every
// device with a pending update as a team. Within the integration, each entity
// is then told apart by the attributes only it carries - not by entity id,
// which the user is free to rename.
const BY_TRANSLATION_KEY: Record<string, keyof EntityIds> = {
  live_score: "live",
  next_game: "next",
  standing: "standings",
};

export function findTeams(hass: HomeAssistant | undefined): FoundTeam[] {
  if (!hass?.states || !hass?.entities || !hass?.devices) return [];
  const byDevice = new Map<string, EntityIds>();
  for (const [entityId, entry] of Object.entries(hass.entities)) {
    const deviceId = entry?.device_id;
    if (!deviceId) continue;
    // Older frontends may not expose platform; fall back to the domain so we
    // at least never match update.* entities.
    if (entry.platform ? entry.platform !== PLATFORM : !entityId.startsWith("sensor.")) {
      continue;
    }
    const state = hass.states[entityId];
    if (!state) continue;
    const a = state.attributes ?? {};
    let role: keyof EntityIds | null = null;
    if ("in_progress" in a && "live_scoring" in a) role = "live";
    else if ("stat_net_number" in a || "last_result" in a) role = "next";
    else if ("table" in a && "points" in a) role = "standings";
    // An unavailable sensor has no attributes at all, and a card that lost
    // its next game that way said "No entities found" instead of offering the
    // reload. The registry's translation key outlives the state.
    else role = BY_TRANSLATION_KEY[entry.translation_key ?? ""] ?? null;
    if (!role) continue;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, {});
    byDevice.get(deviceId)![role] = entityId;
  }

  const teams: FoundTeam[] = [];
  for (const [deviceId, entities] of byDevice) {
    if (!entities.live && !entities.next) continue;
    const device = hass.devices[deviceId];
    const name = device?.name_by_user || device?.name;
    // The club code is the stable identifier; the device name is whichever
    // spelling the league happened to publish when the device was created.
    const code =
      hass.states[entities.next ?? ""]?.attributes?.team_code ??
      hass.states[entities.standings ?? ""]?.attributes?.team_code;
    if (!name && !code) continue;
    teams.push({ team: (name || code) as string, code, entities });
  }
  return teams.sort((a, b) => a.team.localeCompare(b.team));
}

// Letters and digits only, so "Leksands IF", "Leksand" and "leksand" all meet.
export const clubKey = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ]+/g, "");

// A card configured before a club was renamed - or against the other of the
// league's two spellings for it - should still find its entities.
export function teamMatches(team: FoundTeam, wanted: unknown): boolean {
  const key = clubKey(wanted);
  if (!key) return false;
  if (team.code && clubKey(team.code) === key) return true;
  const name = clubKey(team.team);
  return Boolean(name) && (name.startsWith(key) || key.startsWith(name));
}
