// Hockey match card - live score while a game is on, next fixture otherwise.
// Visual language borrowed from shl-card: two faded club badges bleeding off
// the top corners, the badges again either side of a centred detail column.

// Lit comes from Home Assistant's own bundle. Importing a second copy from a
// CDN gives you a different LitElement class and the card silently misbehaves.
const LitElement =
  customElements.get('hui-masonry-view')
    ? Object.getPrototypeOf(customElements.get('hui-masonry-view'))
    : Object.getPrototypeOf(customElements.get('hui-view'));
const { html, css } = LitElement.prototype;
// Lit resolves null and undefined to its own `nothing` sentinel, which removes
// an attribute and skips addEventListener. An empty string does neither: it is
// registered as a listener, and the first click calls "".handleEvent().
const nothing = undefined;

const DEFAULTS = {
  show_clock: true,
  show_powerplay: true,
  show_shots: true,
  show_tv: true,
  show_events: true,
  show_table: true,
  show_results: true,
  show_stats: true,
  result_hours: 6,
};

const PLATFORM = 'swedish_hockey';

// The three lines both leagues draw across their own table, after 6th, 10th
// and 12th. Drawn above the row below each cut, since the rows carry a top
// border already.
const TABLE_CUTS = [6, 10, 12];

// How many played games the league schedule reaches back over.
const SCHEDULE_BEFORE = 100;

// The roster opens on points, the way a league prints one.
const ROSTER_SORT = { key: 'TP', dir: 'desc' };

// How a finished game was decided, said under its score; a game won in
// regulation needs nothing said.
const DECIDED_IN = {
  OT: 'Efter förlängning',
  SO: 'Efter straffar',
  PSO: 'Efter straffar',
};

// The stats on show before "Visa mer".
const KEY_STATS = new Set(['shots_on_goal', 'penalty_minutes']);

const STAT_LABELS = {
  shots_on_goal: 'Skott på mål (SOG)',
  shot_attempts: 'Skottförsök',
  blocked: 'Blockerade skott (BLK)',
  shooting_pct: 'Skotteffektivitet (S%)',
  saves: 'Räddningar (SVS)',
  save_pct: 'Räddningsprocent (SV%)',
  powerplay: 'Powerplay (PP%)',
  shorthanded_goals: 'Boxplaymål (SHG)',
  penalty_minutes: 'Utvisningsminuter (PIM)',
};

// The league's statistics, as the Statistik tab reads them. Every figure the
// service sends is named once here: what it is called in full, what heads its
// column, how it is written, and which way is better. `ok` names the flag that
// says a player has done enough of it to be ranked - two shots and one goal is
// not the league's best shooter - and `games` asks for a third of the most
// games anyone has played, for a figure that is an average per game.
const SKATER_METRICS = {
  GP: { label: 'Matcher', short: 'M' },
  G: { label: 'Mål', short: 'Mål' },
  A: { label: 'Assist', short: 'A' },
  TP: { label: 'Poäng', short: 'P' },
  TP_GP: { label: 'Poäng per match', short: 'P/M', kind: 'dec', games: true },
  PlusMinus: { label: 'Plus/minus', short: '+/-', kind: 'pm' },
  PIM: { label: 'Utvisningsminuter', short: 'Utv' },
  SOG: { label: 'Skott på mål', short: 'Skott' },
  S_perc: { label: 'Skotteffektivitet', short: 'S%', kind: 'pct', ok: 'S_perc_ok' },
  PPG: { label: 'Powerplaymål', short: 'PPM' },
  PPP: { label: 'Powerplaypoäng', short: 'PPP' },
  SHG: { label: 'Boxplaymål', short: 'BPM' },
  GWG: { label: 'Matchvinnande mål', short: 'GWG' },
  A1: { label: 'Primära assist', short: 'A1' },
  ENG: { label: 'Mål i tom kasse', short: 'TK' },
  GFG: { label: 'Matchens första mål', short: '1–0' },
  Hits: { label: 'Tacklingar', short: 'Tackl' },
  BKS: { label: 'Blockerade skott', short: 'Block' },
  TOI_GP: { label: 'Istid per match', short: 'Istid', kind: 'time', games: true },
  PPTOI_GP: { label: 'Istid i powerplay', short: 'PP-tid', kind: 'time', games: true },
  SHTOI_GP: { label: 'Istid i boxplay', short: 'BP-tid', kind: 'time', games: true },
  FO_perc: { label: 'Vunna tekningar', short: 'Tekn%', kind: 'pct', ok: 'FO_perc_ok' },
  FOW: { label: 'Vunna tekningar', short: 'TV' },
  CF_perc: { label: 'Corsi (skottförsök)', short: 'CF%', kind: 'pct', games: true },
};

const GOALIE_METRICS = {
  GPI: { label: 'Matcher', short: 'M' },
  SVS_perc: { label: 'Räddningsprocent', short: 'Rädd%', kind: 'pct', ok: 'ok' },
  GAA: { label: 'Insläppta mål per match', short: 'GAA', kind: 'dec', dir: 'asc', ok: 'ok' },
  SO: { label: 'Hållna nollor', short: 'N' },
  W: { label: 'Vinster', short: 'V' },
  L: { label: 'Förluster', short: 'F' },
  SVS: { label: 'Räddningar', short: 'Rädd' },
  GA: { label: 'Insläppta mål', short: 'IM', dir: 'asc' },
  SOGA: { label: 'Skott emot', short: 'SE' },
  MIP: { label: 'Speltid', short: 'Tid', kind: 'time' },
  EV_SVS_perc: { label: 'Räddningsprocent 5 mot 5', short: '5v5%', kind: 'pct', ok: 'ok' },
  PK_SVS_perc: { label: 'Räddningsprocent i boxplay', short: 'BP%', kind: 'pct', ok: 'ok' },
};

const TEAM_METRICS = {
  GP: { label: 'Matcher', short: 'M' },
  PTS: { label: 'Poäng', short: 'P' },
  PTS_GP: { label: 'Poäng per match', short: 'P/M', kind: 'dec' },
  GF_GP: { label: 'Gjorda mål per match', short: 'GM/M', kind: 'dec' },
  GA_GP: { label: 'Insläppta mål per match', short: 'IM/M', kind: 'dec', dir: 'asc' },
  GD: { label: 'Målskillnad', short: '+/-', kind: 'pm' },
  first_goal: { label: 'Gjorde matchens första mål', short: '1–0' },
  PP_perc: { label: 'Powerplay', short: 'PP%', kind: 'pct' },
  PPG: { label: 'Powerplaymål', short: 'PPM' },
  PPO: { label: 'Powerplaychanser', short: 'PPC' },
  PK_perc: { label: 'Boxplay', short: 'BP%', kind: 'pct' },
  PPGA: { label: 'Insläppta i boxplay', short: 'IBP', dir: 'asc' },
  SHG: { label: 'Boxplaymål', short: 'BPM' },
  ST_perc: { label: 'Special teams (PP% + BP%)', short: 'ST', kind: 'pct' },
  SOG_GP: { label: 'Skott per match', short: 'S/M', kind: 'dec' },
  S_perc: { label: 'Skotteffektivitet', short: 'S%', kind: 'pct' },
  SOGA_GP: { label: 'Skott emot per match', short: 'SE/M', kind: 'dec', dir: 'asc' },
  SVS_perc: { label: 'Räddningsprocent', short: 'Rädd%', kind: 'pct' },
  FO_perc: { label: 'Vunna tekningar', short: 'Tekn%', kind: 'pct' },
  PIM_GP: { label: 'Utvisningsminuter per match', short: 'Utv/M', kind: 'dec', dir: 'asc' },
  Hits: { label: 'Tacklingar', short: 'Tackl' },
  BKS: { label: 'Blockerade skott', short: 'Block' },
  CF_perc: { label: 'Corsi (skottförsök)', short: 'CF%', kind: 'pct' },
  PDO: { label: 'PDO (S% + Rädd%)', short: 'PDO', kind: 'dec1' },
  ENG: { label: 'Mål i tom kasse', short: 'TK' },
  ATT_avg: { label: 'Publiksnitt hemma', short: 'Snitt', kind: 'crowd' },
  ATT_total: { label: 'Publik hemma totalt', short: 'Totalt', kind: 'crowd' },
  ATT_GP: { label: 'Hemmamatcher', short: 'M' },
};

const STATS_KINDS = {
  skaters: { metrics: SKATER_METRICS, label: 'Utespelare' },
  goalies: { metrics: GOALIE_METRICS, label: 'Målvakter' },
  teams: { metrics: TEAM_METRICS, label: 'Lag' },
};

const STATS_SECTIONS = [
  ['leaders', 'Ledare'],
  ['skaters', 'Spelare'],
  ['goalies', 'Målvakter'],
  ['teams', 'Lag'],
];

// A table is a handful of columns at a time - a phone has room for five
// beside a name - grouped the way a league's own stats pages group them.
// Each group opens sorted on the figure it is about, not on its first column.
const STATS_COLUMNS = {
  skaters: [
    { id: 'points', label: 'Poäng', sort: 'TP', columns: ['GP', 'G', 'A', 'TP', 'PlusMinus'] },
    { id: 'shots', label: 'Skott', sort: 'SOG', columns: ['SOG', 'S_perc', 'PPG', 'PPP', 'GWG'] },
    {
      id: 'ice',
      label: 'Istid',
      sort: 'TOI_GP',
      columns: ['TOI_GP', 'PPTOI_GP', 'SHTOI_GP', 'TP_GP', 'CF_perc'],
    },
    { id: 'play', label: 'Spel', sort: 'PIM', columns: ['PIM', 'Hits', 'BKS', 'FOW', 'FO_perc'] },
  ],
  goalies: [
    {
      id: 'summary',
      label: 'Översikt',
      sort: 'SVS_perc',
      columns: ['GPI', 'SVS_perc', 'GAA', 'SO', 'W'],
    },
    {
      id: 'saves',
      label: 'Räddningar',
      sort: 'SVS',
      columns: ['SOGA', 'SVS', 'GA', 'EV_SVS_perc', 'PK_SVS_perc'],
    },
  ],
  teams: [
    {
      id: 'special',
      label: 'Special teams',
      sort: 'PP_perc',
      columns: ['PP_perc', 'PPG', 'PK_perc', 'SHG', 'ST_perc'],
    },
    {
      id: 'goals',
      label: 'Mål',
      sort: 'GF_GP',
      columns: ['GF_GP', 'GA_GP', 'GD', 'first_goal', 'PTS_GP'],
    },
    {
      id: 'shots',
      label: 'Skott',
      sort: 'SOG_GP',
      columns: ['SOG_GP', 'S_perc', 'SOGA_GP', 'SVS_perc', 'PDO'],
    },
    {
      id: 'play',
      label: 'Spel',
      sort: 'FO_perc',
      columns: ['FO_perc', 'PIM_GP', 'Hits', 'BKS', 'CF_perc'],
    },
    { id: 'crowd', label: 'Publik', sort: 'ATT_avg', columns: ['ATT_avg', 'ATT_total', 'ATT_GP'] },
  ],
};

// The leaders, a row of cards per kind. The first few of each are what the
// league's own front page leads with; the rest are a swipe along.
const STATS_LEADERS = {
  skaters: ['TP', 'G', 'A', 'PlusMinus', 'PPP', 'GWG', 'SOG', 'S_perc', 'FO_perc', 'TOI_GP', 'Hits', 'BKS', 'PIM'],
  goalies: ['SVS_perc', 'GAA', 'SO', 'W'],
  teams: ['PP_perc', 'PK_perc', 'GF_GP', 'GA_GP', 'SOG_GP', 'SVS_perc', 'FO_perc', 'PIM_GP', 'ATT_avg'],
};

// A club's figures on its own page, in groups, each against the league.
const TEAM_STAT_GROUPS = [
  { label: 'Resultat', keys: ['PTS_GP', 'GF_GP', 'GA_GP', 'GD', 'first_goal'] },
  { label: 'Special teams', keys: ['PP_perc', 'PK_perc', 'PPG', 'PPGA', 'SHG', 'ST_perc'] },
  { label: 'Skott', keys: ['SOG_GP', 'S_perc', 'SOGA_GP', 'SVS_perc', 'CF_perc', 'PDO'] },
  { label: 'Spel', keys: ['FO_perc', 'PIM_GP', 'Hits', 'BKS'] },
  { label: 'Publik', keys: ['ATT_avg', 'ATT_total'] },
];

// What the statistics can be narrowed to, and how the service is asked for
// each. Last-few-games is Hockeyallsvenskan's alone; the service says so.
// `short` is what the chip in the filter row says once it is chosen.
const STATS_SCOPES = [
  { id: 'season', label: 'Hela säsongen', short: 'Säsong', data: {} },
  { id: 'last5', label: 'Senaste 5 matcherna', short: 'Senaste 5', data: { last: 5 }, needs: 'last' },
  { id: 'last10', label: 'Senaste 10 matcherna', short: 'Senaste 10', data: { last: 10 }, needs: 'last' },
  { id: 'home', label: 'Hemmamatcher', short: 'Hemma', data: { location: 'home' } },
  { id: 'away', label: 'Bortamatcher', short: 'Borta', data: { location: 'away' } },
];

// The filter row's choices as [value, the option in full, what the chip
// says]. The first of each is the unfiltered view, and the chip is only
// lit once something else is chosen.
const TABLE_PERIODS = [
  ['0', 'Hela säsongen', 'Säsong'],
  ['5', 'Senaste 5 matcherna', 'Senaste 5'],
  ['10', 'Senaste 10 matcherna', 'Senaste 10'],
  ['15', 'Senaste 15 matcherna', 'Senaste 15'],
];
const POSITION_FILTERS = [
  ['', 'Alla positioner', 'Position'],
  ['f', 'Forwards'],
  ['d', 'Backar'],
];

// How long a read is good for in the card. The integration keeps its own copy
// for ten minutes, so this only spares the round trip.
const STATS_FRESH = 5 * 60e3;
const STATS_PAGE = 40;

// A figure as a Swedish page writes it: a decimal comma, a crowd in groups of
// three. With `unit`, a percentage says so; a column head says it for a table.
function formatStat(value, kind, unit = false) {
  if (value === null || value === undefined || value === '') return '–';
  const number = Number(value);
  switch (kind) {
    case 'pct':
      return Number.isFinite(number)
        ? `${number.toFixed(1).replace('.', ',')}${unit ? ' %' : ''}`
        : String(value);
    case 'dec':
      return Number.isFinite(number) ? number.toFixed(2).replace('.', ',') : String(value);
    case 'dec1':
      return Number.isFinite(number) ? number.toFixed(1).replace('.', ',') : String(value);
    case 'pm':
      return number > 0 ? `+${number}` : String(value);
    case 'crowd':
      return Number.isFinite(number)
        ? String(Math.round(number)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
        : String(value);
    default:
      return String(value);
  }
}

// A figure as a number to sort and rank by: "18:41" of ice time is seconds.
function statNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.includes(':')) {
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 1:a, 2:a, 3:e … 11:e, 12:e, 21:a - the way Swedish writes a place.
function ordinal(n) {
  const tens = n % 100;
  const last = n % 10;
  return `${n}:${(last === 1 || last === 2) && tens !== 11 && tens !== 12 ? 'a' : 'e'}`;
}

// Rows ranked on one figure, best first, with a place each. Equal figures
// share a place and the next one along skips, as a league table does. Rows
// without the figure are left out; rows short of the minimum for a rate are
// kept apart from the ranked ones, so a list can show them after.
//
// The card is drawn again every time anything in Home Assistant changes, so a
// ranking is kept against the list it was made from: the same list asked the
// same question gets the same answer without sorting three hundred rows again.
const RANKINGS = new WeakMap();
function rankStats(rows, key, metric = {}, dir = metric.dir ?? 'desc') {
  const question = `${key}|${dir}`;
  const kept = rows ? RANKINGS.get(rows) : undefined;
  if (kept?.has(question)) return kept.get(question);
  const answer = rankAnew(rows, key, metric, dir);
  if (rows) {
    if (kept) kept.set(question, answer);
    else RANKINGS.set(rows, new Map([[question, answer]]));
  }
  return answer;
}

function rankAnew(rows, key, metric, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  const withValue = (rows ?? []).filter((row) => statNumber(row[key]) !== null);
  let floor = 0;
  if (metric.games) {
    const most = Math.max(0, ...withValue.map((row) => Number(row.GP ?? row.GPI ?? 0)));
    floor = Math.ceil(most / 3);
  }
  const qualifies = (row) =>
    (!metric.ok || row[metric.ok] !== false) &&
    (!floor || Number(row.GP ?? row.GPI ?? 0) >= floor);
  const byValue = (a, b) =>
    sign * (statNumber(a[key]) - statNumber(b[key])) ||
    String(a.player ?? a.team ?? '').localeCompare(String(b.player ?? b.team ?? ''), 'sv');
  const ranked = withValue.filter(qualifies).sort(byValue);
  const rest = withValue.filter((row) => !qualifies(row)).sort(byValue);
  let place = 0;
  let previous = null;
  const placed = ranked.map((row, index) => {
    const value = statNumber(row[key]);
    if (value !== previous) {
      place = index + 1;
      previous = value;
    }
    return { row, rank: place };
  });
  return { ranked: placed, rest: rest.map((row) => ({ row, rank: null })) };
}

// "Tyler Kelleher" as "T. Kelleher", for a narrow column.
function shortName(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

// A club's own colour, kept off the extremes: several play in near-black or
// near-white, which disappears into one theme or the other.
function clubColour(hex, fallback) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  let [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const mix = (channel, towards, amount) =>
    Math.round(channel + (towards - channel) * amount);
  if (luminance < 0.22) {
    [r, g, b] = [mix(r, 255, 0.45), mix(g, 255, 0.45), mix(b, 255, 0.45)];
  } else if (luminance > 0.82) {
    [r, g, b] = [mix(r, 0, 0.3), mix(g, 0, 0.3), mix(b, 0, 0.3)];
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// The league's six position codes, as a letter to wear and a line to group by.
const POSITIONS = {
  GK: { letter: 'MV', group: 'gk' },
  LD: { letter: 'B', group: 'd' },
  RD: { letter: 'B', group: 'd' },
  LW: { letter: 'F', group: 'f' },
  RW: { letter: 'F', group: 'f' },
  CE: { letter: 'C', group: 'f' },
  // SHL says no more than forward or defence.
  F: { letter: 'F', group: 'f' },
  D: { letter: 'B', group: 'd' },
};
const POSITION_GROUPS = [
  { id: 'gk', label: 'Målvakter' },
  { id: 'd', label: 'Backar' },
  { id: 'f', label: 'Forwards' },
  { id: 'other', label: 'Övriga' },
];

// A player the league has no profile for still belongs somewhere: the stats
// tables at least say which of them keep goal.
const positionOf = (player) =>
  POSITIONS[String(player.position_code ?? '').toUpperCase()] ??
  (player.role === 'goalkeeper' ? POSITIONS.GK : { letter: '', group: 'other' });

const RECAP_ICON = { goal: '🚨', penalty: '🟨' };

// A shootout attempt is worth telling apart at a glance: the same siren as any
// other goal when it goes in, a plain cross when it does not.
const recapIcon = (event) =>
  event.kind === 'penalty_shot'
    ? event.scored
      ? '🚨'
      : '❌'
    : (RECAP_ICON[event.kind] ?? '•');

// The feed numbers the three periods and names what follows - and not always
// the same way: a shootout is "SO" in one game and "PSO" in the next.
function periodLabel(period) {
  const text = String(period ?? '').trim().toUpperCase();
  if (!text) return '';
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    if (number <= 3) return `Period ${number}`;
    return number === 4 ? 'Förlängning' : 'Straffar';
  }
  if (text.includes('SO')) return 'Straffar';
  if (text.includes('OT') || text.includes('EXT')) return 'Förlängning';
  return text;
}
const isCut = (rank) => TABLE_CUTS.includes(Number(rank) - 1);
// Which stretch of the table between two cuts a rank falls in: 0 above the
// first, and so on. The table colours each stretch at its left edge.
const zoneOf = (rank) => {
  const n = Number(rank);
  if (!n) return null;
  const zone = TABLE_CUTS.findIndex((cut) => n <= cut);
  return zone === -1 ? TABLE_CUTS.length : zone;
};

// Entities are grouped by device, one device per team.
//
// Narrow to this integration's entities *first*: `in_progress` on its own also
// matches every update.* entity in Home Assistant, which would list every
// device with a pending update as a team. Within the integration, each entity
// is then told apart by the attributes only it carries - not by entity id,
// which the user is free to rename.
function findTeams(hass) {
  if (!hass?.states || !hass?.entities || !hass?.devices) return [];
  const byDevice = new Map();
  for (const [entityId, entry] of Object.entries(hass.entities)) {
    const deviceId = entry?.device_id;
    if (!deviceId) continue;
    // Older frontends may not expose platform; fall back to the domain so we
    // at least never match update.* entities.
    if (entry.platform ? entry.platform !== PLATFORM : !entityId.startsWith('sensor.')) {
      continue;
    }
    const state = hass.states[entityId];
    if (!state) continue;
    const a = state.attributes ?? {};
    let role = null;
    if ('in_progress' in a && 'live_scoring' in a) role = 'live';
    else if ('stat_net_number' in a || 'last_result' in a) role = 'next';
    else if ('table' in a && 'points' in a) role = 'standings';
    if (!role) continue;
    if (!byDevice.has(deviceId)) byDevice.set(deviceId, {});
    byDevice.get(deviceId)[role] = entityId;
  }

  const teams = [];
  for (const [deviceId, entities] of byDevice) {
    if (!entities.live && !entities.next) continue;
    const device = hass.devices[deviceId];
    const name = device?.name_by_user || device?.name;
    // The club code is the stable identifier; the device name is whichever
    // spelling the league happened to publish when the device was created.
    const code =
      hass.states[entities.next]?.attributes?.team_code ??
      hass.states[entities.standings]?.attributes?.team_code;
    if (!name && !code) continue;
    teams.push({ team: name || code, code, entities });
  }
  return teams.sort((a, b) => a.team.localeCompare(b.team));
}

// Letters and digits only, so "Leksands IF", "Leksand" and "leksand" all meet.
const clubKey = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^0-9a-zà-ÿ]+/g, '');

// A card configured before a club was renamed - or against the other of the
// league's two spellings for it - should still find its entities.
function teamMatches(team, wanted) {
  const key = clubKey(wanted);
  if (!key) return false;
  if (team.code && clubKey(team.code) === key) return true;
  const name = clubKey(team.team);
  return Boolean(name) && (name.startsWith(key) || key.startsWith(name));
}

const WEEKDAY = { weekday: 'long' };
const DATE = { day: 'numeric', month: 'long' };
const TIME = { hour: '2-digit', minute: '2-digit' };
const SHORT_DATE = { day: 'numeric', month: 'short' };

// Home Assistant keeps the clock apart from the language: the profile can be
// English and still ask for 19:00. hass.locale.time_format is "24", "12",
// "language" (whatever that language does) or "system" (whatever the browser
// does, which is what an undefined locale falls back to).
function localeOf(hass) {
  const locale = hass?.locale;
  if (locale?.time_format === 'system') return undefined;
  return locale?.language || 'sv-SE';
}

// On the day itself "Wednesday" is worse than "Today", and the word differs by
// language. Intl knows it in every language the dashboard can be set to, so the
// card never has to carry a translation of its own.
function relativeDay(date, locale) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Whole calendar days apart, so an evening game is still "today" at 08:00
  // and the rounding absorbs a 23 or 25 hour day over a clock change.
  const days = Math.round((midnight(date) - midnight(new Date())) / 86400000);
  if (days !== 0 && days !== 1) return null;
  try {
    const text = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      days,
      'day',
    );
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch (err) {
    return null;
  }
}

function timeFormat(hass) {
  switch (hass?.locale?.time_format) {
    // h23 rather than hour12:false - that spells midnight "24:00".
    case '24':
      return { ...TIME, hourCycle: 'h23' };
    case '12':
      return { ...TIME, hour12: true };
    default:
      return TIME;
  }
}

// On a phone the dialog is the whole screen, as an app's page would be: the
// view scrolls at the top and the sections are a tab bar along the bottom,
// clear of the home indicator. Added last to both the card's styles and the
// badge's, so it wins over either's wide-screen layout.
const PHONE_DIALOG = css`
  @media (max-width: 600px) {
    dialog:not(.picker) {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      margin: 0;
      border-radius: 0;
      box-shadow: none;
    }
    dialog:not(.picker)[open] { animation: sheet-in 0.22s ease-out; }
    .dialog-close { top: calc(6px + env(safe-area-inset-top, 0px)); }
    .panel { padding-top: calc(44px + env(safe-area-inset-top, 0px)); }
    .panel.tight { padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
    /* The scoreboard has no line of its own to share with the close button,
       as a back button or a heading does, so it starts below it. */
    .panel > .scoreboard:first-child { margin-top: 32px; }
    .section-switch { display: none; }
    .section-heading { display: block; }
    .dialog-nav {
      display: flex;
      order: 1;
      flex: none;
      flex-wrap: nowrap;
      gap: 0;
      padding: 4px 4px calc(6px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--divider-color);
      background: var(--ha-card-background, var(--card-background-color, #fff));
    }
    .dialog-nav .bar-button {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
      padding: 6px 2px 4px;
      border-radius: 12px;
      background: none;
      font-size: 0.72em;
    }
    .dialog-nav .bar-button > span:not(.bar-badge) {
      max-width: 100%;
      /* The button's line-height of 1 clips descenders at this size. */
      line-height: 1.3;
    }
    .dialog-nav .bar-button ha-icon {
      --mdc-icon-size: 22px;
      padding: 3px 18px;
      border-radius: 14px;
      transition: background-color 0.15s ease;
    }
    .dialog-nav .bar-button.active { background: none; color: var(--primary-color); }
    .dialog-nav .bar-button.active ha-icon {
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .dialog-nav .bar-badge {
      position: absolute;
      top: 2px;
      left: calc(50% + 10px);
      padding: 1px 5px;
      font-size: 0.85em;
      color: #fff;
      background: var(--error-color, #e53935);
    }
    /* The tab bar under the panel keeps clear of the home indicator. */
    .filter-bar { padding-bottom: 10px; }
    /* The club list comes up from the foot of the screen, as a phone's own
       pickers do, with the thumb already where its buttons are. */
    dialog.picker {
      width: 100vw;
      max-width: 100vw;
      max-height: 85vh;
      max-height: 85dvh;
      margin: auto 0 0;
      border-radius: 20px 20px 0 0;
    }
    dialog.picker[open] { animation: picker-up 0.26s cubic-bezier(0.2, 0.8, 0.3, 1); }
    .picker-foot { padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  }
  @keyframes sheet-in {
    from { transform: translateY(24px); opacity: 0; }
  }
  @keyframes picker-up {
    from { transform: translateY(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog[open],
    dialog.picker[open] { animation: none; }
    .dialog-nav .bar-button ha-icon { transition: none; }
  }
`;

class HockeyMatchCard extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
      _view: { state: true },
      _panel: { state: true },
      _liveTable: { state: true },
      _recap: { state: true },
      _team: { state: true },
      _tableView: { state: true },
      _player: { state: true },
      _schedule: { state: true },
      _results: { state: true },
      _photo: { state: true },
      _trend: { state: true },
      _tonight: { state: true },
      _statsOpen: { state: true },
      _day: { state: true },
      _stats: { state: true },
      _statsData: { state: true },
      _picker: { state: true },
    };
  }

  static getConfigElement() {
    return document.createElement('hockey-match-card-editor');
  }

  static getStubConfig(hass) {
    return {
      type: 'custom:hockey-match-card',
      team: findTeams(hass)[0]?.team ?? '',
    };
  }

  setConfig(config) {
    if (!config?.team && !config?.live_entity && !config?.next_entity) {
      throw new Error('Pick a team');
    }
    this._config = { ...DEFAULTS, ...config };
  }

  // Entities are found from the team's device, so the card config stays a
  // single team name. Explicit *_entity keys still win, for hand-written YAML.
  _entities() {
    if (this._entityCache) return this._entityCache;
    const found = this._config.team
      ? (findTeams(this.hass).find((t) => teamMatches(t, this._config.team))
          ?.entities ?? {})
      : {};
    this._entityCache = {
      live: this._config.live_entity ?? found.live,
      next: this._config.next_entity ?? found.next,
      standings: this._config.standings_entity ?? found.standings,
    };
    return this._entityCache;
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { rows: 4, columns: 12, min_rows: 3, min_columns: 6 };
  }

  _state(entityId) {
    return entityId ? this.hass?.states?.[entityId] : undefined;
  }

  // Every fetch is stamped, and every step away from a view - back, close, or
  // opening something else - moves the stamp on. A reply that comes back
  // stamped with anything but the current number answers a question nobody is
  // asking any more, and writing it would either resurrect a view the user has
  // left or merge one club's season into another's.
  _newRequest() {
    this._request = (this._request ?? 0) + 1;
    return this._request;
  }

  _stale(token) {
    return token !== this._request;
  }

  render() {
    if (!this.hass || !this._config) return nothing;

    // Cleared once per render: _entities() is asked for five times over a
    // render and each answer walks the whole entity registry.
    this._entityCache = null;
    const ids = this._entities();
    const live = this._state(ids.live);
    const next = this._state(ids.next);

    // The live sensor keeps the last final score on show between games, so
    // "is there data" is not the question - in_progress is.
    const isLive = live?.attributes?.in_progress === true;

    // After the whistle the result stays up for a while, with an arrow across
    // to the next fixture. _view pins the choice once the user has made one.
    const holdHours = Number(this._config.result_hours ?? 6);
    const lastResult = next?.attributes?.last_result ?? null;
    const recent = !isLive && this._resultIsRecent(lastResult, holdHours);
    // Pinned to the result it was made about: a choice to skip one game's
    // score must not hide the next game's.
    const pinned = this._view?.id === (lastResult?.start ?? null) ? this._view.choice : null;
    const showResult = isLive || (recent && pinned !== 'next');
    const canToggle = recent;

    // A held result is drawn from last_result on the next-game sensor, so the
    // live sensor is only the source while a game is actually being played.
    const source = isLive ? live : next;
    const showingHeldResult = showResult && !isLive && lastResult;

    if (!source) {
      return html`<ha-card class="pad">
        No entities found for ${this._config.team || '(no team set)'}
      </ha-card>`;
    }
    if (
      !showingHeldResult &&
      (source.state === 'unavailable' || source.state === 'unknown')
    ) {
      return html`<ha-card class="pad">
        ${isLive ? 'Live scoring' : 'Next game'} is unavailable
      </ha-card>`;
    }

    const a = showingHeldResult ? lastResult : source.attributes ?? {};
    return html`
      <ha-card>
        ${this._config.title || canToggle
          ? html`<div class="title">
              <span>${this._config.title ?? ''}</span>
              ${canToggle ? this._toggle(showResult, lastResult?.start ?? null) : nothing}
            </div>`
          : nothing}
        <div class="card">
          ${this._badge(a.home_logo, 'home-bg')}
          ${this._badge(a.away_logo, 'away-bg')}
          <div class="content">
            ${this._sideButton(a.home_code, a.home_team, a.home_logo)}
            <div class="middle">
              ${isLive
                ? this._live(live)
                : showResult
                  ? this._result(lastResult, live)
                  : this._next(next)}
            </div>
            ${this._sideButton(a.away_code, a.away_team, a.away_logo)}
          </div>
          ${isLive ? this._lastGoal(live) : nothing}
        </div>
        ${this._footer(live, next, ids, showResult)}
      </ha-card>
    `;
  }

  _resultIsRecent(result, hours) {
    if (!result || !(hours > 0)) return false;
    // The schedule carries the real end time; fall back to three hours after
    // puck drop, which is about when a game with overtime is done.
    const ended = result.ended_at
      ? new Date(result.ended_at).getTime()
      : result.start
        ? new Date(result.start).getTime() + 3 * 3600e3
        : NaN;
    if (Number.isNaN(ended)) return false;
    return Date.now() - ended < hours * 3600e3;
  }

  _toggle(showingResult, resultId) {
    const label = showingResult ? 'Visa nästa match' : 'Visa resultatet';
    return html`
      <button
        class="view-toggle"
        title=${label}
        aria-label=${label}
        @click=${() => {
          this._view = { id: resultId, choice: showingResult ? 'next' : 'result' };
        }}
      >
        ${showingResult ? '›' : '‹'}
      </button>
    `;
  }

  _result(result, live) {
    if (!result) return nothing;
    const won = result.won;
    const extra = result.decided_in && result.decided_in !== 'FT' ? result.decided_in : null;
    return html`
      <div class="final ${won === true ? 'won' : won === false ? 'lost' : ''}">
        ${won === true ? 'VINST' : won === false ? 'FÖRLUST' : 'SLUTRESULTAT'}
      </div>
      <div class="score">${result.score}</div>
      ${this._shots(live)}
      ${extra ? html`<div class="period">${extra}</div>` : nothing}
    `;
  }

  // Either side of the fixture leads to that club's page. The code is what is
  // acted on - the same club is printed as "Leksand" in one payload and
  // "Leksands IF" in the next, so the name is only ever the label.
  _sideButton(code, name, logo) {
    const side = html`
      ${this._badge(logo, 'crest')}
      <div class="team-name">${name ?? ''}</div>
    `;
    if (!code) return html`<div class="team">${side}</div>`;
    return html`
      <div
        class="team tappable"
        role="button"
        tabindex="0"
        title=${`Visa ${name ?? code}`}
        @click=${() => this._openTeamByCode(code, name, logo)}
        @keydown=${(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this._openTeamByCode(code, name, logo);
          }
        }}
      >
        ${side}
      </div>
    `;
  }

  _badge(src, cls) {
    return src
      ? html`<img class=${cls} src=${src} alt="" loading="lazy" />`
      : html`<div class=${`${cls} placeholder`}></div>`;
  }

  _live(stateObj) {
    const a = stateObj.attributes ?? {};
    const period = a.period ? String(a.period).replace(/^P/i, '') : null;
    const pp = a.powerplay;
    const showPp = this._config.show_powerplay !== false;
    // Between periods the clock is frozen on the last event of the period that
    // has just ended, so say what is actually happening instead.
    const state = a.intermission
      ? 'Paus'
      : this._config.show_clock !== false
        ? (a.clock ?? '')
        : '';
    return html`
      <div class="live-badge"><span class="dot"></span>LIVE</div>
      <div class="score">${stateObj.state}</div>
      ${this._shots(stateObj)}
      ${period || state
        ? html`<div class="period">
            ${period ? `Period ${period}` : ''}${period && state ? ' · ' : ''}${state}
          </div>`
        : nothing}
      ${showPp && pp
        ? html`<div class="pp" title=${`Till ${pp.until ?? ''}`}>
            ${pp.advantage} ${pp.team_name ?? ''}
          </div>`
        : nothing}
      ${this._tv(a.tv_channels)}
    `;
  }

  // Where to watch, from tv.nu: the broadcast channel first, then streaming.
  // Absent until tv.nu lists the game, which it does about a week ahead.
  _tv(channels) {
    if (this._config.show_tv === false) return nothing;
    if (!Array.isArray(channels) || !channels.length) return nothing;
    const text = channels.join(' · ');
    return html`<div class="tv" title=${text}>
      <ha-icon icon="mdi:television-classic"></ha-icon><span>${text}</span>
    </div>`;
  }

  _footer(live, next, ids, showResult) {
    // Kept for _dialogNav: on a phone the dialog covers the card, so the same
    // buttons go along its bottom as tabs.
    this._nav = this._barButtons(live, next, ids, showResult);
    const { buttons, events, table, liveTable, results, liveGames } = this._nav;
    return html`
      ${buttons.length
        ? html`<div class="footer-bar">
            <div class="bar-group">
              ${buttons.filter((b) => b.side === 'left').map((b) => this._barButton(b))}
            </div>
            <div class="bar-group">
              ${buttons.filter((b) => b.side === 'right').map((b) => this._barButton(b))}
            </div>
          </div>`
        : nothing}
      ${this._panel ? this._dialog(events, table, liveTable, results, liveGames) : nothing}
    `;
  }

  // What the footer offers, and the data behind each view. The badge asks the
  // same question to fill the row of buttons along the top of its dialog.
  _barButtons(live, next, ids, showResult) {
    const cfg = this._config;
    // The log stays available on a held result - you have just watched it.
    const events = showResult ? live?.attributes?.events : null;
    const results = next?.attributes?.recent_results;
    const standings = this._state(ids.standings)?.attributes;
    const table = standings?.table;
    // Published only while games are being played, so its presence is what
    // says there is anything to toggle between.
    const liveTable = standings?.live_table;
    const hasLive = Array.isArray(liveTable) && liveTable.length > 0;

    const liveGames = Number(standings?.live_games ?? 0);
    const buttons = [
      {
        id: 'live',
        side: 'left',
        icon: 'mdi:broadcast',
        label: 'Live',
        badge: liveGames ? String(liveGames) : null,
        show: liveGames > 0,
      },
      {
        id: 'events',
        side: 'left',
        icon: 'mdi:hockey-puck',
        label: 'Händelser',
        badge: Array.isArray(events) && events.length ? String(events.length) : null,
        show: cfg.show_events !== false && Array.isArray(events) && events.length > 0,
      },
      {
        id: 'table',
        side: 'right',
        icon: 'mdi:podium',
        label: 'Tabell',
        badge: hasLive ? 'LIVE' : null,
        show:
          cfg.show_table !== false &&
          ((Array.isArray(table) && table.length > 0) || hasLive),
      },
      {
        id: 'results',
        side: 'right',
        icon: 'mdi:history',
        label: 'Tidigare',
        badge: null,
        show: cfg.show_results !== false && Array.isArray(results) && results.length > 0,
      },
    ].filter((b) => b.show);

    return {
      buttons,
      events,
      table,
      liveTable: hasLive ? liveTable : null,
      results,
      liveGames,
    };
  }

  // A dialog rather than an expanding card: the table is fourteen rows and a
  // match log longer still, which on a phone pushes everything below the card
  // off the screen. <dialog> is the plain element - the browser puts it in the
  // top layer, so no dashboard grid or overflow can clip it, and Escape, the
  // backdrop and focus trapping come with it.
  _dialog(events, table, liveTable, results, liveGames = 0) {
    return html`
      <dialog
        @cancel=${(ev) => {
          // Escape closes the picture first, and the dialog only once there is
          // no picture left to close.
          if (this._photo) {
            ev.preventDefault();
            this._photo = null;
          }
        }}
        @close=${() => {
          this._newRequest();
          this._stopLive();
          this._panel = null;
          this._recap = null;
          this._team = null;
          this._player = null;
          this._tableView = 'table';
          this._schedule = null;
          this._results = null;
          this._photo = null;
          this._trend = null;
          this._tonight = null;
          this._statsOpen = false;
          this._day = 0;
          this._picker = null;
        }}
        @click=${(ev) => {
          // A click that lands on the dialog itself is a click on the backdrop.
          if (ev.target === ev.currentTarget) ev.currentTarget.close();
        }}
      >
        <button
          class="dialog-close"
          aria-label="Stäng"
          @click=${(ev) => ev.currentTarget.closest('dialog').close()}
        >
          ✕
        </button>
        ${this._photo
          ? html`<div
              class="photo-overlay"
              @click=${(ev) => {
                ev.stopPropagation();
                this._photo = null;
              }}
            >
              <img src=${this._photo} alt="" />
            </div>`
          : nothing}
        ${this._picker ? this._pickerDialog() : nothing}
        <div
          class="panel ${this._player ||
          this._recap ||
          this._team ||
          this._panel === 'events' ||
          this._panel === 'results' ||
          this._panel === 'game'
            ? 'tight'
            : ''}"
        >
          ${this._player
            ? this._playerView()
            : this._recap
            ? this._recapView()
            : this._team
            ? this._teamView()
            : this._panel === 'game'
              ? this._gameView()
            : this._panel === 'events'
              ? html`<div class="view-heading">Händelser</div>${this._logRows(events)}`
              : this._panel === 'table'
                ? this._tableSection(table, liveTable, liveGames)
                : this._panel === 'results'
                  ? html`<div class="view-heading">Tidigare matcher</div>
                      ${(this._results?.games ?? results ?? []).map((game) =>
                        this._fixtureRow(game, this._teamRef()),
                      )}
                      ${this._results?.error
                        ? html`<div class="recap-note">${this._results.error}</div>`
                        : nothing}`
                  : nothing}
        </div>
        ${this._dialogNav()}
      </dialog>
    `;
  }

  updated(changed) {
    if (changed.has('_panel')) {
      const dialog = this.renderRoot?.querySelector('dialog:not(.picker)');
      if (dialog) {
        if (this._panel && !dialog.open) {
          // showModal is what puts it in the top layer; open it plainly if an
          // old browser cannot.
          if (dialog.showModal) dialog.showModal();
          else dialog.setAttribute('open', '');
        } else if (!this._panel && dialog.open) {
          dialog.close();
        }
      }
    }

    // The club list is a modal of its own, over the dialog it was opened
    // from: the browser stacks the two, and Escape closes the top one.
    if (changed.has('_picker') && this._picker) {
      const picker = this.renderRoot?.querySelector('dialog.picker');
      if (picker && !picker.open) {
        if (picker.showModal) picker.showModal();
        else picker.setAttribute('open', '');
      }
    }

    // A season runs from August to March, and the part worth seeing first is
    // the part that has not happened. Done here rather than in render, since
    // the row has to exist before it can be scrolled to.
    const wantsScroll =
      (this._team?.scrollToNext && this._team.tab === 'schedule') ||
      this._schedule?.scrollToNext;
    if (wantsScroll) {
      let row = this.renderRoot?.querySelector('.fixture-row.next');
      // The day's heading over it, where it is the day's first game.
      if (row?.previousElementSibling?.classList.contains('team-section')) {
        row = row.previousElementSibling;
      }
      const panel = this.renderRoot?.querySelector('.panel');
      if (row && panel) {
        // Clear of the view switch, where it is shown and held at the top.
        const held = this.renderRoot.querySelector('.section-switch')?.offsetHeight ?? 0;
        panel.scrollTop = row.offsetTop - panel.offsetTop - 8 - held;
        if (this._team?.scrollToNext) this._team = { ...this._team, scrollToNext: false };
        if (this._schedule?.scrollToNext) {
          this._schedule = { ...this._schedule, scrollToNext: false };
        }
      }
    }
  }

  // The sections as a row of buttons in the dialog. The badge has no card face
  // to carry them, so it always shows them - along the top; the card shows
  // them only on a phone, where the dialog covers the card, and there they are
  // a tab bar along the bottom, as an app would have them.
  _dialogNav() {
    const tabs = this._dialogTabs();
    if (tabs.length < 2) return nothing;
    const view = this._panel === 'table' ? (this._tableView ?? 'table') : null;
    const active = (id) =>
      !this._team &&
      !this._player &&
      !this._recap &&
      (id === 'game'
        ? this._panel === 'game'
        : id === 'today'
          ? view === 'live'
          : id === 'schedule' || id === 'stats'
            ? view === id
            : view === 'table');
    return html`
      <nav class="dialog-nav" aria-label="Avsnitt">
        ${tabs.map((tab) => this._tabButton(tab, active(tab.id)))}
      </nav>
    `;
  }

  // The game being played, if there is one, then the league: today's games,
  // the table and the schedule. The game's log and the team's earlier results
  // live inside these - the log under the score, the results back along the
  // schedule - so they are not tabs of their own.
  _dialogTabs() {
    const ids = this._entities();
    const standings = this._state(ids.standings)?.attributes;
    const liveGames = Number(standings?.live_games ?? 0);
    const hasLiveTable = Array.isArray(standings?.live_table) && standings.live_table.length > 0;
    const playing = this._state(ids.live)?.attributes?.in_progress === true;
    return [
      playing && { id: 'game', icon: 'mdi:scoreboard', label: 'Match' },
      {
        id: 'today',
        icon: 'mdi:calendar-today',
        label: 'Matcher',
        badge: liveGames ? String(liveGames) : null,
      },
      this._config.show_table !== false && {
        id: 'table',
        icon: 'mdi:podium',
        label: 'Tabell',
        badge: hasLiveTable ? 'LIVE' : null,
      },
      { id: 'schedule', icon: 'mdi:calendar-month', label: 'Spelschema' },
      this._config.show_stats !== false && {
        id: 'stats',
        icon: 'mdi:chart-box-outline',
        label: 'Statistik',
      },
    ].filter(Boolean);
  }

  _tabButton(tab, active) {
    return html`
      <button
        class="bar-button ${active ? 'active' : ''}"
        aria-current=${active ? 'page' : nothing}
        @click=${() => this._openTab(tab.id)}
      >
        <ha-icon icon=${tab.icon}></ha-icon>
        <span>${tab.label}</span>
        ${tab.badge ? html`<span class="bar-badge">${tab.badge}</span>` : nothing}
      </button>
    `;
  }

  _openTab(id) {
    this._newRequest();
    this._stopLive();
    this._recap = null;
    this._team = null;
    this._player = null;
    if (id === 'game') {
      this._panel = 'game';
      return;
    }
    this._panel = 'table';
    this._tableView = id === 'today' ? 'live' : id;
    if (id === 'today') {
      this._day = 0;
      this._watchLive();
    }
    if (id === 'schedule') this._loadSchedule();
    if (id === 'stats') this._loadStats();
  }

  _barButton(b) {
    return html`
      <button
        class="bar-button ${b.active ? 'active' : ''}"
        aria-haspopup=${b.active == null ? 'dialog' : nothing}
        aria-pressed=${b.active == null ? nothing : String(b.active)}
        @click=${() => {
          this._newRequest();
          this._stopLive();
          this._recap = null;
          this._team = null;
          this._player = null;
          // Live is a tab inside the table view, so the table stays one tap away.
          this._panel = b.id === 'live' ? 'table' : b.id;
          this._tableView = b.id === 'live' ? 'live' : 'table';
          if (b.id === 'results') this._loadResults();
          if (b.id === 'live') this._watchLive();
        }}
      >
        <ha-icon icon=${b.icon}></ha-icon>
        <span>${b.label}</span>
        ${b.badge ? html`<span class="bar-badge">${b.badge}</span>` : nothing}
      </button>
    `;
  }

  _logRows(events) {
    return (events ?? []).map((e) => this._logRow(e));
  }

  _tableSection(table, liveTable, liveGames = 0) {
    // Where the dialog has its tab bar the tabs choose the view, and the
    // switch is hidden for a heading; the card's dialog on a wide screen has
    // no tab bar, and the switch is how it gets around. Its Live button only
    // exists while something is being played.
    const view = this._tableView ?? 'table';
    const tab = (id, label, onClick, badge = null) => html`
      <button
        class=${view === id ? 'active' : ''}
        aria-pressed=${view === id ? 'true' : 'false'}
        @click=${onClick}
      >
        ${label}${badge ? html`<span class="switch-badge">${badge}</span>` : nothing}
      </button>
    `;
    return html`
      <div class="switch section-switch">
        ${liveGames
          ? tab(
              'live',
              'Live',
              () => {
                this._tableView = 'live';
                this._watchLive();
              },
              liveGames,
            )
          : nothing}
        ${tab('table', 'Tabell', () => {
          this._tableView = 'table';
          this._stopLive();
        })}
        ${tab('schedule', 'Spelschema', () => {
          this._tableView = 'schedule';
          this._stopLive();
          this._loadSchedule();
        })}
        ${this._config.show_stats !== false
          ? tab('stats', 'Statistik', () => {
              this._tableView = 'stats';
              this._stopLive();
              this._loadStats();
            })
          : nothing}
      </div>
      ${view === 'live'
        ? this._liveView()
        : view === 'schedule'
          ? this._scheduleView()
          : view === 'stats'
            ? this._statsView()
          : this._trend?.last
            ? this._trendView()
            : this._table(table, liveTable)}
      ${view === 'table'
        ? this._filterBar(html`
            ${this._filterSelect(
              'Tabellens omfattning',
              String(this._trend?.last ?? 0),
              TABLE_PERIODS,
              (value) => this._loadTrend(Number(value)),
            )}
            ${liveTable != null && !this._trend?.last ? this._liveToggle(liveTable) : nothing}
          `)
        : nothing}
    `;
  }

  // The table as it would stand over the last few games only. Nobody
  // publishes one, so it is worked out from the results.
  async _loadTrend(last) {
    if (!last) {
      this._trend = null;
      return;
    }
    if (this._trend?.last === last) return;
    const token = this._newRequest();
    this._trend = { last, loading: true };
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_form_table',
        { config_entry_id: entry, last, team: this._teamRef() },
        undefined,
        false,
        true,
      );
      const data = result?.response ?? result;
      if (this._stale(token)) return;
      this._trend = { last, table: data?.table ?? [] };
    } catch (err) {
      if (this._stale(token)) return;
      this._trend = { last, error: err?.message || String(err) };
    }
  }

  _trendView() {
    const { loading, error, table } = this._trend ?? {};
    if (loading) return this._loading('Räknar formtabell…', 'table');
    if (error) return html`<div class="recap-note">${error}</div>`;
    if (!table?.length) return html`<div class="recap-note">Inga spelade matcher.</div>`;
    return this._tableRows(table);
  }

  // The league's remaining fixtures are in no sensor - the card follows one
  // team - so they are asked for once and kept for as long as the dialog is.
  // Nothing is read until the tab is open, and then only while it stays open:
  // once a minute is as often as a score is worth asking for.
  _watchLive() {
    this._loadLive();
    this._stopLive();
    this._liveTimer = setInterval(() => this._loadLive(), 60000);
  }

  _stopLive() {
    if (this._liveTimer) {
      clearInterval(this._liveTimer);
      this._liveTimer = null;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._stopLive();
  }

  // The day the view shows, as the service wants it: the local date, written
  // out, `offset` days from today.
  _dayDate(offset) {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    return day;
  }

  async _loadLive() {
    const offset = this._day ?? 0;
    // A read for the same day already on its way is enough; a step to another
    // day asks again, and whichever answer is for the day on show wins.
    if (this._tonight?.loading && this._tonight.day === offset) return;
    // Only today's scores move; another day is read once and left.
    if (offset !== 0 && this._tonight?.day === offset && this._tonight.games) return;
    this._tonight = {
      ...(this._tonight?.day === offset ? this._tonight : {}),
      day: offset,
      loading: true,
    };
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const date = this._dayDate(offset);
      const data_ = { config_entry_id: entry };
      if (offset !== 0) {
        data_.date = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
      }
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_live',
        data_,
        undefined,
        false,
        true,
      );
      const data = result?.response ?? result;
      // Not guarded on the request stamp: a score arriving late is still the
      // score, and the tab may well still be open when it lands. The day is
      // checked, though - an answer for a day stepped away from is not shown.
      if (this._tableView !== 'live' || (this._day ?? 0) !== offset) return;
      this._tonight = { day: offset, games: data?.games ?? [], updated: new Date() };
    } catch (err) {
      if ((this._day ?? 0) !== offset) return;
      this._tonight = {
        ...this._tonight,
        day: offset,
        loading: false,
        error: err?.message || String(err),
      };
    }
  }

  _stepDay(step) {
    this._day = (this._day ?? 0) + step;
    this._loadLive();
    // The new day comes in from the side it was asked for from.
    this.updateComplete.then(() => {
      this.renderRoot
        ?.querySelector('.day-body')
        ?.animate?.(
          [
            { transform: `translateX(${step > 0 ? 40 : -40}px)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 200, easing: 'ease-out' },
        );
    });
  }

  _dayTitle(offset) {
    const locale = localeOf(this.hass);
    const date = this._dayDate(offset);
    if (Math.abs(offset) <= 1) {
      try {
        const text = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
          offset,
          'day',
        );
        return text.charAt(0).toUpperCase() + text.slice(1);
      } catch (err) {
        // Fall through to the date.
      }
    }
    const text = date.toLocaleDateString(locale, { weekday: 'long', ...DATE });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  _liveView() {
    const offset = this._day ?? 0;
    const current = this._tonight?.day === offset ? this._tonight : {};
    const { games, loading, error, updated } = current;
    const locale = localeOf(this.hass);
    const subtitle =
      Math.abs(offset) <= 1
        ? this._dayDate(offset).toLocaleDateString(locale, { weekday: 'long', ...DATE })
        : null;
    // Today's scores are read again every minute; the bar says so while
    // they are, with what was there before still on show.
    const bar = html`
      <div class="day-bar ${loading && games ? 'busy' : ''}">
        <button class="day-step" aria-label="Föregående dag" @click=${() => this._stepDay(-1)}>
          <ha-icon icon="mdi:chevron-left"></ha-icon>
        </button>
        <div class="day-title">
          <span>${this._dayTitle(offset)}</span>
          ${subtitle ? html`<span class="day-sub">${subtitle}</span>` : nothing}
        </div>
        <button class="day-step" aria-label="Nästa dag" @click=${() => this._stepDay(1)}>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
      </div>
    `;
    let body;
    if (loading && !games) body = this._loading('Hämtar matcherna…', 'games');
    else if (error && !games) body = html`<div class="recap-note">${error}</div>`;
    else if (!games?.length) body = html`<div class="recap-note">Inga matcher den här dagen.</div>`;
    else {
      body = html`
        ${games.map((game) =>
          this._fixtureRow(game, null, { hideDate: true, markSelf: true, live: offset === 0 }),
        )}
        ${updated && offset === 0
          ? html`<div class="live-updated">
              Uppdaterad ${updated.toLocaleTimeString(locale, timeFormat(this.hass))}
            </div>`
          : nothing}
      `;
    }
    // The day's games follow a finger sideways, and a long enough swipe turns
    // to the day before or after, as the arrows do.
    return html`
      ${bar}
      <div
        class="day-body"
        @touchstart=${{ handleEvent: (ev) => this._swipeStart(ev), passive: true }}
        @touchmove=${{ handleEvent: (ev) => this._swipeMove(ev), passive: true }}
        @touchend=${(ev) => this._swipeEnd(ev)}
        @touchcancel=${(ev) => this._swipeEnd(ev, true)}
      >
        ${body}
      </div>
    `;
  }

  _swipeStart(ev) {
    if (ev.touches.length !== 1) {
      this._swipe = null;
      return;
    }
    const t = ev.touches[0];
    this._swipe = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null };
  }

  _swipeMove(ev) {
    const swipe = this._swipe;
    if (!swipe) return;
    const t = ev.touches[0];
    const dx = t.clientX - swipe.x;
    const dy = t.clientY - swipe.y;
    // The first clear movement decides: up and down is the page scrolling and
    // is left alone for the rest of the touch.
    if (swipe.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipe.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    }
    if (!swipe.horizontal) return;
    swipe.dx = dx;
    const body = ev.currentTarget;
    body.style.transition = 'none';
    body.style.transform = `translateX(${dx * 0.5}px)`;
    body.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 600));
  }

  _swipeEnd(ev, cancelled = false) {
    const swipe = this._swipe;
    this._swipe = null;
    const body = ev.currentTarget;
    if (!swipe?.horizontal) return;
    const width = body.getBoundingClientRect().width || 300;
    const turn = !cancelled && Math.abs(swipe.dx) > Math.min(80, width * 0.22);
    if (turn) {
      body.style.transition = '';
      body.style.transform = '';
      body.style.opacity = '';
      this._stepDay(swipe.dx < 0 ? 1 : -1);
      return;
    }
    // Not far enough: back where it was.
    body.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
    body.style.transform = '';
    body.style.opacity = '';
  }

  // The sensor carries the last five games, which is enough to draw at once.
  // The service carries ten and knows which of them have a clip, so it is
  // asked for as the panel opens and swapped in when it answers.
  async _loadResults() {
    if (this._results?.games || this._results?.loading) return;
    const token = this._newRequest();
    this._results = { loading: true };
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_results',
        { config_entry_id: entry, team: this._teamRef(), limit: 10, highlights: true },
        undefined,
        false,
        true,
      );
      const data = result?.response ?? result;
      if (this._stale(token)) return;
      this._results = { games: data?.results ?? [] };
    } catch (err) {
      if (this._stale(token)) return;
      this._results = { error: err?.message || String(err) };
    }
  }

  // The season so far comes too, with the list opened at the next game: what
  // is still to come is below, what has been played is a scroll up. The
  // service gives at most 200 games, so a hundred back leaves as many ahead.
  async _loadSchedule() {
    if (this._schedule?.loading) return;
    if (this._schedule?.games) {
      this._schedule = { ...this._schedule, scrollToNext: true };
      return;
    }
    const before = SCHEDULE_BEFORE;
    const token = this._newRequest();
    this._schedule = { loading: true, before, teams: this._schedule?.teams ?? [] };
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_schedule',
        {
          config_entry_id: entry,
          limit: 200,
          before,
          highlights: true,
        },
        undefined,
        false,
        true,
      );
      const data = result?.response ?? result;
      if (this._stale(token)) return;
      this._schedule = {
        games: data?.games ?? [],
        before,
        nextIndex: data?.next_index ?? null,
        teams: this._schedule?.teams ?? [],
        scrollToNext: true,
      };
    } catch (err) {
      if (this._stale(token)) return;
      this._schedule = { error: err?.message || String(err) };
    }
  }

  _filterSchedule(teams) {
    this._schedule = { ...this._schedule, teams, scrollToNext: true };
  }

  // The clubs to choose from, along the foot of the list: everybody's games,
  // or the games of the clubs chosen.
  _scheduleBar() {
    const clubs = this._scheduleClubs();
    if (!clubs.length) return nothing;
    return this._filterBar(this._teamButton('schedule', clubs, this._schedule?.teams ?? []));
  }

  // The league's clubs from its table; from the games themselves should the
  // table not have been read.
  _scheduleClubs() {
    const table = this._state(this._entities().standings)?.attributes?.table;
    if (table?.length) return this._clubsOf(table);
    const seen = new Map();
    for (const game of this._schedule?.games ?? []) {
      for (const side of ['home', 'away']) {
        const code = game[`${side}_code`];
        if (code && !seen.has(clubKey(code))) {
          seen.set(clubKey(code), {
            team_code: code,
            team: game[`${side}_team`],
            logo: game[`${side}_logo`],
          });
        }
      }
    }
    return this._clubsOf([...seen.values()]);
  }

  _scheduleView() {
    const { loading, error, nextIndex, teams = [] } = this._schedule ?? {};
    if (loading) return this._loading('Hämtar spelschema…');
    if (error) return html`<div class="recap-note">${error}</div>`;
    // Each game keeps its place in the whole list, so the next one can still
    // be found once the list is narrowed to some clubs: the first of their
    // games from there on.
    const wanted = new Set(teams);
    const games = (this._schedule?.games ?? [])
      .map((game, index) => ({ game, index }))
      .filter(
        ({ game }) =>
          !wanted.size ||
          wanted.has(clubKey(game.home_code)) ||
          wanted.has(clubKey(game.away_code)),
      );
    const next =
      nextIndex == null ? null : games.find(({ index }) => index >= nextIndex)?.index ?? null;
    if (!games.length) {
      return html`<div class="recap-note">
          ${wanted.size ? 'Inga matcher för de valda lagen.' : 'Inga matcher i schemat.'}
        </div>
        ${this._scheduleBar()}`;
    }

    const locale = localeOf(this.hass);
    const rows = [];
    let day = null;
    for (const { game, index } of games) {
      const when = new Date(game.start);
      const stamp = Number.isNaN(when.getTime()) ? '' : when.toDateString();
      if (stamp !== day) {
        day = stamp;
        rows.push(html`<div class="team-section">${this._dayLabel(when, locale)}</div>`);
      }
      rows.push(
        this._fixtureRow(game, null, {
          isNext: index === next,
          hideDate: true,
          markSelf: true,
        }),
      );
    }
    rows.push(this._scheduleBar());
    return rows;
  }

  // ---- Filters --------------------------------------------------------------

  // A view's filters, held along the foot of the panel while the list
  // scrolls under them. The gap before the row takes whatever room a short
  // list leaves, so it sits at the foot of a phone's screen either way.
  // `busy` runs a line along its top edge while the view is read again.
  _filterBar(controls, busy = false) {
    return html`
      <div class="filter-gap"></div>
      <div class="filter-bar ${busy ? 'busy' : ''}" role="toolbar" aria-label="Filter">
        ${controls}
      </div>
    `;
  }

  // A choice of a few, as a chip saying what is chosen. The browser's own
  // select lies over it unseen, so a tap opens the phone's own picker with
  // every option written out in full.
  _filterSelect(label, value, options, onChange) {
    const chosen = options.find(([id]) => id === value) ?? options[0];
    return html`
      <label class="filter-chip filter-select ${chosen === options[0] ? '' : 'active'}">
        <span>${chosen[2] ?? chosen[1]}</span>
        <ha-icon icon="mdi:chevron-down"></ha-icon>
        <select aria-label=${label} @change=${(ev) => onChange(ev.target.value)}>
          ${options.map(
            ([id, text]) => html`<option value=${id} ?selected=${id === chosen[0]}>${text}</option>`,
          )}
        </select>
      </label>
    `;
  }

  // The clubs chosen, on a button that opens the list to choose them from.
  // A row of every club's crest took a line of its own and could only ever
  // say one; this says up to two by name and more by count.
  _teamButton(picker, clubs, chosen) {
    const picked = clubs.filter((club) => chosen.includes(club.key));
    const names = picked.map((club) => club.name).join(', ');
    return html`
      <button
        class="filter-chip team-pick ${picked.length ? 'active' : ''}"
        aria-haspopup="dialog"
        title=${names || 'Alla lag'}
        @click=${() => {
          this._picker = picker;
        }}
      >
        ${picked.length
          ? html`<span class="crest-stack">
              ${picked.slice(0, 3).map((club) =>
                club.logo
                  ? html`<img src=${club.logo} alt="" loading="lazy" />`
                  : html`<span class="crest-blank"></span>`,
              )}
            </span>`
          : html`<ha-icon icon="mdi:shield-outline"></ha-icon>`}
        <span class="team-pick-label">
          ${!picked.length ? 'Alla lag' : picked.length <= 2 ? names : `${picked.length} lag`}
        </span>
        <ha-icon icon="mdi:chevron-down"></ha-icon>
      </button>
    `;
  }

  _clubsOf(rows) {
    return (rows ?? [])
      .filter((row) => row?.team_code)
      .map((row) => ({
        key: clubKey(row.team_code),
        name: row.team ?? row.team_code,
        logo: row.logo ?? this._crestOf(row.team_code, row.team),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }

  // What the club list is choosing for: the schedule's games, or one of the
  // statistics' lists of players. It is read afresh every render, so a tick
  // is applied - and shows behind the list - the moment it is made.
  _pickerSpec(picker = this._picker) {
    if (picker === 'schedule') {
      return {
        title: 'Visa matcher för',
        clubs: this._scheduleClubs(),
        chosen: this._schedule?.teams ?? [],
        set: (teams) => this._filterSchedule(teams),
      };
    }
    if (picker === 'skaters' || picker === 'goalies') {
      const data = this._statsData?.[this._statsScope()]?.data;
      return {
        title: picker === 'goalies' ? 'Visa målvakter från' : 'Visa spelare från',
        clubs: this._clubsOf(data?.teams),
        chosen: this._stats?.filters?.[picker]?.teams ?? [],
        set: (teams) => this._setStatsFilter(picker, { teams }),
      };
    }
    return null;
  }

  _pickerDialog() {
    const spec = this._pickerSpec();
    if (!spec) return nothing;
    const { title, clubs, chosen, set } = spec;
    const ours = clubKey(this._teamRef());
    // Read at the tap, not at the render: two taps can land between renders.
    const toggle = (key) => {
      const now = this._pickerSpec()?.chosen ?? [];
      set(now.includes(key) ? now.filter((k) => k !== key) : [...now, key]);
    };
    return html`
      <dialog
        class="picker"
        aria-label=${title}
        @close=${() => {
          this._picker = null;
        }}
        @click=${(ev) => {
          if (ev.target === ev.currentTarget) ev.currentTarget.close();
        }}
      >
        <div class="picker-head">
          <span class="picker-title">${title}</span>
          <span class="picker-count">
            ${chosen.length ? `${chosen.length} av ${clubs.length} lag valda` : 'Alla lag'}
          </span>
        </div>
        <div class="picker-list" role="group" aria-label="Lag">
          ${clubs.map((club, index) => {
            const on = chosen.includes(club.key);
            // Opened on the first club rather than on the list around them,
            // which Chrome would otherwise give the focus to as a scroller.
            return html`
              <button
                class="picker-row ${on ? 'on' : ''}"
                role="checkbox"
                aria-checked=${on ? 'true' : 'false'}
                ?autofocus=${index === 0}
                @click=${() => toggle(club.key)}
              >
                ${club.logo
                  ? html`<img class="picker-crest" src=${club.logo} alt="" loading="lazy" />`
                  : html`<span class="picker-crest"></span>`}
                <span class="picker-name">${club.name}</span>
                ${club.key === ours ? html`<span class="picker-ours">Ditt lag</span>` : nothing}
                <span class="picker-check"><ha-icon icon="mdi:check"></ha-icon></span>
              </button>
            `;
          })}
        </div>
        <div class="picker-foot">
          <button class="picker-clear" ?disabled=${!chosen.length} @click=${() => set([])}>
            Rensa
          </button>
          <button
            class="picker-done"
            @click=${(ev) => ev.currentTarget.closest('dialog').close()}
          >
            Klar
          </button>
        </div>
      </dialog>
    `;
  }

  // ---- Loading --------------------------------------------------------------

  // Something to look at while a read is out: the shape of what is coming,
  // shimmering and fading away down the panel, under a line saying what is
  // being fetched. Widths vary row to row, as names do, but are the same
  // every time, so nothing jumps while it waits.
  _loading(label, shape = 'fixtures') {
    const widths = [62, 46, 74, 54, 40, 68, 50, 58, 44];
    const bone = (cls, width) =>
      html`<span class="sk ${cls}" style=${width ? `width: ${width}%` : nothing}></span>`;
    const tableRow = (i) => html`
      <div class="sk-row">
        ${bone('sk-num')}${bone('sk-crest')}${bone('sk-line', widths[i % widths.length])}
        ${bone('sk-num')}${bone('sk-num')}${bone('sk-num')}
      </div>
    `;
    const fixture = (i) => html`
      <div class="sk-fixture">
        ${bone('sk-when')}
        <span class="sk-side">${bone('sk-crest')}${bone('sk-line', widths[i % 9])}</span>
        <span class="sk-side">${bone('sk-crest')}${bone('sk-line', widths[(i + 4) % 9])}</span>
      </div>
    `;
    const card = (c) => html`
      <div class="sk-card">
        ${bone('sk-line', 70)}
        <span class="sk-side">${bone('sk-avatar')}${bone('sk-line', 60)}</span>
        ${[0, 1, 2, 3].map(
          (r) => html`<span class="sk-side">${bone('sk-crest')}${bone('sk-line', widths[c + r])}</span>`,
        )}
      </div>
    `;
    const rows = (n, row) => Array.from({ length: n }, (_, i) => row(i));
    let skeleton;
    switch (shape) {
      case 'table':
        skeleton = rows(9, tableRow);
        break;
      case 'cards':
        skeleton = html`
          ${bone('sk-block sk-ours')}
          ${bone('sk-heading')}
          <div class="sk-cards">${card(0)}${card(3)}</div>
        `;
        break;
      case 'hero':
        skeleton = html`${bone('sk-block sk-hero')}${rows(5, tableRow)}`;
        break;
      // One day's games, or one club's season: no day headings over them.
      case 'games':
        skeleton = rows(5, fixture);
        break;
      default:
        skeleton = html`
          ${bone('sk-heading')}${rows(2, fixture)}
          ${bone('sk-heading')}${rows(3, (i) => fixture(i + 2))}
        `;
    }
    return html`
      <div class="loading" role="status">
        <div class="loading-label"><span class="spinner"></span><span>${label}</span></div>
        <div class="skeleton" aria-hidden="true">${skeleton}</div>
      </div>
    `;
  }

  _dayLabel(when, locale) {
    if (Number.isNaN(when.getTime())) return '';
    return (
      relativeDay(when, locale) ??
      when.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    );
  }

  // The live table counts whatever is being played right now into the
  // official one. It only exists while a game is on, and the toggle with it.
  // Which of the two tables is being shown: the live one whenever there is
  // one, unless it has been switched off at the foot of the table.
  _liveTableOn(liveTable) {
    return liveTable != null && this._liveTable !== false;
  }

  _table(table, liveTable) {
    const live = this._liveTableOn(liveTable);
    return this._tableRows(live ? liveTable : table, live);
  }

  // The live/official switch sits beside the period in the filter row, out
  // of the way of the standings themselves.
  _liveToggle(liveTable) {
    const live = this._liveTableOn(liveTable);
    return html`
      <button
        class="filter-chip live-chip ${live ? 'active' : ''}"
        aria-pressed=${live ? 'true' : 'false'}
        title=${live ? 'Med pågående matcher' : 'Officiella tabellen'}
        @click=${() => {
          this._liveTable = !live;
        }}
      >
        <span class="live-dot"></span>Live
      </button>
    `;
  }

  _tableRows(table, live = false) {
    return html`
      <div class="table">
        <div class="table-row head">
          <span>#</span><span>Lag</span><span>M</span><span>+/-</span><span>P</span>
          <span class="table-form">Form</span>
        </div>
        ${(table ?? []).map((r) => html`
          <div
            class="table-row tappable ${r.is_self ? 'self' : ''} ${isCut(r.rank)
              ? 'cut'
              : ''} zone-${zoneOf(r.rank) ?? 'none'}"
            role="button"
            tabindex="0"
            @click=${() => this._openTeam(r)}
            @keydown=${(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                this._openTeam(r);
              }
            }}
          >
            <span class="table-rank">
              ${r.rank ?? ''}${live ? this._move(r.rank_change) : nothing}
            </span>
            <span class="table-team">
              ${r.logo
                ? html`<img class="table-logo" src=${r.logo} alt="" loading="lazy" />`
                : html`<span class="table-logo"></span>`}
              <span class="table-name">${r.team ?? r.team_code}</span>
              ${live && r.live ? html`<span class="playing" title="Spelar nu"></span>` : nothing}
            </span>
            <span>${r.games_played ?? ''}</span>
            <span>${this._plus(r.goal_difference)}</span>
            <span class="table-points">${r.points ?? ''}</span>
            <span class="table-form">${this._form(r.form)}</span>
          </div>
        `)}
      </div>
    `;
  }

  // Everything about another club has to be asked for: the card only ever
  // holds its own team's fixtures. The table row it was tapped from is enough
  // to draw the header while the rest arrives.
  // Only what the open tab needs is fetched. The overview is two short reads -
  // three fixtures either side of today - and the season and the squad are
  // asked for the first time their own tab is opened.
  async _openTeam(row, tab = 'overview') {
    if (!row?.team_code) return;
    const token = this._newRequest();
    this._team = { row, tab, loading: true };
    if (tab === 'stats') this._loadStats('season');
    try {
      const [next, results] = await Promise.allSettled([
        this._askTeam(row.team_code, 'get_schedule', { limit: 3 }),
        this._askTeam(row.team_code, 'get_results', { limit: 3, highlights: true }),
      ]);
      if (this._stale(token)) return;
      const value = (settled) =>
        settled.status === 'fulfilled'
          ? (settled.value?.response ?? settled.value)
          : null;
      this._team = {
        ...this._team,
        loading: false,
        next: value(next)?.games ?? [],
        results: value(results)?.results ?? [],
        error:
          next.status === 'rejected' && results.status === 'rejected'
            ? results.reason?.message || String(results.reason)
            : null,
      };
    } catch (err) {
      if (this._stale(token)) return;
      this._team = { ...this._team, loading: false, error: err?.message || String(err) };
    }
  }

  async _askTeam(teamCode, service, data) {
    const entry = await this._configEntryId();
    if (!entry) throw new Error('Hittade inte integrationen');
    return this.hass.callService(
      'swedish_hockey',
      service,
      { config_entry_id: entry, team: teamCode, ...data },
      undefined,
      false,
      true,
    );
  }

  async _openTeamTab(tab) {
    const token = this._newRequest();
    this._team = { ...this._team, tab };
    const code = this._team.row?.team_code;
    if (tab === 'schedule' && !this._team.season) {
      await this._loadTeamSeason(0);
    }
    if (tab === 'stats') this._loadStats('season');
    if (tab === 'roster' && !this._team.roster) {
      this._team = { ...this._team, rosterLoading: true };
      try {
        const result = await this._askTeam(code, 'get_roster');
        const data = result?.response ?? result;
        if (this._stale(token)) return;
        this._team = {
          ...this._team,
          rosterLoading: false,
          roster: data?.players ?? [],
          statsUrl: data?.stats_url ?? null,
        };
      } catch (err) {
        if (this._stale(token)) return;
        this._team = {
          ...this._team,
          rosterLoading: false,
          rosterError: err?.message || String(err),
        };
      }
    }
  }

  _teamView() {
    const team = this._team ?? {};
    const { row, error } = team;
    const tab = team.tab ?? 'overview';
    const back = html`
      <button class="recap-back" @click=${() => { this._newRequest(); this._team = null; }}>
        <ha-icon icon="mdi:chevron-left"></ha-icon>${this._tableView === 'live'
          ? 'Matcher'
          : this._tableView === 'schedule'
            ? 'Spelschema'
            : this._tableView === 'stats'
              ? 'Statistik'
              : 'Tabell'}
      </button>
    `;

    const record =
      row.wins != null && row.losses != null
        ? [row.wins, row.overtime_wins ?? 0, row.overtime_losses ?? 0, row.losses].join('–')
        : null;
    const goals =
      row.goals_for != null && row.goals_against != null
        ? `${row.goals_for}–${row.goals_against}`
        : null;

    return html`
      ${back}
      <div class="hero" style=${`--club: ${this._clubColourOf(row.team_code)}`}>
        ${this._badge(row.logo, 'hero-bg')}
        <div class="hero-main">
          ${this._badge(row.logo, 'hero-crest')}
          <div class="hero-titles">
            ${row.rank ? html`<span class="hero-kicker as-written">${row.rank}:a i tabellen</span>` : nothing}
            <span class="hero-title">${row.team ?? row.team_code}</span>
            ${row.form?.length
              ? html`<span class="hero-form" title="Senaste matcherna">${this._form(row.form)}</span>`
              : nothing}
          </div>
          ${row.points != null
            ? html`<div class="hero-big">
                <span class="hero-big-value">${row.points}</span>
                <span class="hero-big-label">poäng</span>
              </div>`
            : nothing}
        </div>
        <div class="hero-stats">
          ${this._stat('Matcher', row.games_played)}
          ${this._stat('V–ÖV–ÖF–F', record)}
          ${this._stat('Mål', goals)}
          ${this._stat('Målskillnad', this._plus(row.goal_difference))}
        </div>
      </div>

      <div class="switch team-tabs">
        ${[
          ['overview', 'Översikt'],
          ['schedule', 'Spelschema'],
          ['roster', 'Trupp'],
          this._config.show_stats !== false && ['stats', 'Statistik'],
        ].filter(Boolean).map(
          ([id, label]) => html`
            <button
              class=${tab === id ? 'active' : ''}
              aria-pressed=${tab === id ? 'true' : 'false'}
              @click=${() => this._openTeamTab(id)}
            >
              ${label}
            </button>
          `,
        )}
      </div>

      ${error ? html`<div class="recap-note">${error}</div>` : nothing}
      ${tab === 'overview' ? this._teamOverview(team) : nothing}
      ${tab === 'schedule' ? this._teamSchedule(team) : nothing}
      ${tab === 'roster' ? this._teamRoster(team) : nothing}
      ${tab === 'stats' ? this._teamStats(team) : nothing}
    `;
  }

  _teamOverview(team) {
    const { row, next, results, loading } = team;
    if (loading) return this._loading('Hämtar laget…');
    return html`
      ${next?.length
        ? html`
            <div class="team-section">Nästa matcher</div>
            ${next.map((game) => this._fixtureRow(game, row.team_code))}
          `
        : nothing}
      ${results?.length
        ? html`
            <div class="team-section">Senaste matcher</div>
            ${results.map((game) => this._fixtureRow(game, row.team_code))}
          `
        : nothing}
    `;
  }

  // What is still to come, and on request what came before it. The whole
  // season is one read either way; asking for it in two is what lets the list
  // open at the part that has not happened yet.
  async _loadTeamSeason(before = 0) {
    const team = this._team;
    if (!team?.row?.team_code || team.seasonLoading) return;
    if (team.season && (team.seasonBefore ?? 0) >= before) return;
    const token = this._newRequest();
    this._team = { ...team, seasonLoading: true };
    try {
      const result = await this._askTeam(team.row.team_code, 'get_schedule', {
        before,
        limit: 200,
        highlights: Boolean(before),
      });
      const data = result?.response ?? result;
      if (this._stale(token)) return;
      this._team = {
        ...this._team,
        seasonLoading: false,
        season: data?.games ?? [],
        seasonBefore: before,
        nextIndex: data?.next_index ?? null,
        // Reaching back moves the list under the reader; put them back at the
        // next game.
        scrollToNext: Boolean(before),
      };
    } catch (err) {
      if (this._stale(token)) return;
      this._team = {
        ...this._team,
        seasonLoading: false,
        seasonError: err?.message || String(err),
      };
    }
  }

  _teamSchedule(team) {
    const { row, season, seasonLoading, seasonError, nextIndex, seasonBefore } = team;
    if (seasonLoading) return this._loading('Hämtar spelschemat…', 'games');
    if (seasonError) return html`<div class="recap-note">${seasonError}</div>`;
    if (!season?.length) return html`<div class="recap-note">Inget spelschema.</div>`;
    return [
      seasonBefore
        ? nothing
        : html`
            <button class="schedule-back" @click=${() => this._loadTeamSeason(200)}>
              ▲ Visa tidigare matcher
            </button>
          `,
      ...season.map((game, index) =>
        this._fixtureRow(game, row.team_code, { isNext: index === nextIndex }),
      ),
    ];
  }

  _teamRoster(team) {
    const { row, roster, rosterLoading, rosterError, statsUrl } = team;
    if (rosterLoading) return this._loading('Hämtar truppen…', 'table');
    if (rosterError) return html`<div class="recap-note">${rosterError}</div>`;
    if (!roster?.length) return html`<div class="recap-note">Ingen trupp.</div>`;

    const grouped = team.group === true;
    const groups = grouped
      ? POSITION_GROUPS.map((group) => ({
          ...group,
          players: roster.filter((player) => positionOf(player).group === group.id),
        })).filter((group) => group.players.length)
      : [{ id: 'all', label: null, players: roster }];

    return html`
      <div class="switch">
        <button
          class=${grouped ? '' : 'active'}
          aria-pressed=${grouped ? 'false' : 'true'}
          @click=${() => { this._team = { ...this._team, group: false }; }}
        >
          Hela truppen
        </button>
        <button
          class=${grouped ? 'active' : ''}
          aria-pressed=${grouped ? 'true' : 'false'}
          @click=${() => { this._team = { ...this._team, group: true }; }}
        >
          Per position
        </button>
      </div>
      ${groups.map((group) => this._rosterTable(team, group, row.team_code))}
    `;
  }

  // Each table sorts on its own: what a goalkeeper is worth reading by is not
  // what a forward is.
  _rosterTable(team, group, teamCode) {
    const sort = team.sorts?.[group.id] ?? ROSTER_SORT;
    const goalies = group.id === 'gk';
    const columns = goalies
      ? [
          ['player', 'Målvakt'],
          ['GP', 'M'],
          ['SVS_perc', 'Rädd%'],
          ['SO', 'N'],
          ['GAA', 'GAA'],
        ]
      : [
          ['player', 'Spelare'],
          ['GP', 'M'],
          ['G', 'Mål'],
          ['A', 'A'],
          ['TP', 'P'],
        ];
    return html`
      ${group.label ? html`<div class="team-section">${group.label}</div>` : nothing}
      <div class="roster-row head">
        ${columns.map(
          ([key, label]) => html`
            <span
              class="roster-sort ${sort.key === key ? 'active' : ''}"
              role="button"
              tabindex="0"
              @click=${() => this._sortRoster(group.id, key)}
              @keydown=${(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  this._sortRoster(group.id, key);
                }
              }}
              >${label}${sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span
            >
          `,
        )}
      </div>
      ${this._rosterSorted(group.players, sort, group.id !== 'all').map((player) =>
        this._rosterRow(player, teamCode),
      )}
    `;
  }

  _sortRoster(group, key) {
    const sort = this._team?.sorts?.[group] ?? ROSTER_SORT;
    // Tapping the same column turns it round; a new one starts where that
    // column is most useful - names from A, numbers from the top.
    const dir =
      sort.key === key
        ? sort.dir === 'asc'
          ? 'desc'
          : 'asc'
        : key === 'player'
          ? 'asc'
          : 'desc';
    this._team = {
      ...this._team,
      sorts: { ...(this._team?.sorts ?? {}), [group]: { key, dir } },
    };
  }

  _rosterSorted(roster, sort, mixed = false) {
    const sign = sort.dir === 'asc' ? 1 : -1;
    const byName = (a, b) =>
      String(a.player ?? '').localeCompare(String(b.player ?? ''), 'sv');
    const compare = (a, b) =>
      sort.key === 'player'
        ? sign * byName(a, b)
        : sign * (Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0)) || byName(a, b);
    // In one undivided list the goalkeepers keep to the foot of it: the goals
    // and assists columns carry their save percentage instead, so they have
    // nothing to sort against the skaters with. A table of their own has no
    // such problem.
    if (mixed) return [...roster].sort(compare);
    return [
      ...roster.filter((player) => player.role !== 'goalkeeper').sort(compare),
      ...roster.filter((player) => player.role === 'goalkeeper').sort(compare),
    ];
  }

  // The statistics are the league's, the same whichever club the card follows
  // and whichever view asked for them, so a reply is kept by the scope it is
  // for rather than by the request: it is written whenever it lands, since a
  // late answer is still the answer. A stale copy stays on show while the
  // fresh one is read.
  async _loadStats(scope = this._statsScope()) {
    const kept = this._statsData?.[scope];
    if (kept?.loading) return;
    if (kept?.data && Date.now() - kept.at < STATS_FRESH) return;
    const store = (value) => {
      this._statsData = { ...(this._statsData ?? {}), [scope]: value };
    };
    store({ ...(kept ?? {}), loading: true, error: null });
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const wanted = STATS_SCOPES.find((s) => s.id === scope) ?? STATS_SCOPES[0];
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_statistics',
        { config_entry_id: entry, ...wanted.data },
        undefined,
        false,
        true,
      );
      store({ data: result?.response ?? result, at: Date.now() });
    } catch (err) {
      store({
        ...(this._statsData?.[scope] ?? {}),
        loading: false,
        error: err?.message || String(err),
      });
    }
  }

  _statsScope() {
    return this._stats?.scope ?? 'season';
  }

  _setStats(patch) {
    this._stats = { ...(this._stats ?? {}), ...patch };
  }

  // Back to the top of the panel when the view under it changes, so a table
  // opened from a leader card does not open halfway down.
  _statsToTop() {
    this.updateComplete.then(() => {
      const panel = this.renderRoot?.querySelector('.panel');
      if (panel) panel.scrollTop = 0;
    });
  }

  _statsView() {
    const scope = this._statsScope();
    const { data, loading, error } = this._statsData?.[scope] ?? {};
    const section = this._stats?.section ?? 'leaders';
    let body;
    if (!data) {
      body =
        loading || !error
          ? this._loading('Hämtar statistiken…', section === 'leaders' ? 'cards' : 'table')
          : html`<div class="recap-note">${error}</div>`;
    } else if (section === 'leaders') {
      body = this._statsLeaders(data);
    } else {
      body = this._statsTable(section, data);
    }
    return html`
      <div class="switch st-sections">
        ${STATS_SECTIONS.map(
          ([id, label]) => html`
            <button
              class=${section === id ? 'active' : ''}
              aria-pressed=${section === id ? 'true' : 'false'}
              @click=${() => {
                this._setStats({ section: id, more: STATS_PAGE });
                this._statsToTop();
              }}
            >
              ${label}
            </button>
          `,
        )}
      </div>
      ${error && data ? html`<div class="recap-note">${error}</div>` : nothing}
      ${body}
      ${this._statsFoot(data)}
      ${this._statsBar(section, data, Boolean(loading && data))}
    `;
  }

  // When the figures were read, and where the league keeps the rest.
  _statsFoot(data) {
    const updated = data?.updated ? new Date(data.updated) : null;
    const time =
      updated && !Number.isNaN(updated.getTime())
        ? updated.toLocaleTimeString(localeOf(this.hass), timeFormat(this.hass))
        : null;
    if (!time && !data?.stats_url) return nothing;
    return html`
      <div class="st-foot">
        ${time ? html`<span>Uppdaterad ${time}</span>` : nothing}
        ${data?.stats_url
          ? html`<a
              class="st-source"
              href=${data.stats_url}
              target="_blank"
              rel="noopener noreferrer"
              >Mer statistik hos ligan
              <ha-icon icon="mdi:open-in-new"></ha-icon
            ></a>`
          : nothing}
      </div>
    `;
  }

  // Which games the figures cover, for every section; and for the lists of
  // players, which clubs and - for skaters - which position. A league that
  // cannot be asked for the last few games says so in its answer, and from
  // then on the choice is not offered. A stale copy being read again runs
  // the row's busy line rather than hiding what is on show.
  _statsBar(section, data, busy) {
    const scope = this._statsScope();
    const known = Object.values(this._statsData ?? {}).find((entry) => entry?.data)?.data;
    const scopes = STATS_SCOPES.filter(
      (s) => !s.needs || known?.scopes?.[s.needs] !== false || s.id === scope,
    );
    const filters = this._stats?.filters?.[section] ?? {};
    const players = section === 'skaters' || section === 'goalies';
    const positions =
      section === 'skaters' &&
      (data?.skaters ?? []).some((row) => positionOf(row).group !== 'other');
    return this._filterBar(
      html`
        ${this._filterSelect(
          'Vilka matcher statistiken gäller',
          scope,
          scopes.map((s) => [s.id, s.label, s.short]),
          (value) => {
            this._setStats({ scope: value, more: STATS_PAGE });
            this._loadStats(value);
          },
        )}
        ${players && data?.teams?.length
          ? this._teamButton(section, this._clubsOf(data.teams), filters.teams ?? [])
          : nothing}
        ${positions
          ? this._filterSelect('Position', filters.position ?? '', POSITION_FILTERS, (value) =>
              this._setStatsFilter(section, { position: value || null }),
            )
          : nothing}
      `,
      busy,
    );
  }

  _setStatsFilter(kind, patch) {
    this._setStats({
      filters: {
        ...(this._stats?.filters ?? {}),
        [kind]: { ...(this._stats?.filters?.[kind] ?? {}), ...patch },
      },
      more: STATS_PAGE,
    });
  }

  // A club's crest, from the statistics' own club rows or the table.
  _statsLogo(code, data) {
    const key = clubKey(code);
    const row = (data?.teams ?? []).find((team) => clubKey(team.team_code) === key);
    return row?.logo ?? this._crestOf(code);
  }

  _statsCrest(code, data, cls) {
    const logo = this._statsLogo(code, data);
    return logo
      ? html`<img class=${cls} src=${logo} alt="" loading="lazy" />`
      : html`<span class=${cls}></span>`;
  }

  // Who a row is about, leading to them: a player to his page, a club to its
  // statistics. A narrow column takes "T. Kelleher" for "Tyler Kelleher".
  _statsWho(kind, row) {
    if (kind === 'teams') {
      return html`<span
        class="player-link"
        role="button"
        tabindex="0"
        @click=${(ev) => {
          ev.stopPropagation();
          this._openTeamByCode(row.team_code, row.team, row.logo, 'stats');
        }}
        @keydown=${(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            ev.stopPropagation();
            this._openTeamByCode(row.team_code, row.team, row.logo, 'stats');
          }
        }}
        >${row.team ?? row.team_code}</span
      >`;
    }
    return this._playerLink(
      row.player,
      row.team_code,
      html`<span class="full-name">${row.player}</span><span class="short-name"
          >${shortName(row.player)}</span
        >`,
    );
  }

  // ---- Leaders --------------------------------------------------------------

  // The followed club first, as the league sees it; then a row of cards for
  // each kind, the best five at each figure, a swipe along to the next.
  _statsLeaders(data) {
    return html`
      ${this._statsOurs(data)}
      ${Object.entries(STATS_LEADERS).map(([kind, keys]) => {
        const cards = keys
          .map((key) => this._leaderCard(kind, key, data))
          .filter((card) => card !== nothing);
        if (!cards.length) return nothing;
        return html`
          <div class="lb-head">
            <span class="team-section">${STATS_KINDS[kind].label}</span>
            <span class="lb-arrows">
              <button
                class="lb-arrow"
                aria-label="Bläddra bakåt"
                @click=${(ev) => this._scrollLeaders(ev, -1)}
              >
                <ha-icon icon="mdi:chevron-left"></ha-icon>
              </button>
              <button
                class="lb-arrow"
                aria-label="Bläddra framåt"
                @click=${(ev) => this._scrollLeaders(ev, 1)}
              >
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            </span>
          </div>
          <div class="lb-track">${cards}</div>
        `;
      })}
    `;
  }

  _scrollLeaders(ev, step) {
    const track = ev.currentTarget.closest('.lb-head')?.nextElementSibling;
    if (!track) return;
    const card = track.querySelector('.lb-card');
    const width = card ? card.getBoundingClientRect().width + 10 : track.clientWidth * 0.8;
    track.scrollBy({ left: step * width, behavior: 'smooth' });
  }

  _leaderCard(kind, key, data) {
    const metric = STATS_KINDS[kind].metrics[key];
    const { ranked } = rankStats(data?.[kind], key, metric);
    if (!ranked.length) return nothing;
    const ours = clubKey(this._teamRef());
    const [first, ...rest] = ranked.slice(0, 5);
    const self = (row) => (clubKey(row.team_code) === ours ? 'self' : '');
    return html`
      <div class="lb-card">
        <button class="lb-title" @click=${() => this._openStatsTable(kind, key)}>
          <span>${metric.label}</span>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
        <div class="lb-top ${self(first.row)}">
          ${kind !== 'teams' && first.row.photo
            ? html`<img
                class="lb-photo"
                src=${first.row.photo}
                alt=""
                loading="lazy"
                style=${`--club: ${this._clubColourOf(first.row.team_code)}`}
              />`
            : this._statsCrest(first.row.team_code, data, 'lb-photo crest')}
          <span class="lb-top-text">
            <span class="lb-top-name">${this._statsWho(kind, first.row)}</span>
            <span class="lb-top-team">
              ${kind === 'teams'
                ? `${first.row.GP ?? ''} matcher`
                : html`${this._statsCrest(first.row.team_code, data, 'lb-mini')}${first.row
                    .team ?? first.row.team_code}`}
            </span>
          </span>
          <span class="lb-top-value"
            >${formatStat(first.row[key], metric.kind)}${metric.kind === 'pct'
              ? html`<span class="lb-unit">%</span>`
              : nothing}</span
          >
        </div>
        ${rest.map(
          ({ row, rank }) => html`
            <div class="lb-row ${self(row)}">
              <span class="lb-rank">${rank}</span>
              ${this._statsCrest(row.team_code, data, 'lb-crest')}
              <span class="lb-name">${this._statsWho(kind, row)}</span>
              <span class="lb-value">${formatStat(row[key], metric.kind, true)}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  // The followed club as the league sees it: where it stands at the figures
  // that say most about a team, and its best player's place among everyone.
  _statsOurs(data) {
    const key = clubKey(this._teamRef());
    const teams = data?.teams ?? [];
    const row = teams.find((team) => clubKey(team.team_code) === key);
    if (!row) return nothing;
    const tiles = ['PP_perc', 'PK_perc', 'GF_GP', 'GA_GP', 'SVS_perc', 'FO_perc']
      .filter((stat) => row[stat] !== undefined && row[stat] !== null)
      .map((stat) => {
        const metric = TEAM_METRICS[stat];
        const place = rankStats(teams, stat, metric).ranked.find((r) => r.row === row)?.rank;
        return { stat, metric, place };
      });
    const scorer = rankStats(data?.skaters, 'TP', SKATER_METRICS.TP).ranked.find(
      ({ row: player }) => clubKey(player.team_code) === key,
    );
    const open = () => this._openTeamByCode(row.team_code, row.team, row.logo, 'stats');
    return html`
      <div
        class="st-ours tappable"
        role="button"
        tabindex="0"
        style=${`--club: ${this._clubColourOf(row.team_code)}`}
        @click=${open}
        @keydown=${(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            open();
          }
        }}
      >
        ${this._badge(row.logo, 'hero-bg')}
        <div class="st-ours-head">
          ${this._badge(row.logo, 'st-ours-crest')}
          <span class="st-ours-title">${row.team ?? row.team_code} i ligan</span>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        <div class="st-ours-tiles">
          ${tiles.map(
            ({ stat, metric, place }) => html`
              <span class="st-ours-tile">
                <span class="st-ours-value">${formatStat(row[stat], metric.kind, true)}</span>
                <span class="st-ours-label">${metric.short}</span>
                ${place
                  ? html`<span class="st-place ${this._placeClass(place, teams.length)}"
                      >${ordinal(place)}</span
                    >`
                  : nothing}
              </span>
            `,
          )}
        </div>
        ${scorer
          ? html`<div class="st-ours-foot">
              Bäst i laget: ${scorer.row.player}, ${scorer.row.TP} poäng –
              ${ordinal(scorer.rank)} i ligan
            </div>`
          : nothing}
      </div>
    `;
  }

  // A place near the top of the league reads green, near the foot red.
  _placeClass(place, count) {
    if (!place || !count) return '';
    if (place <= Math.max(1, Math.round(count / 4))) return 'top';
    if (place > count - Math.max(1, Math.round(count / 4))) return 'bottom';
    return '';
  }

  // ---- Tables ---------------------------------------------------------------

  // From a leader card into the whole list, sorted on what the card was for
  // and with the columns that figure is in.
  _openStatsTable(kind, key) {
    const groups = STATS_COLUMNS[kind];
    const group = groups.find((g) => g.columns.includes(key)) ?? groups[0];
    this._setStats({
      section: kind,
      groups: { ...(this._stats?.groups ?? {}), [kind]: group.id },
      sorts: { ...(this._stats?.sorts ?? {}), [kind]: { key } },
      more: STATS_PAGE,
    });
    this._statsToTop();
  }

  _statsTable(kind, data) {
    const metrics = STATS_KINDS[kind].metrics;
    const all = data?.[kind] ?? [];
    const has = (key) => all.some((row) => row[key] !== undefined && row[key] !== null);
    // A league that does not publish a figure loses its column, and a group
    // with nothing left in it goes too.
    const groups = STATS_COLUMNS[kind]
      .map((group) => ({ ...group, columns: group.columns.filter(has) }))
      .filter((group) => group.columns.length);
    if (!all.length || !groups.length) {
      return html`<div class="recap-note">Ingen statistik.</div>`;
    }
    const group = groups.find((g) => g.id === this._stats?.groups?.[kind]) ?? groups[0];
    const { columns } = group;

    // Sorted on what was asked for while it is on screen, else on what the
    // group is about. Tapping a heading again turns the order round.
    const asked = this._stats?.sorts?.[kind];
    const key =
      asked && columns.includes(asked.key)
        ? asked.key
        : columns.includes(group.sort)
          ? group.sort
          : columns[0];
    const metric = metrics[key] ?? {};
    const natural = metric.dir ?? 'desc';
    const dir = asked?.key === key && asked.dir ? asked.dir : natural;

    // Places are always the league's - best first, among every club -
    // however the list is turned or narrowed, so a club's own players keep
    // the places they hold in the league and the leader is 1 from either end.
    const filters = this._stats?.filters?.[kind] ?? {};
    const teams = new Set(filters.teams ?? []);
    const keep = (row) =>
      (!teams.size || teams.has(clubKey(row.team_code))) &&
      (!filters.position || positionOf(row).group === filters.position);
    const league = rankStats(all, key, metric, natural);
    const ranked = league.ranked.filter(({ row }) => keep(row));
    const rest = league.rest.filter(({ row }) => keep(row));
    const missing = all
      .filter((row) => keep(row) && statNumber(row[key]) === null)
      .map((row) => ({ row, rank: null }));
    let list = [...ranked, ...rest];
    if (dir !== natural) list = [...ranked].reverse().concat([...rest].reverse());
    list = list.concat(missing);
    const limit = this._stats?.more ?? STATS_PAGE;
    const shown = list.slice(0, limit);
    const firstShort = rest.length ? ranked.length : -1;

    // The followed club stands out in a list of everyone; in a list of
    // nobody else there is nothing for it to stand out from.
    const ours = teams.size === 1 ? null : clubKey(this._teamRef());
    const width = (k) =>
      ({ time: '3.2em', pct: '3.2em', dec: '3em', dec1: '3em', crowd: '3.8em' })[
        metrics[k]?.kind
      ] ?? '2.4em';
    const grid = `grid-template-columns: 1.7em minmax(0, 1fr) ${columns.map(width).join(' ')}`;
    const sortBy = (column) => {
      const columnNatural = metrics[column]?.dir ?? 'desc';
      const next =
        column === key ? (dir === 'asc' ? 'desc' : 'asc') : columnNatural;
      this._setStats({
        sorts: { ...(this._stats?.sorts ?? {}), [kind]: { key: column, dir: next } },
      });
    };

    return html`
      ${groups.length > 1
        ? html`<div class="st-groups" role="toolbar" aria-label="Kolumner">
            ${groups.map(
              (g) => html`
                <button
                  class="filter-chip ${g.id === group.id ? 'active' : ''}"
                  aria-pressed=${g.id === group.id ? 'true' : 'false'}
                  @click=${() =>
                    this._setStats({
                      groups: { ...(this._stats?.groups ?? {}), [kind]: g.id },
                    })}
                >
                  ${g.label}
                </button>
              `,
            )}
          </div>`
        : nothing}
      <div class="st-table">
        <div class="st-row head" style=${grid}>
          <span>#</span>
          <span>${kind === 'teams' ? 'Lag' : kind === 'goalies' ? 'Målvakt' : 'Spelare'}</span>
          ${columns.map(
            (column) => html`
              <span
                class="roster-sort ${column === key ? 'active' : ''}"
                role="button"
                tabindex="0"
                title=${metrics[column]?.label ?? column}
                @click=${() => sortBy(column)}
                @keydown=${(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    sortBy(column);
                  }
                }}
                >${metrics[column]?.short ?? column}${column === key
                  ? html`<span class="st-arrow">${dir === 'asc' ? '▲' : '▼'}</span>`
                  : nothing}</span
              >
            `,
          )}
        </div>
        ${shown.map(
          ({ row, rank }, index) => html`
            ${index === firstShort && dir === natural
              ? html`<div class="st-short">
                  Under ligans gräns för att rankas i ${(metric.label ?? '').toLowerCase()}
                </div>`
              : nothing}
            <div
              class="st-row ${clubKey(row.team_code) === ours ? 'self' : ''} ${rank === null
                ? 'unranked'
                : ''}"
              style=${grid}
            >
              <span class="st-rank">${rank ?? ''}</span>
              <span class="st-name">
                ${this._statsCrest(row.team_code, data, 'st-crest')}
                ${this._statsWho(kind, row)}
              </span>
              ${columns.map(
                (column) => html`<span class=${column === key ? 'sorted' : ''}
                  >${formatStat(row[column], metrics[column]?.kind)}</span
                >`,
              )}
            </div>
          `,
        )}
      </div>
      ${list.length ? nothing : html`<div class="recap-note">Ingen i urvalet.</div>`}
      ${list.length > shown.length
        ? html`<button
            class="stats-more st-more"
            @click=${() => this._setStats({ more: limit + STATS_PAGE * 2 })}
          >
            Visa fler (${list.length - shown.length} till)
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </button>`
        : nothing}
      <div class="st-legend">
        ${columns.map((column) => `${metrics[column]?.short} ${metrics[column]?.label}`).join(' · ')}
      </div>
    `;
  }

  // ---- A club's statistics --------------------------------------------------

  // Each figure against the other clubs: its place, and a bar from the
  // league's worst to its best with the average marked. Always the season -
  // a club's page is about its season.
  _teamStats(team) {
    const { data, loading, error } = this._statsData?.season ?? {};
    if (!data) {
      return loading || !error
        ? this._loading('Hämtar statistiken…', 'table')
        : html`<div class="recap-note">${error}</div>`;
    }
    const code = team.row?.team_code;
    const teams = data.teams ?? [];
    const row = teams.find((t) => clubKey(t.team_code) === clubKey(code));
    if (!row) return html`<div class="recap-note">Ingen statistik för laget.</div>`;
    const colour = this._clubColourOf(code);
    return html`
      ${TEAM_STAT_GROUPS.map((group) => {
        const keys = group.keys.filter(
          (key) => TEAM_METRICS[key] && row[key] !== undefined && row[key] !== null,
        );
        if (!keys.length) return nothing;
        return html`
          <div class="team-section">${group.label}</div>
          ${keys.map((key) => this._teamStatRow(teams, row, key, colour))}
        `;
      })}
      ${this._teamLeaders(data, code)}
    `;
  }

  _teamStatRow(teams, row, key, colour) {
    const metric = TEAM_METRICS[key];
    const { ranked } = rankStats(teams, key, metric);
    const place = ranked.find((r) => r.row === row)?.rank;
    const values = ranked.map((r) => statNumber(r.row[key]));
    const value = statNumber(row[key]);
    // From the worst to the best, whichever way round better is.
    const best = values[0];
    const worst = values[values.length - 1];
    const span = best - worst;
    const along = (v) => (span ? Math.min(1, Math.max(0, (v - worst) / span)) : 1);
    const mean = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    return html`
      <div
        class="ts-row"
        title=${`Ligasnitt ${formatStat(mean, ['pct', 'dec', 'crowd'].includes(metric.kind) ? metric.kind : 'dec1', true)}`}
      >
        <span class="ts-label">${metric.label}</span>
        <span class="ts-value">${formatStat(row[key], metric.kind, true)}</span>
        <span class="st-place ${this._placeClass(place, teams.length)}"
          >${place ? ordinal(place) : ''}</span
        >
        <span class="ts-track">
          <span
            class="ts-fill"
            style=${`width: ${(along(value) * 100).toFixed(1)}%; background: ${colour}`}
          ></span>
          <span class="ts-mean" style=${`left: ${(along(mean) * 100).toFixed(1)}%`}></span>
        </span>
      </div>
    `;
  }

  // The club's own best at what a player is judged by, each with his place
  // among the whole league.
  _teamLeaders(data, code) {
    const key = clubKey(code);
    const boards = [
      ['skaters', 'TP'],
      ['skaters', 'G'],
      ['skaters', 'A'],
      ['skaters', 'PlusMinus'],
      ['skaters', 'TOI_GP'],
      ['goalies', 'SVS_perc'],
    ]
      .map(([kind, stat]) => {
        const metric = STATS_KINDS[kind].metrics[stat];
        const { ranked, rest } = rankStats(data?.[kind], stat, metric);
        const ours = [...ranked, ...rest]
          .filter(({ row }) => clubKey(row.team_code) === key)
          .slice(0, 3);
        return ours.length ? { kind, stat, metric, ours } : null;
      })
      .filter(Boolean);
    if (!boards.length) return nothing;
    return html`
      <div class="team-section">Lagets bästa</div>
      <div class="ts-leaders">
        ${boards.map(
          ({ kind, stat, metric, ours }) => html`
            <div class="ts-board">
              <span class="ts-board-title">${metric.label}</span>
              ${ours.map(
                ({ row, rank }) => html`
                  <span class="ts-board-row">
                    <span class="lb-name">${this._statsWho(kind, row)}</span>
                    <span class="lb-value">${formatStat(row[stat], metric.kind, true)}</span>
                    <span class="ts-board-place">${rank ? ordinal(rank) : '–'}</span>
                  </span>
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }

  // ---- A player in the league -----------------------------------------------

  // The player's row in the league's statistics, once they have been read:
  // the figures his own read does not carry, and where each puts him.
  _playerLeague(name, teamCode, goalie) {
    const data = this._statsData?.season?.data;
    if (!data) return nothing;
    const kind = goalie ? 'goalies' : 'skaters';
    const rows = data[kind] ?? [];
    const wanted = clubKey(name);
    const named = rows.filter((row) => clubKey(row.player) === wanted);
    const row =
      named.find((r) => clubKey(r.team_code) === clubKey(teamCode)) ??
      (named.length === 1 ? named[0] : null);
    if (!row) return nothing;
    const metrics = STATS_KINDS[kind].metrics;
    const keys = goalie
      ? ['SVS_perc', 'GAA', 'SO', 'W', 'EV_SVS_perc', 'PK_SVS_perc']
      : ['TP', 'G', 'A', 'TP_GP', 'PPP', 'GWG', 'S_perc', 'FO_perc', 'Hits', 'BKS', 'PPTOI_GP', 'CF_perc'];
    // What he does best first: ordered by how far up the league each figure
    // puts him, the ones he is not ranked at last.
    const items = keys
      .filter((key) => row[key] !== undefined && row[key] !== null)
      .map((key, index) => {
        const { ranked } = rankStats(rows, key, metrics[key]);
        const place = ranked.find((r) => r.row === row)?.rank;
        return { key, place, share: place ? place / ranked.length : 2, index };
      })
      .sort((x, y) => x.share - y.share || x.index - y.index);
    if (!items.length) return nothing;
    return html`
      <div class="team-section">I ligan</div>
      <div class="lr-grid">
        ${items.map(
          ({ key, place }) => html`
            <div class="lr-tile">
              <span class="lr-value">${formatStat(row[key], metrics[key].kind, true)}</span>
              <span class="lr-label">${metrics[key].label}</span>
              <span class="st-place ${place && place <= 10 ? 'top' : ''}"
                >${place ? `${ordinal(place)} i ligan` : 'Ej rankad'}</span
              >
            </div>
          `,
        )}
      </div>
    `;
  }

  // One line of a schedule: when, who, and the score once there is one. A game
  // that has been played opens its own summary.
  _fixtureRow(game, teamCode, options = {}) {
    const { isNext = false, hideDate = false, markSelf = false, live = false } = options;
    const locale = localeOf(this.hass);
    const when = new Date(game.start ?? '');
    const played = game.home_score !== null && game.home_score !== undefined;
    const extra = game.decided_in && game.decided_in !== 'FT' ? game.decided_in : '';
    // A result row already knows whose win it was; a fixture is written from
    // no team's point of view, so the club whose page this is decides. In a
    // league-wide list there is no such club, and no colour.
    const won = game.won ?? this._outcomeFor(game, teamCode, played);
    // A recap is read through one of the sides; with no club in mind, the home
    // side does as well as any.
    const through = teamCode || game.home_code;
    const ours = clubKey(this._teamRef());
    const self =
      markSelf &&
      (clubKey(game.home_code) === ours || clubKey(game.away_code) === ours);
    // Two lines, a side each, with its goals at the end: the side ahead reads
    // in full and the other one steps back.
    const home = Number(game.home_score);
    const away = Number(game.away_score);
    const lead = !played || home === away ? null : home > away ? 'home' : 'away';
    const outcome = won === true ? 'won' : won === false ? 'lost' : '';
    // Under the sides: where it is played, and on which channel while it is
    // still to come.
    const meta = [];
    if (game.venue) meta.push(html`<span>${game.venue}</span>`);
    if ((!played || live) && game.tv_channels?.length && this._config.show_tv !== false) {
      meta.push(html`<span class="fixture-tv">
        <ha-icon icon="mdi:television-classic"></ha-icon>${game.tv_channels.join(' · ')}
      </span>`);
    }
    return html`
      <div
        class="fixture-row ${isNext ? 'next' : ''} ${played ? 'tappable' : ''} ${self
          ? 'self'
          : ''}"
        role=${played ? 'button' : nothing}
        tabindex=${played ? '0' : nothing}
        @click=${played ? () => this._loadRecap(game, through) : nothing}
        @keydown=${played
          ? (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                this._loadRecap(game, through);
              }
            }
          : nothing}
      >
        <span class="fixture-when">
          ${live && game.in_progress
            ? html`<span class="fixture-live"><span class="playing"></span>P${game.period ?? ''}</span>`
            : Number.isNaN(when.getTime())
            ? ''
            : hideDate
              ? when.toLocaleTimeString(locale, timeFormat(this.hass))
              : html`${when.toLocaleDateString(locale, SHORT_DATE)}<span class="fixture-clock"
                    >${when.toLocaleTimeString(locale, timeFormat(this.hass))}</span
                  >`}
        </span>
        <span class="fixture-side home ${lead === 'home' ? 'lead' : ''}">
          ${this._teamLink(game.home_code, game.home_team, game.home_logo)}
        </span>
        <span class="fixture-goals home ${lead === 'home' ? 'lead' : ''} ${outcome}">
          ${played ? game.home_score : ''}
        </span>
        <span class="fixture-side away ${lead === 'away' ? 'lead' : ''}">
          ${this._teamLink(game.away_code, game.away_team, game.away_logo)}
        </span>
        <span class="fixture-goals away ${lead === 'away' ? 'lead' : ''} ${outcome}">
          ${played ? game.away_score : ''}
        </span>
        ${meta.length || extra || game.highlight
          ? html`<span class="fixture-meta">
              <span class="fixture-detail">${meta}</span>
              <span class="fixture-extra">
                ${extra}
                ${game.highlight
                  ? html`<a
                      class="fixture-clip"
                      href=${game.highlight.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Höjdpunkter"
                      @click=${(ev) => ev.stopPropagation()}
                      ><ha-icon icon="mdi:play-circle-outline"></ha-icon></a
                    >`
                  : nothing}
              </span>
            </span>`
          : nothing}
      </div>
    `;
  }

  // A club wherever it is named in a list: crest and name, both leading to
  // that club's page.
  _outcomeFor(game, teamCode, played) {
    if (!played || !teamCode) return null;
    const ours = clubKey(teamCode);
    const home = clubKey(game.home_code) === ours;
    if (!home && clubKey(game.away_code) !== ours) return null;
    const mine = Number(home ? game.home_score : game.away_score);
    const theirs = Number(home ? game.away_score : game.home_score);
    return mine === theirs ? null : mine > theirs;
  }

  _teamLink(code, name, logo) {
    const label = name ?? code ?? '';
    if (!code) return html`<span class="fixture-team">${label}</span>`;
    return html`<span
      class="fixture-team tappable"
      role="button"
      tabindex="0"
      title=${`Visa ${label}`}
      @click=${(ev) => {
        ev.stopPropagation();
        this._openTeamByCode(code, name, logo);
      }}
      @keydown=${(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          this._openTeamByCode(code, name, logo);
        }
      }}
      >${logo
        ? html`<img class="fixture-logo" src=${logo} alt="" loading="lazy" />`
        : nothing}${label}</span
    >`;
  }

  // A goalkeeper is on the same list, but points say nothing about one, so the
  // columns carry their save percentage instead.
  _rosterRow(player, teamCode) {
    const goalie = player.role === 'goalkeeper';
    const position = positionOf(player);
    return html`
      <div class="roster-row">
        <span class="roster-name">
          ${player.photo
            ? html`<img class="roster-photo" src=${player.photo} alt="" loading="lazy" />`
            : html`<span class="roster-photo empty"></span>`}
          <span class="roster-position ${position.group}" title=${player.position ?? ''}>
            ${position.letter}
          </span>
          <span class="roster-number">${player.jersey ?? ''}</span>
          ${this._playerLink(player.player, teamCode)}
        </span>
        <span>${player.GP ?? ''}</span>
        ${goalie
          ? html`<span class="roster-goalie">${player.SVS_perc ?? ''}%</span>
              <span>${player.SO ?? ''}</span>
              <span class="roster-points">${player.GAA ?? ''}</span>`
          : html`<span>${player.G ?? ''}</span>
              <span>${player.A ?? ''}</span>
              <span class="roster-points">${player.TP ?? ''}</span>`}
      </div>
    `;
  }

  // A club's crest and colour, from wherever the card has seen the club: the
  // table has every crest, the fixtures carry the colours.
  _crestOf(code, name) {
    const table = this._state(this._entities().standings)?.attributes?.table ?? [];
    const key = clubKey(code);
    const row =
      (key && table.find((r) => clubKey(r.team_code) === key)) ||
      (name && table.find((r) => clubKey(r.team) === clubKey(name)));
    return row?.logo ?? (this._team?.row?.team_code === code ? this._team.row.logo : null);
  }

  _clubColourOf(code) {
    const key = clubKey(code);
    const games = [
      ...(this._team?.next ?? []),
      ...(this._team?.results ?? []),
      ...(this._team?.season ?? []),
      ...(this._schedule?.games ?? []),
      ...(this._tonight?.games ?? []),
    ];
    for (const game of games) {
      if (clubKey(game.home_code) === key && game.home_color) {
        return clubColour(game.home_color, 'var(--primary-color)');
      }
      if (clubKey(game.away_code) === key && game.away_color) {
        return clubColour(game.away_color, 'var(--primary-color)');
      }
    }
    // The statistics carry every club's colour, for wherever no game does.
    for (const entry of Object.values(this._statsData ?? {})) {
      const club = entry?.data?.teams?.find((team) => clubKey(team.team_code) === key);
      if (club?.color) return clubColour(club.color, 'var(--primary-color)');
    }
    return 'var(--primary-color)';
  }

  _stat(label, value) {
    if (value === null || value === undefined || value === '') return nothing;
    return html`
      <div class="stat">
        <span class="stat-value">${value}</span>
        <span class="stat-label">${label}</span>
      </div>
    `;
  }

  // Five games of form, oldest first. Overtime is kept apart from regulation:
  // a win there is worth less and a loss there is not worth nothing.
  _form(form) {
    const locale = localeOf(this.hass);
    return (form ?? []).map((game) => {
      const when = new Date(game.start ?? '');
      const date = Number.isNaN(when.getTime())
        ? ''
        : `${when.toLocaleDateString(locale, SHORT_DATE)} · `;
      return html`<span
        class="form-pip ${game.result}"
        title=${`${date}${game.is_home ? '' : 'borta '}${game.opponent} ${game.score}${
          game.decided_in && game.decided_in !== 'FT' ? ` (${game.decided_in})` : ''
        }`}
      ></span>`;
    });
  }

  _move(change) {
    if (!change) return nothing;
    const up = change > 0;
    return html`<span class="move ${up ? 'up' : 'down'}"
      >${up ? '▲' : '▼'}${Math.abs(change)}</span
    >`;
  }

  _plus(value) {
    if (value === null || value === undefined || value === '') return '';
    return Number(value) > 0 ? `+${value}` : String(value);
  }

  // The card holds nothing about a game once it is over - the goals and the
  // shots are fetched back from the play-by-play when a row is tapped.
  async _loadRecap(row, teamCode) {
    // Without an id the service answers for the team's most recent game,
    // which is what `latest` asks for.
    if (!row?.game_id && !row?.latest) return;
    const token = this._newRequest();
    this._recap = { loading: true, row };
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_recap',
        {
          config_entry_id: entry,
          team: teamCode || this._teamRef(),
          ...(row.game_id ? { game_id: row.game_id } : {}),
        },
        undefined,
        false,
        true,
      );
      if (this._stale(token)) return;
      this._recap = { row, data: result?.response ?? result };
    } catch (err) {
      if (this._stale(token)) return;
      this._recap = { row, error: err?.message || String(err) };
    }
  }

  // Services resolve a team by its club code (LIF, SSK), which the sensors
  // carry. The card's own `team` is the device name and only a fallback: the
  // same club is spelled "Leksand" in one payload and "Leksands IF" in
  // another, and the device may have been renamed by hand besides.
  _teamRef() {
    const ids = this._entities();
    for (const entityId of [ids.next, ids.standings, ids.live]) {
      const code = this._state(entityId)?.attributes?.team_code;
      if (code) return code;
    }
    if (this._config.team) return this._config.team;
    const device = this._device();
    return device?.name_by_user || device?.name || '';
  }

  _device() {
    const ids = this._entities();
    const entityId = ids.next ?? ids.live ?? ids.standings;
    const deviceId = entityId ? this.hass?.entities?.[entityId]?.device_id : null;
    return deviceId ? this.hass?.devices?.[deviceId] : null;
  }

  async _configEntryId() {
    if (this._entryId) return this._entryId;
    const device = this._device();
    let entry = device?.primary_config_entry ?? device?.config_entries?.[0];
    if (!entry) {
      // Older frontends leave the config entry off the device registry entry.
      const ids = this._entities();
      const entityId = ids.next ?? ids.live ?? ids.standings;
      const registry = entityId
        ? await this.hass.callWS({
            type: 'config/entity_registry/get',
            entity_id: entityId,
          })
        : null;
      entry = registry?.config_entry_id;
    }
    this._entryId = entry;
    return entry;
  }

  // The table row has the rank and the record to fill the header with; a crest
  // elsewhere carries only a name, so the row is looked up when the table is
  // loaded and made up from what is on screen when it is not. A club reached
  // from the statistics opens on its own statistics.
  _openTeamByCode(code, name, logo, tab = 'overview') {
    const table = this._state(this._entities().standings)?.attributes?.table;
    const row = (table ?? []).find(
      (r) => clubKey(r.team_code) === clubKey(code),
    ) ?? { team_code: code, team: name, logo };
    this._recap = null;
    this._panel = 'table';
    this._openTeam(row, tab);
  }

  // The game being played, read straight off the live sensor: it is pushed to
  // the card on every change, so the score in the header moves without a
  // fetch. Once the whistle has gone the sensor keeps the final, and the
  // header says so instead of LIVE.
  _gameView() {
    const live = this._state(this._entities().live);
    const a = live?.attributes ?? {};
    if (!live || !a.home_team) {
      return html`<div class="recap-note">Ingen match pågår.</div>`;
    }
    const [home, away] = String(live.state ?? '').split('-');
    const homeScore = Number(home);
    const awayScore = Number(away);
    const playing = a.in_progress === true;
    const period = periodLabel(a.period);
    const status = playing
      ? [a.intermission ? `Paus efter ${period.toLowerCase()}` : period, a.intermission ? '' : a.clock]
          .filter(Boolean)
          .join(' · ')
      : a.decided_in && a.decided_in !== 'FT'
        ? `Slut (${a.decided_in})`
        : 'Slut';
    const pp = a.powerplay;
    const shots = a.shots;
    // The sensor carries the pairs ready made, with the federation's sheet in
    // them; the shots alone are the fallback for a sensor from before that.
    const stats = Array.isArray(a.stats) && a.stats.length
      ? a.stats
      : shots
      ? [
          { key: 'shots_on_goal', home: shots.home, away: shots.away },
          shots.home_total || shots.away_total
            ? { key: 'shot_attempts', home: shots.home_total, away: shots.away_total }
            : null,
          shots.home_blocked || shots.away_blocked
            ? { key: 'blocked', home: shots.home_blocked, away: shots.away_blocked }
            : null,
        ].filter((stat) => stat && Number(stat.home ?? 0) + Number(stat.away ?? 0) > 0)
      : [];
    // The sensor does not mark which goals were ours; the club it follows is
    // the home side when is_home says so.
    const ours = clubKey(a.is_home ? a.home_code : a.away_code);
    const events = (Array.isArray(a.events) ? a.events : []).map((event) => ({
      ...event,
      ours: clubKey(event.team_code) === ours,
    }));
    return html`
      ${this._scoreboard({
        home: { code: a.home_code, name: a.home_team, logo: a.home_logo, score: home },
        away: { code: a.away_code, name: a.away_team, logo: a.away_logo, score: away },
        playing,
        status: playing ? null : status,
        clock: playing ? status : null,
        periodScores: a.period_scores,
        extra: html`
          ${playing && pp
            ? html`<div class="sb-pp" title=${pp.until ? `Till ${pp.until}` : nothing}>
                Powerplay ${pp.team_name ?? ''} ${pp.advantage ?? ''}
              </div>`
            : nothing}
          ${this._tv(a.tv_channels)}
        `,
      })}
      ${this._statBars(stats, a)}
      ${events.length
        ? this._timeline(events)
        : html`<div class="recap-note">Inget har hänt än.</div>`}
    `;
  }

  // The head of a game, being played or over: the two clubs either side of the
  // score, their crests faded in behind. Over the score is what kind of score
  // it is - LIVE, or how it went for the team - and under it the period being
  // played, or how a finished game was decided.
  _scoreboard({
    home,
    away,
    playing = false,
    status = null,
    outcome = '',
    clock = null,
    periodScores = null,
    extra = nothing,
  }) {
    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    const side = (team, mine, theirs) => html`
      <div
        class="sb-team ${team.code ? 'tappable' : ''} ${mine > theirs ? 'lead' : ''}"
        role=${team.code ? 'button' : nothing}
        tabindex=${team.code ? '0' : nothing}
        title=${team.code ? `Visa ${team.name ?? team.code}` : nothing}
        @click=${team.code
          ? () => this._openTeamByCode(team.code, team.name, team.logo)
          : nothing}
        @keydown=${team.code
          ? (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                this._openTeamByCode(team.code, team.name, team.logo);
              }
            }
          : nothing}
      >
        ${this._badge(team.logo, 'sb-crest')}
        <span class="sb-name">${team.name ?? team.code ?? ''}</span>
      </div>
    `;
    const shown = (value) =>
      value === null || value === undefined || value === '' ? '–' : value;
    return html`
      <div class="scoreboard ${playing ? 'playing-now' : 'over'} ${outcome}">
        ${this._badge(home.logo, 'sb-bg home')}
        ${this._badge(away.logo, 'sb-bg away')}
        <div class="sb-row">
          ${side(home, homeScore, awayScore)}
          <div class="sb-centre">
            <span class="sb-status">
              ${playing ? html`<span class="dot"></span>LIVE` : status}
            </span>
            <span class="sb-score">
              <span class=${homeScore > awayScore ? 'lead' : ''}>${shown(home.score)}</span>
              <span class="sb-dash">–</span>
              <span class=${awayScore > homeScore ? 'lead' : ''}>${shown(away.score)}</span>
            </span>
            ${clock ? html`<span class="sb-clock">${clock}</span>` : nothing}
            ${this._periodScores(periodScores)}
          </div>
          ${side(away, awayScore, homeScore)}
        </div>
        ${extra}
      </div>
    `;
  }

  // Goals period by period, home first, from the federation's sheet.
  _periodScores(scores) {
    if (!Array.isArray(scores) || scores.length < 2) return nothing;
    return html`<span class="sb-periods" title="Mål per period">
      ${scores.map((score) => String(score).replace('-', '–')).join(' · ')}
    </span>`;
  }

  _recapView() {
    const { row, data, error, loading } = this._recap ?? {};
    const locale = localeOf(this.hass);
    const back = html`
      <button
        class="recap-back"
        @click=${() => {
          this._newRequest();
          this._recap = null;
        }}
      >
        <ha-icon icon="mdi:chevron-left"></ha-icon>${this._team
          ? (this._team.row?.team ?? 'Laget')
          : this._tableView === 'live'
            ? this._dayTitle(this._day ?? 0)
            : 'Tidigare matcher'}
      </button>
    `;
    if (loading) return html`${back}${this._loading('Hämtar matchen…', 'hero')}`;
    if (error) return html`${back}<div class="recap-note">${error}</div>`;

    const game = data?.game ?? {};
    const events = Array.isArray(data?.events) ? data.events : [];
    const shots = data?.shots;
    const when = new Date(game.start ?? row?.start ?? '');
    const decidedIn = data?.decided_in ?? game.decided_in;
    // A game being played has no result to report, so the period stands in
    // for it: the score above it is the one being played to.
    // With the league's play-by-play down, the goals come from the game
    // record instead: the right teams and periods, but no scorer, no clock
    // and nothing else counted. Worth saying so rather than looking broken.
    const sparse =
      events.length > 0 &&
      events.every((event) => !event.player) &&
      !shots &&
      !(data?.stats?.length > 0);
    const live = game.in_progress
      ? game.intermission
        ? 'Paus'
        : periodLabel(game.period) || 'Pågår'
      : null;
    const meta = [
      Number.isNaN(when.getTime())
        ? null
        : when.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
      game.round ? `omgång ${game.round}` : null,
      game.venue,
      game.attendance ? `${this._crowd(game.attendance)} åskådare` : null,
    ].filter(Boolean);

    return html`
      ${back}
      ${this._scoreboard({
        home: {
          code: game.home_code,
          name: game.home_team,
          logo: game.home_logo,
          score: game.home_score,
        },
        away: {
          code: game.away_code,
          name: game.away_team,
          logo: game.away_logo,
          score: game.away_score,
        },
        playing: Boolean(game.in_progress),
        status:
          game.won === true ? 'Vinst' : game.won === false ? 'Förlust' : 'Slutresultat',
        outcome: game.in_progress
          ? ''
          : game.won === true
            ? 'won'
            : game.won === false
              ? 'lost'
              : '',
        clock: live ?? DECIDED_IN[decidedIn] ?? null,
        periodScores: data?.period_scores,
      })}
      ${meta.length ? html`<div class="recap-meta sb-meta">${meta.join(' · ')}</div>` : nothing}
      ${data?.highlight
        ? html`
            <a
              class="recap-highlight"
              href=${data.highlight.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              ${data.highlight.thumbnail
                ? html`<span class="recap-highlight-thumb">
                    <img src=${data.highlight.thumbnail} alt="" loading="lazy" />
                    <span class="highlight-play">▶</span>
                  </span>`
                : html`<span class="highlight-play">▶</span>`}
              <span class="recap-highlight-text">
                <span class="recap-highlight-title">Höjdpunkter</span>
                ${data.highlight.heading || data.highlight.subheading
                  ? html`<span class="log-detail">
                      ${[data.highlight.heading, data.highlight.subheading]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>`
                  : nothing}
              </span>
            </a>
          `
        : nothing}
      ${this._statBars(data?.stats, game)}
      ${events.length
        ? html`${sparse
              ? html`<div class="recap-note">
                  Målen kommer från matchprotokollet – den detaljerade rapporten saknas
                  just nu.
                </div>`
              : nothing}${this._timeline(events)}`
        : html`<div class="recap-note">Inget i protokollet.</div>`}
    `;
  }

  // Each stat as one bar split between the sides, so who had the better of it
  // reads without doing the arithmetic. Everything counted from the events;
  // face-offs and hits are not in either league's feed, so they are not here.
  // Shots and penalty minutes say most about a game at a glance; the rest
  // waits behind a button, so the match log is not pushed off the screen.
  _statBars(stats, game = {}) {
    if (!stats?.length) return nothing;
    const home = clubColour(game.home_color, 'var(--primary-color)');
    const away = clubColour(game.away_color, 'var(--secondary-text-color)');
    const first = stats.filter((stat) => KEY_STATS.has(stat.key));
    const rest = stats.filter((stat) => !KEY_STATS.has(stat.key));
    // A game with none of the key stats shows what it has rather than a
    // button and nothing above it.
    const shown = this._statsOpen || !first.length ? stats : first;
    return html`
      <div class="stats">
        ${shown.map((stat) => this._statBar(stat, home, away))}
        ${first.length && rest.length
          ? html`<button
              class="stats-more"
              aria-expanded=${this._statsOpen ? 'true' : 'false'}
              @click=${() => {
                this._statsOpen = !this._statsOpen;
              }}
            >
              ${this._statsOpen ? 'Visa mindre' : `Visa mer statistik (${rest.length})`}
              <ha-icon icon=${this._statsOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
            </button>`
          : nothing}
      </div>
    `;
  }

  // Two scales, as a league's own stat sheet uses: a count is drawn against
  // the two sides added together, a percentage against a hundred. Drawing a
  // percentage against the pair would make 14% against 33% look like a third
  // of the bar, which is not what either number means.
  _statBar(stat, homeColour, awayColour) {
    const percent = stat.kind === 'percent';
    const home = Number(stat.home ?? 0);
    const away = Number(stat.away ?? 0);
    const total = home + away;
    const share = (value) =>
      percent ? Math.min(value, 100) : total ? (value / total) * 100 : 0;
    const shown = (value) =>
      percent ? `${value.toFixed(1).replace('.', ',')} %` : value;
    return html`
      <div class="stat">
        <div class="stat-values">
          <span class="stat-value ${home > away ? 'lead' : ''}">${shown(home)}</span>
          <span class="stat-value ${away > home ? 'lead' : ''}">${shown(away)}</span>
        </div>
        <div class="bar-track">
          <span class="bar-side home">
            <span
              class="bar-fill"
              style=${`width:${share(home)}%;background:${homeColour}`}
            ></span>
          </span>
          <span class="bar-side away">
            <span
              class="bar-fill"
              style=${`width:${share(away)}%;background:${awayColour}`}
            ></span>
          </span>
        </div>
        <div class="stat-foot">
          <span class="stat-detail">${stat.home_detail ?? ''}</span>
          <span class="stat-label">${STAT_LABELS[stat.key] ?? stat.key}</span>
          <span class="stat-detail">${stat.away_detail ?? ''}</span>
        </div>
      </div>
    `;
  }

  _timeline(events) {
    const rows = [];
    let period = null;
    for (const event of events) {
      if (event.period !== period) {
        rows.push(html`
          <div class="team-section ${period === null ? '' : 'cut'}">
            ${periodLabel(event.period)}
          </div>
        `);
        period = event.period;
      }
      rows.push(this._recapEvent(event));
    }
    return rows;
  }

  // One row per event, whatever it was. A goal carries the score it made and
  // who assisted; a penalty or a shootout attempt carries what it was. The
  // shootout is stamped 00:00 throughout, so its clock is left off.
  _recapEvent(event) {
    const icon = recapIcon(event);
    const goal = event.kind === 'goal';
    const assists = Array.isArray(event.assists) ? event.assists : [];
    return html`
      <div class="log-row ${goal && event.ours ? 'goal' : ''}">
        <span class="log-time">
          ${event.kind === 'penalty_shot'
            ? ''
            : `${event.period ? `P${event.period}` : ''} ${event.time ?? ''}`}
        </span>
        <span class="log-icon">${icon}</span>
        <span class="log-text">
          <span class="log-main">
            ${goal && event.score ? `${event.score.replace('-', '–')} ` : ''}<span
              class="log-team"
              >${event.team_code ?? event.team_name ?? ''}</span
            >${this._playerLink(event.player, event.team_code)}${goal && event.strength
              ? ` (${event.strength})`
              : ''}
          </span>
          ${goal
            ? assists.length
              ? html`<span class="log-detail">
                  ${assists.map(
                    (name, index) =>
                      html`${index ? ', ' : ''}${this._playerLink(name, event.team_code)}`,
                  )}
                </span>`
              : nothing
            : event.detail
              ? html`<span class="log-detail">${event.detail}</span>`
              : nothing}
        </span>
      </div>
    `;
  }

  // Scorers and assists both lead to the player behind them.
  _playerLink(name, teamCode, label = name) {
    if (!name) return nothing;
    return html`<span
      class="player-link"
      role="button"
      tabindex="0"
      @click=${(ev) => {
        ev.stopPropagation();
        this._openPlayer(name, teamCode);
      }}
      @keydown=${(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          this._openPlayer(name, teamCode);
        }
      }}
      >${label}</span
    >`;
  }

  // The season's figures for one player, which live in the league's stats
  // tables rather than in anything the card already holds.
  async _openPlayer(name, teamCode) {
    const token = this._newRequest();
    const clean = String(name).replace(/^#\s*\d+\s*/, '');
    this._player = {
      name: clean,
      jersey: String(name).match(/^#\s*(\d+)/)?.[1],
      teamCode: teamCode || this._teamRef(),
      loading: true,
    };
    // Where he stands in the league comes from the statistics, which are
    // read alongside if the card has not got them already.
    if (this._config.show_stats !== false) this._loadStats('season');
    try {
      const entry = await this._configEntryId();
      if (!entry) throw new Error('Hittade inte integrationen');
      const result = await this.hass.callService(
        'swedish_hockey',
        'get_player',
        { config_entry_id: entry, team: teamCode || this._teamRef(), player: clean },
        undefined,
        false,
        true,
      );
      const data = result?.response ?? result;
      if (this._stale(token)) return;
      this._player = { ...this._player, loading: false, data };
    } catch (err) {
      if (this._stale(token)) return;
      this._player = {
        ...this._player,
        loading: false,
        error: err?.message || String(err),
      };
    }
  }

  _playerView() {
    const { name, jersey, data, loading, error } = this._player ?? {};
    const back = html`
      <button
        class="recap-back"
        @click=${() => {
          this._newRequest();
          this._player = null;
        }}
      >
        <ha-icon icon="mdi:chevron-left"></ha-icon>${this._recap
          ? 'Sammanfattning'
          : (this._team?.row?.team ??
            (this._tableView === 'stats' ? 'Statistik' : 'Tillbaka'))}
      </button>
    `;
    if (loading) return html`${back}${this._loading('Hämtar spelaren…', 'hero')}`;
    if (error) return html`${back}<div class="recap-note">${error}</div>`;

    const stats = data?.stats ?? {};
    const player = data?.player ?? {};
    const profile = data?.profile ?? null;
    const goalie = player.role === 'goalkeeper';
    const shirt = profile?.jersey ?? jersey;
    // Everything the league knows about him that is not a number he has put up.
    const facts = profile
      ? [
          profile.age ? `${profile.age} år` : null,
          profile.height ? `${profile.height} cm` : null,
          profile.weight ? `${profile.weight} kg` : null,
          { L: 'vänsterfattad', R: 'högerfattad' }[profile.shoots] ?? null,
          profile.country,
        ].filter(Boolean)
      : [];
    // The three that say most about a season go big in the header; the rest
    // are tiles beneath it.
    const headline = goalie
      ? [
          ['Räddning %', stats.SVS_perc],
          ['Insläppta/match', stats.GAA],
          ['Matcher', stats.GP],
        ]
      : [
          ['Mål', stats.G],
          ['Assist', stats.A],
          ['Poäng', stats.TP],
        ];
    const tiles = goalie
      ? [
          ['Räddningar', stats.SVS],
          ['Vinster', stats.W],
          ['Förluster', stats.L],
          ['Nollor', stats.SO],
          ['Speltid', stats.MIP],
        ]
      : [
          ['Matcher', stats.GP],
          ['+/-', this._plus(stats.PlusMinus)],
          ['Utv. min', stats.PIM],
          ['Skott', stats.SOG],
          ['Istid/match', stats.TOI_GP],
        ];

    const teamCode = this._player?.teamCode;
    const crest = this._crestOf(teamCode, player.team);
    const position = profile?.position ?? (goalie ? 'Målvakt' : null);
    return html`
      ${back}
      <div class="hero player-hero" style=${`--club: ${this._clubColourOf(teamCode)}`}>
        ${this._badge(crest, 'hero-bg')}
        ${shirt ? html`<span class="hero-jersey" aria-hidden="true">${shirt}</span>` : nothing}
        <div class="hero-main">
          ${profile?.photo
            ? html`<img
                class="hero-photo"
                src=${profile.photo}
                alt=""
                loading="lazy"
                role="button"
                tabindex="0"
                title="Visa större"
                @click=${() => {
                  this._photo = profile.photo_large ?? profile.photo;
                }}
                @keydown=${(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    this._photo = profile.photo_large ?? profile.photo;
                  }
                }}
              />`
            : html`<span class="hero-photo hero-shirt">${shirt ?? '?'}</span>`}
          <div class="hero-titles">
            ${position ? html`<span class="hero-kicker">${position}</span>` : nothing}
            <span class="hero-title">${player.name ?? name}</span>
            <span class="hero-sub">
              ${crest ? html`<img class="hero-mini-crest" src=${crest} alt="" />` : nothing}
              ${player.team ?? ''}${shirt ? ` · #${shirt}` : ''}
            </span>
            ${facts.length
              ? html`<span class="player-facts">${facts.join(' · ')}</span>`
              : nothing}
          </div>
        </div>
        ${headline.some(([, value]) => value !== null && value !== undefined && value !== '')
          ? html`<div class="hero-stats hero-headline">
              ${headline.map(([label, value]) => this._stat(label, value))}
            </div>`
          : nothing}
      </div>
      ${profile?.youth_team
        ? html`<div class="player-youth">Moderklubb: ${profile.youth_team}</div>`
        : nothing}
      <div class="team-stats player-stats">
        ${tiles.map(([label, value]) => this._stat(label, value))}
      </div>
      ${this._config.show_stats !== false
        ? this._playerLeague(player.name ?? name, teamCode, goalie)
        : nothing}
    `;
  }

  // 13950 reads better as 13 950, the way Swedish writes a crowd.
  _crowd(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  _logRow(e) {
    const ICON = {
      goal: '🚨',
      penalty: '🟨',
      penalty_shot: '🎯',
      goalie_in: '🧤',
      goalie_out: '🚪',
    };
    const LABEL = {
      goalie_in: 'Målvakt in',
      goalie_out: 'Målvakt ut',
      penalty_shot: 'Straff',
    };
    const assists = Array.isArray(e.assists) && e.assists.length
      ? ` (${e.assists.join(', ')})`
      : '';
    const detail = e.kind === 'goal'
      ? [e.score, e.detail].filter(Boolean).join(' ')
      : e.detail || LABEL[e.kind] || '';
    return html`
      <div class="log-row ${e.kind}">
        <span class="log-time">${e.period ? `P${e.period}` : ''} ${e.time ?? ''}</span>
        <span class="log-icon">${ICON[e.kind] ?? '•'}</span>
        <span class="log-text">
          <span class="log-main">${e.team_code ? `${e.team_code} ` : ''}${e.player ?? ''}${assists}</span>
          ${detail ? html`<span class="log-detail">${detail}</span>` : nothing}
        </span>
      </div>
    `;
  }

  _next(stateObj) {
    const start = new Date(stateObj.state);
    if (Number.isNaN(start.getTime())) {
      return html`<div class="score">-</div>`;
    }
    const locale = localeOf(this.hass);
    const a = stateObj.attributes ?? {};
    return html`
      <div class="kickoff">
        ${start.toLocaleTimeString(locale, timeFormat(this.hass))}
      </div>
      <div class="weekday">
        ${relativeDay(start, locale) ?? start.toLocaleDateString(locale, WEEKDAY)}
      </div>
      <div class="date">${start.toLocaleDateString(locale, DATE)}</div>
      ${a.venue ? html`<div class="venue">${a.venue}</div>` : nothing}
      ${this._tv(a.tv_channels)}
    `;
  }

  // Shots only ever come from the live sensor, so a held result shows the
  // numbers of the game that has just finished - the same source the event log
  // behind the footer button uses.
  _shots(stateObj) {
    if (this._config.show_shots === false) return nothing;
    const shots = stateObj?.attributes?.shots;
    if (!shots) return nothing;
    const home = Number(shots.home ?? 0);
    const away = Number(shots.away ?? 0);
    if (!(home + away > 0)) return nothing;
    const homeTotal = Number(shots.home_total ?? 0);
    const awayTotal = Number(shots.away_total ?? 0);
    const a = stateObj?.attributes ?? {};
    const sides = `${a.home_code ?? a.home_team ?? 'hemma'} ${home} - ${a.away_code ?? a.away_team ?? 'borta'} ${away}`;
    const title =
      homeTotal || awayTotal
        ? `Skott på mål: ${sides}. Skottförsök ${homeTotal}-${awayTotal}`
        : `Skott på mål: ${sides}`;
    return html`
      <div class="shots" title=${title}>(skott ${home}-${away})</div>
    `;
  }

  _lastGoal(stateObj) {
    const a = stateObj.attributes ?? {};
    const scorer = a.last_goal_scorer;
    const team = a.last_goal_team;
    if (!scorer && !team) return nothing;
    const assists = Array.isArray(a.last_goal_assists) ? a.last_goal_assists : [];
    // PP is a power play goal, BP one scored a man down.
    const strength = a.last_goal_strength;
    const code = a.last_goal_team_code;
    return html`
      <div class="footer">
        <div class="footer-line">
          ${a.last_goal_time ? html`<span class="clock">${a.last_goal_time}</span>` : nothing}
          <span>
            ${code && scorer ? html`<span class="log-team">${code}</span>` : nothing}${scorer || team}
          </span>
          ${strength
            ? html`<span
                class="strength"
                title=${strength === 'PP' ? 'Powerplaymål' : 'Boxplaymål'}
                >(${strength})</span
              >`
            : nothing}
        </div>
        ${assists.length
          ? html`<div class="assists">${assists.join(', ')}</div>`
          : nothing}
      </div>
    `;
  }

  static get styles() {
    return [
      css`
      ha-card { overflow: hidden; }
      .pad { padding: 16px; }
      .title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px 0;
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .view-toggle {
        flex: none;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        font-size: 1.5em;
        line-height: 1;
        cursor: pointer;
      }
      .view-toggle:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .final {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--secondary-text-color);
        margin-bottom: 2px;
      }
      .final.won { color: var(--success-color, var(--green-color, #43a047)); }
      .final.lost { color: var(--secondary-text-color); }
      .card { position: relative; overflow: hidden; padding: 20px 16px; }
      .home-bg, .away-bg {
        position: absolute;
        top: -20%;
        width: 58%;
        opacity: 0.08;
        z-index: 0;
        pointer-events: none;
      }
      .home-bg { left: -20%; }
      .away-bg { right: -20%; }
      .content {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-evenly;
        align-items: center;
        text-align: center;
        gap: 8px;
      }
      .team { width: 33%; min-width: 0; }
      .team.tappable {
        cursor: pointer;
        border-radius: 12px;
        padding: 4px 2px;
        margin: -4px -2px;
        transition: background-color 0.15s ease;
      }
      .team.tappable:hover { background: rgba(127, 127, 127, 0.12); }
      .team.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .team.tappable { transition: none; }
      }
      .crest { max-width: 88px; max-height: 80px; width: auto; }
      .placeholder { width: 88px; height: 80px; }
      .team-name {
        margin-top: 4px;
        font-size: 0.95em;
        color: var(--secondary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .middle { min-width: 0; }
      .score {
        font-size: 2.6em;
        font-weight: 500;
        line-height: 1.1;
        color: var(--primary-text-color);
      }
      .period, .venue {
        font-size: 0.9em;
        color: var(--secondary-text-color);
      }
      .period { margin-top: 2px; }
      .venue { margin-top: 10px; }
      .tv {
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
        min-width: 0;
      }
      .tv span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tv ha-icon,
      .fixture-tv ha-icon {
        --mdc-icon-size: 14px;
        flex: none;
      }
      .fixture-tv {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .live-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--error-color, #e53935);
        margin-bottom: 2px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 1.6s ease-in-out infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
      .kickoff {
        font-size: 1.6em;
        line-height: 1.2;
        color: var(--primary-text-color);
      }
      .weekday { font-size: 1.15em; color: var(--primary-text-color); }
      .date { font-size: 0.9em; color: var(--secondary-text-color); }
      .shots {
        margin-top: 1px;
        font-size: 0.8em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .footer {
        position: relative;
        z-index: 5;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid var(--divider-color);
        text-align: center;
      }
      .footer-line {
        display: flex;
        justify-content: center;
        gap: 8px;
        font-size: 0.95em;
        color: var(--primary-text-color);
      }
      .clock { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
      .strength {
        color: var(--secondary-text-color);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .assists {
        margin-top: 2px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .pp {
        margin-top: 6px;
        display: inline-block;
        padding: 3px 10px;
        border-radius: 10px;
        font-size: 0.78em;
        font-weight: 700;
        letter-spacing: 0.04em;
        /* The chip is amber in both themes, so the ink on it has to be pinned
           as well: --primary-text-color goes near-white in the dark theme and
           leaves the badge unreadable against the amber. */
        color: #241a00;
        background: var(--amber-color, #ffc107);
      }
      .footer-bar {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-top: 1px solid var(--divider-color);
      }
      .bar-group { display: flex; gap: 6px; min-width: 0; }
      .bar-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border: none;
        border-radius: 18px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .bar-button:hover { color: var(--primary-text-color); }
      .bar-button.active {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        color: var(--primary-color);
      }
      .bar-button ha-icon { --mdc-icon-size: 18px; flex: none; }
      .bar-button > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-badge {
        flex: none;
        padding: 1px 6px;
        border-radius: 9px;
        background: rgba(127, 127, 127, 0.28);
        font-size: 0.86em;
        font-variant-numeric: tabular-nums;
      }
      @media (prefers-reduced-motion: reduce) { .bar-button { transition: none; } }
      dialog:not(.picker) {
        /* No position of its own: a modal dialog is centred in the viewport by
           the browser with inset: 0 and margin: auto, and anything set here
           drops it back into the flow of the page, beside whatever the card
           happened to be scrolled to. It is a positioned element already, so
           the close button still anchors to it. */
        width: min(520px, calc(100vw - 32px));
        max-height: min(78vh, 720px);
        padding: 0;
        border: none;
        border-radius: 16px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
        overflow: hidden;
      }
      dialog[open] { display: flex; flex-direction: column; }
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
      }
      /* No title bar: each view heads itself, so the close button floats over
         the corner and the content starts at the top of the dialog. */
      .dialog-close {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2;
        flex: none;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: none;
        color: var(--secondary-text-color);
        font-size: 1em;
        line-height: 1;
        cursor: pointer;
      }
      .dialog-close:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .panel {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        /* Clear of the floating close button, which nothing else is holding a
           place for now that the title bar is gone. */
        padding: 44px 20px 18px;
        overscroll-behavior: contain;
      }
      /* A view that opens with its own back button or heading shares the
         close button's line and can start at the top. */
      .panel.tight { padding-top: 12px; }
      /* Only the badge shows the sections in the dialog on a wide screen;
         the card has them on its face. */
      .dialog-nav { display: none; }
      /* Shown instead of the switch wherever the tab bar is. */
      .section-heading { display: none; }
      .view-heading {
        padding-right: 36px;
        margin-bottom: 6px;
        font-size: 1.05em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      .table { display: flex; flex-direction: column; }
      /* Each stretch between two cuts is marked down the left edge, so where
         a club stands reads without counting rows. */
      .table-row {
        --zone: transparent;
        position: relative;
        display: grid;
        /* Form is as wide in every row - five pips or the word heading it -
           since each row lays out its own grid. */
        grid-template-columns: 2.4em minmax(0, 1fr) 2em 2.6em 2.2em 4.4em;
        gap: 6px;
        align-items: center;
        min-height: 40px;
        padding: 0 8px 0 10px;
        border-radius: 8px;
        font-size: 0.92em;
        font-variant-numeric: tabular-nums;
      }
      .table-row:not(.head)::before {
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 2px;
        background: var(--zone);
      }
      .table-row.zone-0 { --zone: var(--success-color, var(--green-color, #43a047)); }
      .table-row.zone-1 { --zone: var(--info-color, var(--primary-color)); }
      .table-row.zone-3 { --zone: var(--error-color, #e53935); }
      .table-row:not(.head):nth-child(odd) {
        background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
      }
      /* Rank and club read as a list; the numbers past them sit under their
         own headings. */
      .table-row > span:nth-child(n + 3) { text-align: center; }
      /* The columns are sized in em, so the heading row keeps the rows' own
         type size and only its labels are set smaller - a smaller row would
         get narrower columns, and the labels would sit off their figures. */
      .table-row.head {
        min-height: 28px;
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .table-row.head > span { font-size: 0.78em; }
      .table-row.tappable { cursor: pointer; }
      .table-row.tappable:hover { background: var(--secondary-background-color); }
      .table-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .hero {
        /* Held at its height in the scrolling panel, as the scoreboard is. */
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 0 -8px 10px;
        padding: 14px 14px 10px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--club, var(--primary-color)) 35%, var(--divider-color));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--club, var(--primary-color)) 24%, transparent),
          color-mix(in srgb, var(--primary-text-color) 3%, transparent) 70%
        );
      }
      .hero-bg {
        position: absolute;
        right: -12%;
        top: 50%;
        width: 55%;
        transform: translateY(-50%);
        opacity: 0.08;
        pointer-events: none;
      }
      .hero-bg.placeholder { display: none; }
      .hero-jersey {
        position: absolute;
        right: 10px;
        top: -0.12em;
        font-size: 6.5em;
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        opacity: 0.07;
        pointer-events: none;
      }
      .hero-main {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .hero-crest {
        flex: none;
        width: 68px;
        height: 68px;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
      }
      .hero-crest.placeholder { border-radius: 50%; background: var(--divider-color); }
      .hero-titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .hero-kicker {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--club, var(--primary-color));
      }
      /* "1:a" is not a word to shout: capitals would make it "1:A". */
      .hero-kicker.as-written {
        text-transform: none;
        letter-spacing: 0.02em;
        font-size: 0.8em;
      }
      .hero-title {
        font-size: 1.45em;
        font-weight: 700;
        line-height: 1.15;
        color: var(--primary-text-color);
        overflow-wrap: anywhere;
      }
      .hero-sub {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.88em;
        color: var(--secondary-text-color);
      }
      .hero-mini-crest { width: 18px; height: 18px; object-fit: contain; }
      .hero-form { display: inline-flex; gap: 4px; margin-top: 4px; }
      .hero-big {
        flex: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1;
      }
      .hero-big-value {
        font-size: 2.4em;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .hero-big-label {
        margin-top: 2px;
        font-size: 0.7em;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .hero-photo {
        flex: none;
        width: 84px;
        height: 84px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--club, var(--primary-color)) 70%, transparent);
        cursor: zoom-in;
      }
      .hero-shirt {
        display: grid;
        place-items: center;
        font-size: 1.8em;
        font-weight: 800;
        cursor: default;
      }
      .hero-stats {
        position: relative;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        text-align: center;
      }
      .hero-stats .stat-value { font-size: 1.2em; font-weight: 700; }
      .hero-headline { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .hero-headline .stat-value { font-size: 1.7em; font-weight: 800; }
      .team-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 2px 0 10px;
      }
      .team-logo { width: 46px; height: 46px; object-fit: contain; flex: none; }
      .team-titles { display: flex; flex-direction: column; min-width: 0; }
      .team-title {
        font-size: 1.15em;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .team-sub { font-size: 0.85em; color: var(--secondary-text-color); }
      .player-link { cursor: pointer; text-decoration: underline dotted; }
      .player-link:hover { color: var(--primary-color); }
      .player-link:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
        border-radius: 3px;
      }
      .photo-overlay {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.78);
        cursor: zoom-out;
      }
      .photo-overlay img {
        max-width: 100%;
        max-height: 100%;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      }
      .player-photo {
        cursor: zoom-in;
        flex: none;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
      }
      .player-facts {
        margin-top: 2px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .player-youth {
        padding-bottom: 8px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .player-jersey {
        flex: none;
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: var(--secondary-background-color);
        font-size: 1.1em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .roster-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 2.2em 2.6em 2.2em 2.4em;
        gap: 6px;
        align-items: baseline;
        padding: 5px 0;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      .roster-row.head {
        color: var(--secondary-text-color);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .roster-row.head > span { font-size: 0.84em; }
      .roster-name {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        text-align: left;
        overflow: hidden;
        white-space: nowrap;
      }
      .roster-photo {
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--secondary-background-color);
      }
      .roster-photo.empty {
        display: grid;
        place-items: center;
        font-size: 0.62em;
        font-weight: 700;
        color: var(--secondary-text-color);
      }
      .roster-position {
        flex: none;
        display: grid;
        place-items: center;
        min-width: 1.5em;
        height: 1.5em;
        padding: 0 3px;
        border-radius: 5px;
        background: var(--secondary-background-color);
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--secondary-text-color);
      }
      .roster-position.gk { background: rgba(255, 167, 38, 0.25); }
      .roster-position.d { background: rgba(66, 165, 245, 0.25); }
      .roster-position.f { background: rgba(102, 187, 106, 0.25); }
      .roster-number {
        flex: none;
        min-width: 1.5em;
        text-align: right;
        color: var(--secondary-text-color);
      }
      .roster-name .player-link {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .roster-sort { cursor: pointer; white-space: nowrap; }
      .roster-sort:hover { color: var(--primary-text-color); }
      .roster-sort.active { color: var(--primary-color); }
      .roster-sort:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .roster-points { font-weight: 600; }
      .roster-goalie { font-variant-numeric: tabular-nums; }

      /* Top right of the game, where a highlights reel belongs. */
      .highlight-corner {
        position: relative;
        flex: none;
        display: block;
        width: 104px;
        border-radius: 10px;
        overflow: hidden;
        text-decoration: none;
        background: var(--secondary-background-color);
      }
      .highlight-thumb {
        display: block;
        width: 104px;
        height: 59px;
        object-fit: cover;
      }
      .highlight-play {
        position: absolute;
        top: 16px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 1.2em;
        color: #fff;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
        pointer-events: none;
      }
      .highlight-caption {
        display: block;
        padding: 3px 6px;
        font-size: 0.72em;
        text-align: center;
        color: var(--primary-text-color);
      }
      .highlight-corner:hover .highlight-caption { color: var(--primary-color); }
      @media (max-width: 420px) {
        .highlight-corner, .highlight-thumb { width: 84px; }
        .highlight-thumb { height: 47px; }
      }
      .player-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      @media (max-width: 420px) {
        .player-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .team-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 10px 0;
        border-top: 1px solid var(--divider-color);
        border-bottom: 1px solid var(--divider-color);
        text-align: center;
      }
      .stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .stat-value {
        font-size: 1.05em;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }
      .stat-label {
        font-size: 0.7em;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      /* A game is a small block of its own: the time down the left, a line
         for each side with its goals at the end, and where and on what
         underneath. */
      .fixture-row {
        display: grid;
        grid-template-columns: 3.4em minmax(0, 1fr) auto;
        grid-template-areas:
          'when home home-goals'
          'when away away-goals'
          '.    meta meta';
        column-gap: 12px;
        row-gap: 3px;
        align-items: center;
        margin-top: 6px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
        font-size: 0.92em;
      }
      .fixture-when {
        grid-area: when;
        align-self: center;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
        white-space: nowrap;
      }
      .fixture-live {
        display: inline-flex;
        align-items: center;
        color: var(--error-color, #e53935);
      }
      .fixture-side {
        min-width: 0;
        display: flex;
        color: var(--primary-text-color);
      }
      .fixture-side.home { grid-area: home; }
      .fixture-side.away { grid-area: away; }
      .fixture-goals {
        min-width: 1.4em;
        text-align: right;
        font-size: 1.05em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .fixture-goals.home { grid-area: home-goals; }
      .fixture-goals.away { grid-area: away-goals; }
      .fixture-goals.lead { font-weight: 700; color: var(--primary-text-color); }
      .fixture-goals.lead.won { color: var(--success-color, var(--green-color, #43a047)); }
      .fixture-goals.lead.lost { color: var(--error-color, #e53935); }
      .fixture-side.lead { font-weight: 600; }
      .fixture-meta {
        grid-area: meta;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
        padding-top: 2px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      .fixture-detail {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 10px;
        min-width: 0;
      }
      .fixture-extra {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        white-space: nowrap;
      }
      .fixture-team {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fixture-team.tappable { cursor: pointer; border-radius: 4px; }
      .fixture-team.tappable:hover { color: var(--primary-color); }
      .fixture-team.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      .fixture-logo { width: 22px; height: 22px; object-fit: contain; flex: none; }
      .fixture-clock { font-weight: 400; color: var(--secondary-text-color); }
      .live-updated {
        padding-top: 10px;
        font-size: 0.76em;
        color: var(--secondary-text-color);
      }
      .schedule-back {
        align-self: flex-start;
        margin: 0 0 4px -6px;
        padding: 4px 6px;
        border: none;
        border-radius: 12px;
        background: none;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        cursor: pointer;
      }
      .schedule-back:hover { color: var(--primary-text-color); }
      /* A view's filters, held at the foot of the panel while the list
         scrolls under them. The gap takes whatever room a short list
         leaves, so the row is at the foot of the screen either way. */
      .filter-gap { flex: 1 0 12px; }
      .filter-bar {
        /* Flush with the panel's foot, over its bottom padding. */
        position: sticky;
        bottom: -18px;
        z-index: 2;
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 -20px -18px;
        padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));
        overflow-x: auto;
        scrollbar-width: none;
        background-color: var(--card-background-color, var(--ha-card-background, #1c1c1c));
        border-top: 1px solid var(--divider-color);
      }
      .filter-bar::-webkit-scrollbar { display: none; }
      /* Read again with the old figures on show: a line runs along the top
         edge. Drawn as the row's own background, so it neither scrolls with
         the chips nor widens what they scroll across. */
      .filter-bar.busy,
      .day-bar.busy {
        background-image: linear-gradient(
          90deg,
          transparent,
          var(--primary-color),
          transparent
        );
        background-size: 40% 2px;
        background-repeat: no-repeat;
        background-position: -70% 0;
        animation: busy-slide 1.2s ease-in-out infinite;
      }
      .day-bar.busy { background-position-y: 100%; }
      @keyframes busy-slide {
        from { background-position-x: -70%; }
        to { background-position-x: 170%; }
      }
      .filter-chip {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        box-sizing: border-box;
        padding: 0 11px;
        border: 1px solid var(--divider-color);
        border-radius: 17px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 0.85em;
        white-space: nowrap;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .filter-chip ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        color: var(--secondary-text-color);
      }
      .filter-chip.active {
        border-color: var(--primary-color);
        background: color-mix(in srgb, var(--primary-color) 22%, var(--secondary-background-color));
        font-weight: 600;
      }
      .filter-chip.active ha-icon { color: var(--primary-color); }
      .filter-chip:focus-visible,
      .filter-select:has(select:focus-visible) {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      /* A chip saying what is chosen, with the browser's own select over it
         unseen: a tap opens the phone's own picker. */
      .filter-select {
        position: relative;
        padding-right: 7px;
      }
      .filter-select ha-icon { margin-left: -2px; }
      .filter-select select {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        border: none;
        /* What the opened list is drawn in, on a desktop. */
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        /* Anything smaller and iOS zooms the page in on a tap. */
        font-size: 16px;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
      }
      .team-pick { max-width: min(60vw, 260px); padding-right: 7px; }
      .team-pick-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .team-pick > ha-icon:first-child { margin-left: -2px; }
      .crest-stack { display: inline-flex; flex: none; }
      .crest-stack > img,
      .crest-stack > .crest-blank {
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        padding: 1px;
        border-radius: 50%;
        object-fit: contain;
        background: var(--card-background-color, var(--ha-card-background, #fff));
      }
      .crest-stack > * + * { margin-left: -7px; }
      .live-dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--secondary-text-color);
      }
      .live-chip.active {
        border-color: var(--error-color, #e53935);
        background: color-mix(in srgb, var(--error-color, #e53935) 16%, var(--secondary-background-color));
        color: var(--error-color, #e53935);
      }
      .live-chip.active .live-dot {
        background: var(--error-color, #e53935);
        animation: pulse 1.6s ease-in-out infinite;
      }

      /* ---- The club list ---- */
      dialog.picker {
        width: min(400px, calc(100vw - 32px));
        max-width: none;
        max-height: min(80vh, 640px);
        padding: 0;
        border: none;
        border-radius: 18px;
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      }
      dialog.picker[open] { animation: picker-in 0.18s ease-out; }
      @keyframes picker-in {
        from { transform: scale(0.96); opacity: 0; }
      }
      .picker-head {
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 18px 20px 10px;
      }
      .picker-title { font-size: 1.1em; font-weight: 600; }
      .picker-count { font-size: 0.8em; color: var(--secondary-text-color); }
      .picker-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 10px 8px;
      }
      .picker-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 48px;
        padding: 6px 10px;
        border: none;
        border-radius: 12px;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: background-color 0.12s ease;
      }
      .picker-row:hover { background: var(--secondary-background-color); }
      .picker-row.on {
        background: color-mix(in srgb, var(--primary-color) 13%, transparent);
        font-weight: 600;
      }
      .picker-row:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .picker-crest { width: 28px; height: 28px; flex: none; object-fit: contain; }
      .picker-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker-ours {
        flex: none;
        padding: 2px 7px;
        border-radius: 8px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font-size: 0.72em;
        font-weight: 600;
      }
      .picker-check {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        box-sizing: border-box;
        border: 2px solid var(--divider-color);
        border-radius: 50%;
        color: transparent;
        --mdc-icon-size: 16px;
        transition: background-color 0.12s ease, border-color 0.12s ease;
      }
      .picker-row.on .picker-check {
        border-color: var(--primary-color);
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .picker-foot {
        flex: none;
        display: flex;
        gap: 10px;
        padding: 12px 16px 14px;
        border-top: 1px solid var(--divider-color);
      }
      .picker-foot button {
        flex: 1;
        padding: 11px 16px;
        border: none;
        border-radius: 22px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .picker-clear {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      .picker-clear[disabled] { opacity: 0.45; cursor: default; }
      .picker-done {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .picker-foot button:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      /* ---- Loading ---- */
      .loading { flex: none; display: flex; flex-direction: column; gap: 6px; }
      .loading-label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 6px 0 4px;
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
      .spinner {
        flex: none;
        width: 14px;
        height: 14px;
        box-sizing: border-box;
        border: 2px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
        border-top-color: var(--primary-color);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      /* The shape of what is coming, fading out down the panel. */
      .skeleton {
        display: flex;
        flex-direction: column;
        -webkit-mask-image: linear-gradient(#000 45%, transparent);
        mask-image: linear-gradient(#000 45%, transparent);
      }
      .sk {
        display: block;
        height: 11px;
        border-radius: 6px;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent) 30%,
          color-mix(in srgb, var(--primary-text-color) 15%, transparent) 50%,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent) 70%
        );
        background-size: 300% 100%;
        animation: shimmer 1.6s ease-in-out infinite;
      }
      @keyframes shimmer {
        from { background-position: 100% 0; }
        to { background-position: 0 0; }
      }
      .sk-heading { width: 32%; height: 9px; margin: 16px 0 6px; }
      .sk-crest { flex: none; width: 22px; height: 22px; border-radius: 50%; }
      .sk-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; }
      .sk-line { flex: none; }
      .sk-num { height: 10px; }
      .sk-block { height: 120px; border-radius: 14px; }
      .sk-block.sk-ours { margin-top: 4px; }
      .sk-block.sk-hero { height: 150px; margin-bottom: 10px; }
      .sk-side { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .sk-fixture {
        display: grid;
        grid-template-columns: 3.4em minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 8px;
        align-items: center;
        margin-top: 6px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .sk-when { grid-row: 1 / span 2; height: 13px; width: 85%; }
      .sk-row {
        display: grid;
        grid-template-columns: 1.4em 22px minmax(0, 1fr) 1.8em 1.8em 1.8em;
        gap: 10px;
        align-items: center;
        min-height: 40px;
        padding: 0 8px;
      }
      .sk-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .sk-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border-radius: 14px;
        background: var(--secondary-background-color);
      }
      @media (prefers-reduced-motion: reduce) {
        .sk,
        .spinner,
        .filter-bar.busy,
        .day-bar.busy,
        .live-chip.active .live-dot { animation: none; }
        .filter-bar.busy,
        .day-bar.busy { background-position-x: 50%; }
        .filter-chip,
        .picker-row,
        .picker-check { transition: none; }
      }
      .fixture-row.tappable { cursor: pointer; }
      .fixture-row.tappable:hover {
        background: color-mix(in srgb, var(--primary-text-color) 8%, var(--secondary-background-color));
      }
      .fixture-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .fixture-row.next { box-shadow: inset 3px 0 0 var(--primary-color); }
      .team-tabs { padding-top: 12px; }
      .recap-score { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .recap-figures { font-variant-numeric: tabular-nums; }
      .recap-score .fixture-logo { width: 22px; height: 22px; }
      .fixture-row.self {
        background: color-mix(in srgb, var(--primary-color) 14%, var(--secondary-background-color));
      }
      .fixture-row.self .fixture-side { font-weight: 600; }
      .fixture-clip {
        display: inline-flex;
        color: var(--secondary-text-color);
        text-decoration: none;
        --mdc-icon-size: 18px;
      }
      .fixture-clip:hover { color: var(--primary-color); }
      .team-section {
        padding: 12px 0 4px;
        font-size: 0.74em;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .table-row.self,
      .table-row.self:nth-child(odd) {
        font-weight: 700;
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }
      .table-row.self .table-name { color: var(--primary-color); }
      /* A little air at each cut, and a faint line across it. */
      .table-row.cut { margin-top: 7px; }
      .table-row.cut::after {
        content: '';
        position: absolute;
        left: 10px;
        right: 8px;
        top: -4px;
        border-top: 1px dashed var(--divider-color);
      }
      .table-rank { color: var(--secondary-text-color); font-weight: 500; }
      .table-row.self .table-rank { color: var(--primary-color); }
      .table-rank { display: flex; align-items: baseline; gap: 2px; }
      .move { font-size: 0.62em; line-height: 1; }
      .move.up { color: var(--success-color, var(--green-color, #43a047)); }
      .move.down { color: var(--error-color, #e53935); }
      .playing {
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 5px;
        border-radius: 50%;
        background: var(--error-color, #e53935);
        animation: pulse 1.6s ease-in-out infinite;
      }
      .switch {
        display: flex;
        gap: 4px;
        padding: 8px 0 6px;
      }
      .switch button {
        flex: 1;
        padding: 5px 10px;
        border: none;
        border-radius: 14px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.82em;
        line-height: 1;
        cursor: pointer;
      }
      /* Where the switch is the way between the views, it stays at the top
         of the panel as the long schedule scrolls, beside the close button. */
      .switch.section-switch {
        position: sticky;
        top: -44px;
        z-index: 1;
        flex: none;
        margin: 0 -20px;
        padding: 6px 48px 8px 20px;
        background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      }
      .switch button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }
      .switch-badge {
        min-width: 15px;
        padding: 1px 4px;
        border-radius: 8px;
        background: var(--error-color, #db4437);
        color: #fff;
        font-size: 0.85em;
        font-weight: 600;
        line-height: 1.3;
      }
      .switch button.active .switch-badge {
        background: var(--text-primary-color, #fff);
        color: var(--primary-color);
      }
      .switch button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-weight: 600;
      }
      .table-team {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .table-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .table-logo { width: 22px; height: 22px; object-fit: contain; flex: none; }
      .table-team .playing { flex: none; margin: 0; }
      .table-form {
        display: flex;
        align-items: center;
        gap: 3px;
        justify-content: center;
      }
      .form-pip {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--disabled-color, #9e9e9e);
      }
      .form-pip.win { background: var(--success-color, var(--green-color, #43a047)); }
      .form-pip.otwin {
        background: var(--success-color, var(--green-color, #43a047));
        opacity: 0.5;
      }
      .form-pip.otloss { background: var(--warning-color, #ffa726); }
      .form-pip.loss { background: var(--error-color, #e53935); }
      @media (max-width: 460px) {
        /* Form stays on a phone; the row tightens around it instead. */
        .table-row {
          grid-template-columns: 2.1em minmax(0, 1fr) 1.8em 2.3em 2em 4.2em;
          gap: 4px;
          padding: 0 6px 0 8px;
          font-size: 0.88em;
        }
        .table-team { gap: 8px; }
        .table-logo { width: 20px; height: 20px; }
        .table-form { gap: 3px; }
        .form-pip { width: 7px; height: 7px; }
      }
      .table-points { font-weight: 700; font-size: 1.05em; }
      .log-row {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 8px;
        align-items: baseline;
        padding: 5px 0;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
      }
      .log-row:first-child { border-top: none; }
      .team-section.cut {
        margin-top: 4px;
        border-top: 2px solid var(--secondary-text-color);
      }
      .log-row.goal .log-main { font-weight: 600; }
      .log-row.tappable {
        grid-template-columns: auto auto minmax(0, 1fr) auto;
        cursor: pointer;
      }
      .log-row.tappable:hover { background: var(--secondary-background-color); }
      .log-row.tappable:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .chevron {
        color: var(--secondary-text-color);
        font-size: 1.1em;
        line-height: 1;
      }
      .recap-live {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 2px;
        font-size: 0.8em;
        font-weight: 600;
        color: var(--error-color, #db4437);
      }
      /* A pill, so it reads as something to press rather than a caption. */
      .recap-back {
        /* The panel is a scrolling flex column, which would squash it. */
        flex: none;
        align-self: flex-start;
        display: inline-flex;
        line-height: 20px;
        align-items: center;
        gap: 2px;
        max-width: calc(100% - 48px);
        margin: 0 36px 10px 0;
        padding: 6px 14px 6px 6px;
        border: none;
        border-radius: 18px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font: inherit;
        font-size: 0.88em;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      .recap-back ha-icon { --mdc-icon-size: 20px; flex: none; }
      .recap-back:hover {
        background: color-mix(in srgb, var(--primary-text-color) 10%, var(--secondary-background-color));
      }
      .recap-back:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .recap-note {
        padding: 6px 0;
        font-size: 0.88em;
        color: var(--secondary-text-color);
      }
      .scoreboard {
        /* The panel is a scrolling flex column; without this the header is
           what gives way once the match log outgrows the screen. */
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 0 -8px 4px;
        padding: 16px 10px 12px;
        border-radius: 14px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--primary-text-color) 7%, transparent),
          color-mix(in srgb, var(--primary-text-color) 2%, transparent)
        );
        border: 1px solid var(--divider-color);
      }
      .scoreboard.playing-now {
        border-color: color-mix(in srgb, var(--error-color, #e53935) 45%, transparent);
      }
      .sb-bg {
        position: absolute;
        top: 50%;
        width: 46%;
        transform: translateY(-50%);
        opacity: 0.07;
        pointer-events: none;
      }
      .sb-bg.home { left: -14%; }
      .sb-bg.away { right: -14%; }
      .sb-bg.placeholder { display: none; }
      .sb-row {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 8px;
      }
      .sb-team {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 0;
        text-align: center;
        color: var(--secondary-text-color);
      }
      .sb-team.lead { color: var(--primary-text-color); }
      .sb-team.tappable { cursor: pointer; }
      .sb-team.tappable:hover .sb-name { text-decoration: underline; }
      .sb-crest { width: 56px; height: 56px; object-fit: contain; }
      .sb-crest.placeholder { border-radius: 50%; background: var(--divider-color); }
      .sb-name {
        max-width: 100%;
        font-size: 0.9em;
        font-weight: 600;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      .sb-centre {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .sb-status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .playing-now .sb-status { color: var(--error-color, #e53935); }
      .sb-score {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 2.6em;
        font-weight: 700;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .sb-score .lead { color: var(--primary-text-color); }
      .sb-dash { font-weight: 400; opacity: 0.6; }
      .scoreboard.won {
        border-color: color-mix(in srgb, var(--success-color, #43a047) 45%, transparent);
      }
      .scoreboard.won .sb-status { color: var(--success-color, #43a047); }
      .scoreboard.lost .sb-status { color: var(--error-color, #e53935); }
      .sb-meta {
        margin: 2px 0 6px;
        text-align: center;
      }
      .recap-highlight {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 4px 0 6px;
        padding: 8px;
        border-radius: 12px;
        background: var(--secondary-background-color);
        color: inherit;
        text-decoration: none;
      }
      .recap-highlight:hover .recap-highlight-title { color: var(--primary-color); }
      .recap-highlight > .highlight-play {
        position: static;
        color: var(--primary-color);
        text-shadow: none;
      }
      .recap-highlight-thumb .highlight-play { top: 50%; transform: translateY(-50%); }
      .recap-highlight-thumb {
        position: relative;
        flex: none;
        width: 96px;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        overflow: hidden;
        background: #000;
      }
      .recap-highlight-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .recap-highlight-text { display: flex; flex-direction: column; min-width: 0; }
      .recap-highlight-title { font-weight: 600; }
      .sb-periods {
        margin-top: 2px;
        font-size: 0.75em;
        letter-spacing: 0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .sb-clock {
        font-size: 0.85em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .sb-pp {
        position: relative;
        width: fit-content;
        margin: 10px auto 0;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 0.78em;
        font-weight: 600;
        color: #3a2a00;
        background: var(--amber-color, #ffc107);
      }
      .scoreboard .tv {
        position: relative;
        justify-content: center;
        margin-top: 8px;
      }
      .recap-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--divider-color);
      }
      .recap-summary {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .recap-score {
        font-size: 1.05em;
        font-weight: 600;
        color: var(--primary-text-color);
      }
      .recap-score.won { color: var(--success-color, var(--green-color, #43a047)); }
      .recap-score.lost { color: var(--error-color, #e53935); }
      .recap-meta { font-size: 0.82em; color: var(--secondary-text-color); }
      .stats {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px 0 6px;
      }
      .day-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 6px;
      }
      .day-title {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        font-size: 1.05em;
        font-weight: 500;
        color: var(--primary-text-color);
      }
      /* The date over the day's name, as an app's page title puts it. */
      .day-sub {
        order: -1;
        font-size: 0.75em;
        font-weight: normal;
        color: var(--secondary-text-color);
      }
      .day-step {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
      }
      .day-step ha-icon { --mdc-icon-size: 22px; }
      /* Tall enough to swipe on even when the day has nothing in it; up and
         down stays with the page. */
      .day-body {
        min-height: 50vh;
        touch-action: pan-y;
      }
      .stats-more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        align-self: center;
        padding: 6px 14px;
        border: none;
        border-radius: 16px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.85em;
        cursor: pointer;
      }
      .stats-more:hover { color: var(--primary-text-color); }
      .stats-more ha-icon { --mdc-icon-size: 18px; }
      .stat-values {
        display: flex;
        justify-content: space-between;
        font-size: 0.95em;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
      }
      .stat-value.lead { color: var(--primary-text-color); font-weight: 700; }
      /* Two bars meeting in the middle: home grows out to the left, away to
         the right, so which way a game went is a glance rather than a sum. */
      .bar-track { display: flex; height: 7px; gap: 2px; margin: 3px 0; }
      .bar-side {
        flex: 1 1 50%;
        display: flex;
        background: rgba(127, 127, 127, 0.16);
      }
      .bar-side.home { justify-content: flex-end; border-radius: 4px 0 0 4px; }
      .bar-side.away { justify-content: flex-start; border-radius: 0 4px 4px 0; }
      .bar-fill { height: 100%; border-radius: 4px; }
      .stat-foot {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: baseline;
        gap: 8px;
        font-size: 0.78em;
        color: var(--secondary-text-color);
      }
      .stat-label { text-align: center; }
      .stat-foot > .stat-detail:last-child { text-align: right; }
      .log-time {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .log-icon { line-height: 1; }
      .log-text { min-width: 0; display: flex; flex-direction: column; }
      .log-main {
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .log-detail { font-size: 0.86em; color: var(--secondary-text-color); }
      .log-team {
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-right: 5px;
      }
      .pip {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        display: inline-block;
        flex: none;
        background: var(--disabled-color, #9e9e9e);
      }
      .pip.win { background: var(--success-color, var(--green-color, #43a047)); }
      .pip.loss { background: var(--error-color, #e53935); }
      .pip.draw { background: var(--warning-color, #ffa726); }
      /* ---- Statistik ---- */
      /* The statistics' own sections as a segmented control, so they do not
         read as a second row of the dialog's tabs. */
      .switch.st-sections {
        flex: none;
        gap: 2px;
        margin: 0 0 8px;
        padding: 3px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .switch.st-sections button {
        padding: 7px 6px;
        border-radius: 9px;
        background: none;
        font-size: 0.84em;
      }
      .switch.st-sections button.active {
        background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
        color: var(--primary-color);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      }
      /* When the figures were read, and the league's own pages. */
      .st-foot {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 4px 14px;
        margin-top: 14px;
        font-size: 0.78em;
        color: var(--secondary-text-color);
      }
      .st-source {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
        text-decoration: none;
        --mdc-icon-size: 14px;
      }
      .st-source:hover { color: var(--primary-color); }
      /* A place in the league: green near the top, red near the foot. */
      .st-place {
        font-size: 0.72em;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--secondary-text-color);
        white-space: nowrap;
      }
      .st-place.top { color: var(--success-color, var(--green-color, #43a047)); }
      .st-place.bottom { color: var(--error-color, #e53935); }
      /* The followed club, as the league sees it. */
      .st-ours {
        flex: none;
        position: relative;
        overflow: hidden;
        margin: 4px -8px 2px;
        padding: 10px 12px 10px;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--club, var(--primary-color)) 35%, var(--divider-color));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--club, var(--primary-color)) 22%, transparent),
          color-mix(in srgb, var(--primary-text-color) 3%, transparent) 70%
        );
        cursor: pointer;
      }
      .st-ours:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .st-ours-head {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }
      .st-ours-head ha-icon { margin-left: auto; color: var(--secondary-text-color); }
      .st-ours-crest { width: 26px; height: 26px; object-fit: contain; }
      .st-ours-crest.placeholder { display: none; }
      .st-ours-tiles {
        position: relative;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 4px;
        margin-top: 8px;
        text-align: center;
      }
      .st-ours-tile { display: flex; flex-direction: column; align-items: center; min-width: 0; }
      .st-ours-value {
        font-size: 0.98em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .st-ours-label {
        font-size: 0.66em;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .st-ours-foot {
        position: relative;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      @media (max-width: 460px) {
        .st-ours-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 8px; }
      }
      /* Leaders: a row of cards per kind that scrolls sideways, each card
         snapping into place, the next one peeking in at the edge. */
      .lb-head {
        flex: none;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
      }
      .lb-arrows { display: flex; gap: 4px; padding-bottom: 2px; }
      .lb-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        cursor: pointer;
        --mdc-icon-size: 20px;
      }
      .lb-arrow:hover { color: var(--primary-text-color); }
      @media (hover: none) and (pointer: coarse) { .lb-arrows { display: none; } }
      .lb-track {
        flex: none;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: calc((100% - 50px) / 2);
        gap: 10px;
        margin: 0 -20px;
        padding: 2px 20px 8px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scroll-snap-type: x mandatory;
        scroll-padding-inline: 20px;
        scrollbar-width: none;
      }
      .lb-track::-webkit-scrollbar { display: none; }
      @media (max-width: 600px) {
        .lb-track { grid-auto-columns: 82%; }
      }
      .lb-card {
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 8px 12px 8px;
        border-radius: 14px;
        background: var(--secondary-background-color);
      }
      .lb-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        padding: 2px 0 6px;
        border: none;
        background: none;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 0.72em;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-align: left;
        cursor: pointer;
        --mdc-icon-size: 16px;
      }
      .lb-title:hover { color: var(--primary-color); }
      .lb-top {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 8px;
        margin: 0 -6px 2px;
        border-radius: 10px;
      }
      .lb-photo {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        background: var(--card-background-color, rgba(127, 127, 127, 0.2));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--club, var(--primary-color)) 70%, transparent);
      }
      .lb-photo.crest {
        object-fit: contain;
        background: none;
        box-shadow: none;
        border-radius: 0;
      }
      .lb-top-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
      /* The leader's name is the one worth reading in full, so it may take
         a second line rather than be cut short. */
      .lb-top-name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-weight: 600;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      .lb-top-team {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        font-size: 0.78em;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lb-mini { width: 14px; height: 14px; object-fit: contain; flex: none; }
      .lb-top-value {
        font-size: 1.45em;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .lb-unit { margin-left: 2px; font-size: 0.6em; font-weight: 700; }
      .lb-row {
        display: grid;
        grid-template-columns: 1.4em 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 6px;
        margin: 0 -6px;
        border-top: 1px solid var(--divider-color);
        border-radius: 6px;
        font-size: 0.86em;
      }
      .lb-rank {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .lb-crest { width: 18px; height: 18px; object-fit: contain; }
      .lb-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lb-value {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .lb-top.self,
      .lb-row.self,
      .st-row.self {
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }
      .lb-row.self .lb-name,
      .st-row.self .st-name { font-weight: 600; }
      /* A long name has a short form, for where a column is narrow. */
      .short-name { display: none; }
      /* A list of names is a list of links; underlining every one of them
         is noise, so they say so on hover instead. */
      .lb-card .player-link,
      .st-table .player-link,
      .ts-board .player-link { text-decoration: none; }
      .lb-card .player-link:hover,
      .st-table .player-link:hover,
      .ts-board .player-link:hover { text-decoration: underline; }
      /* Tables: rank and name, then a handful of figures under headings
         that sort. */
      .st-groups {
        flex: none;
        display: flex;
        gap: 6px;
        padding: 2px 0 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .st-groups::-webkit-scrollbar { display: none; }
      .st-groups .filter-chip { height: 30px; padding: 0 10px; font-size: 0.8em; }
      .st-table { display: flex; flex-direction: column; }
      .st-row {
        display: grid;
        gap: 4px;
        align-items: center;
        min-height: 34px;
        padding: 0 4px;
        border-top: 1px solid var(--divider-color);
        border-radius: 6px;
        font-size: 0.86em;
        font-variant-numeric: tabular-nums;
      }
      .st-row > span:nth-child(n + 3) { text-align: right; white-space: nowrap; }
      /* Not held at the top while the list scrolls: there it would slide
         under the close button and the dialog's own switch. */
      .st-row.head {
        min-height: 28px;
        border-top: none;
        border-radius: 0;
        color: var(--secondary-text-color);
        text-transform: uppercase;
      }
      .st-row .sorted { font-weight: 700; }
      .st-row.head > span { font-size: 0.8em; letter-spacing: 0; }
      .st-arrow { font-size: 0.75em; margin-left: 1px; }
      .st-row.unranked { opacity: 0.6; }
      .st-rank { color: var(--secondary-text-color); font-size: 0.92em; }
      .st-name {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .st-name .player-link { overflow: hidden; text-overflow: ellipsis; }
      .st-crest { width: 18px; height: 18px; flex: none; object-fit: contain; }
      .st-short {
        padding: 10px 4px 4px;
        font-size: 0.74em;
        color: var(--secondary-text-color);
      }
      .st-more { margin-top: 10px; flex: none; }
      .st-legend {
        padding-top: 10px;
        font-size: 0.72em;
        line-height: 1.5;
        color: var(--secondary-text-color);
      }
      @media (max-width: 460px) {
        .st-row { gap: 3px; padding: 0 2px; font-size: 0.82em; }
        .st-crest { width: 16px; height: 16px; }
        .st-name { gap: 4px; }
        .st-name .full-name { display: none; }
        .st-name .short-name { display: inline; }
      }
      /* A club's figures, each with a bar from the league's worst to its
         best and the average marked across it. */
      .ts-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 2.6em;
        grid-template-areas:
          'label value place'
          'track track track';
        align-items: baseline;
        column-gap: 10px;
        row-gap: 4px;
        padding: 7px 0 6px;
        border-top: 1px solid var(--divider-color);
        font-size: 0.88em;
      }
      .ts-label { grid-area: label; min-width: 0; color: var(--primary-text-color); }
      .ts-value {
        grid-area: value;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .ts-row .st-place { grid-area: place; text-align: right; }
      .ts-track {
        grid-area: track;
        position: relative;
        height: 5px;
        border-radius: 3px;
        background: rgba(127, 127, 127, 0.18);
      }
      .ts-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 3px;
      }
      .ts-mean {
        position: absolute;
        top: -3px;
        bottom: -3px;
        width: 2px;
        margin-left: -1px;
        border-radius: 1px;
        background: var(--primary-text-color);
        opacity: 0.55;
      }
      .ts-leaders {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        padding-top: 4px;
      }
      @media (max-width: 420px) {
        .ts-leaders { grid-template-columns: minmax(0, 1fr); }
      }
      .ts-board {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--secondary-background-color);
      }
      .ts-board-title {
        padding-bottom: 4px;
        font-size: 0.7em;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .ts-board-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 2.4em;
        gap: 6px;
        align-items: baseline;
        padding: 3px 0;
        font-size: 0.84em;
      }
      .ts-board-place {
        text-align: right;
        font-size: 0.82em;
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
      }
      /* A player's figures with where each puts him in the league. */
      .lr-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      @media (max-width: 420px) {
        .lr-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .lr-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        min-width: 0;
        padding: 8px 4px;
        border-radius: 10px;
        background: var(--secondary-background-color);
        text-align: center;
      }
      .lr-value {
        font-size: 1.1em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .lr-label {
        font-size: 0.68em;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      @media (max-width: 420px) {
        .crest, .placeholder { max-width: 62px; max-height: 58px; }
        .placeholder { width: 62px; height: 58px; }
        .score { font-size: 2.1em; }
      }
    `,
      PHONE_DIALOG,
    ];
  }
}

class HockeyMatchCardEditor extends LitElement {
  static get properties() {
    return { hass: { attribute: false }, _config: { state: true } };
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
  }

  // Built per render rather than as a static schema: the team options come
  // from whatever devices this Home Assistant actually has.
  _schema() {
    const teams = findTeams(this.hass).map((t) => ({ value: t.team, label: t.team }));
    return [
      {
        name: 'team',
        required: true,
        selector: { select: { mode: 'dropdown', options: teams, custom_value: true } },
      },
      { name: 'title', selector: { text: {} } },
      {
        type: 'grid',
        name: '',
        flatten: true,
        schema: [
          { name: 'show_clock', selector: { boolean: {} } },
          { name: 'show_powerplay', selector: { boolean: {} } },
          { name: 'show_shots', selector: { boolean: {} } },
          { name: 'show_tv', selector: { boolean: {} } },
          { name: 'show_events', selector: { boolean: {} } },
          { name: 'show_table', selector: { boolean: {} } },
          { name: 'show_results', selector: { boolean: {} } },
          { name: 'show_stats', selector: { boolean: {} } },
        ],
      },
      {
        name: 'result_hours',
        selector: { number: { min: 0, max: 48, step: 1, mode: 'box' } },
      },
    ];
  }

  render() {
    if (!this.hass || !this._config) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .schema=${this._schema()}
        .data=${this._config}
        .computeLabel=${(s) => LABELS[s.name] ?? s.name}
        .computeHelper=${(s) => HELPERS[s.name] ?? ''}
        @value-changed=${this._changed}
      ></ha-form>
    `;
  }

  _changed(ev) {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: { ...this._config, ...ev.detail.value } },
      })
    );
  }
}

const LABELS = {
  team: 'Team',
  title: 'Title',
  show_clock: 'Clock',
  show_powerplay: 'Power play',
  show_shots: 'Shots on goal',
  show_tv: 'TV channel',
  show_events: 'Event log',
  show_table: 'League table',
  show_results: 'Previous results',
  show_stats: 'Statistics',
  result_hours: 'Hold result (hours)',
};

const HELPERS = {
  team: 'Entities are found from the team\u2019s device.',
  result_hours: 'How long the finished result stays up. 0 to switch straight to the next game.',
};

customElements.define('hockey-match-card-editor', HockeyMatchCardEditor);

customElements.define('hockey-match-card', HockeyMatchCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hockey-match-card',
  name: 'Hockey Match',
  description: 'Live score while a game is on, next fixture otherwise.',
  preview: false,
});
// The same club as a chip among the view's badges: the next fixture between
// games, the score while one is on. It is the card underneath - a tap opens
// the card's own dialog, with the footer's buttons moved up into it, since
// there is no card face here to carry them.
class HockeyMatchBadge extends HockeyMatchCard {
  static getConfigElement() {
    return document.createElement('hockey-match-badge-editor');
  }

  static getStubConfig(hass) {
    return {
      type: 'custom:hockey-match-badge',
      team: findTeams(hass)[0]?.code ?? findTeams(hass)[0]?.team ?? '',
    };
  }

  render() {
    if (!this.hass || !this._config) return nothing;

    this._entityCache = null;
    const ids = this._entities();
    const live = this._state(ids.live);
    const next = this._state(ids.next);
    const isLive = live?.attributes?.in_progress === true;
    const lastResult = next?.attributes?.last_result ?? null;
    const recent =
      !isLive && this._resultIsRecent(lastResult, Number(this._config.result_hours ?? 6));
    const showResult = isLive || recent;

    // Kept for _dialogNav, which the dialog calls while it renders.
    this._nav = this._barButtons(live, next, ids, showResult);
    const { events, table, liveTable, results, liveGames } = this._nav;

    // What a tap opens: the summary of the result on show, if that is what
    // the chip is showing.
    this._shownResult = !isLive && recent ? lastResult : null;
    const content = isLive
      ? this._chipLive(live)
      : recent
        ? this._chipResult(lastResult)
        : this._chipNext(next);

    return html`
      <div
        class="chip ${isLive ? 'is-live' : ''} ${content ? '' : 'empty'}"
        role="button"
        tabindex="0"
        aria-haspopup="dialog"
        @click=${this._openFromChip}
        @keydown=${(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this._openFromChip();
          }
        }}
      >
        ${content ?? html`<ha-icon icon="mdi:hockey-sticks"></ha-icon>
          <span class="chip-text">Ingen match</span>`}
      </div>
      ${this._panel ? this._dialog(events, table, liveTable, results, liveGames) : nothing}
    `;
  }

  // While a game is on the dialog opens on it, on the summary of the result the
  // chip is showing after one, and otherwise on the table.
  // The rest is one tap away along the tabs.
  _openFromChip() {
    this._newRequest();
    this._stopLive();
    this._recap = null;
    this._team = null;
    this._player = null;
    this._tableView = 'table';
    if (this._isLive()) {
      this._panel = 'game';
    } else if (this._shownResult) {
      // Opened over the day the game was played, which is where its back
      // button leads - today, or yesterday for a late game read after
      // midnight.
      const start = new Date(this._shownResult.start ?? '');
      const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      this._day = Number.isNaN(start.getTime())
        ? 0
        : Math.round((midnight(start) - midnight(new Date())) / 86400000);
      this._panel = 'table';
      this._tableView = 'live';
      this._watchLive();
      this._loadRecap({ ...this._shownResult, latest: true });
    } else {
      this._panel = 'table';
    }
  }

  _isLive() {
    return this._state(this._entities().live)?.attributes?.in_progress === true;
  }

  _crests(a, score) {
    return html`
      ${this._chipCrest(a.home_logo)}
      <span class="chip-text">
        ${a.home_code ?? a.home_team ?? ''}
        <span class="chip-score">${score}</span>
        ${a.away_code ?? a.away_team ?? ''}
      </span>
      ${this._chipCrest(a.away_logo)}
    `;
  }

  _chipCrest(src) {
    return src ? html`<img class="chip-crest" src=${src} alt="" loading="lazy" />` : nothing;
  }

  _chipLive(stateObj) {
    const a = stateObj.attributes ?? {};
    const text = String(a.period ?? '').replace(/^P/i, '');
    const period = /^[1-3]$/.test(text) ? `P${text}` : periodLabel(text);
    const clock = a.intermission
      ? 'Paus'
      : this._config.show_clock !== false
        ? (a.clock ?? '')
        : '';
    const detail = [period, clock].filter(Boolean).join(' ');
    return html`
      <span class="chip-dot"></span>
      ${this._crests(a, String(stateObj.state).replace('-', '–'))}
      ${detail ? html`<span class="chip-detail">${detail}</span>` : nothing}
    `;
  }

  _chipResult(result) {
    const extra = result.decided_in && result.decided_in !== 'FT' ? ` ${result.decided_in}` : '';
    const outcome = result.won === true ? 'won' : result.won === false ? 'lost' : '';
    return html`
      ${this._crests(result, String(result.score ?? '').replace('-', '–'))}
      <span class="chip-detail ${outcome}">Slut${extra}</span>
    `;
  }

  _chipNext(stateObj) {
    if (!stateObj) return null;
    const start = new Date(stateObj.state);
    if (Number.isNaN(start.getTime())) return null;
    const locale = localeOf(this.hass);
    // Within the week the weekday says it; further out it needs the date.
    const soon = start - Date.now() < 6 * 86400e3;
    const day =
      relativeDay(start, locale) ??
      start.toLocaleDateString(locale, soon ? { weekday: 'short' } : SHORT_DATE);
    const time = start.toLocaleTimeString(locale, timeFormat(this.hass));
    return html`
      ${this._crests(stateObj.attributes ?? {}, '–')}
      <span class="chip-detail">${day} ${time}</span>
    `;
  }

  static get styles() {
    return [
      super.styles,
      css`
        :host { display: inline-block; }
        /* The look of Home Assistant's own entity badge, so the chip sits in
           the row of badges as one of them. */
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-sizing: border-box;
          height: var(--ha-badge-size, 36px);
          min-width: var(--ha-badge-size, 36px);
          padding: 0 12px 0 8px;
          border-radius: var(--ha-badge-border-radius, 18px);
          border: var(--ha-card-border-width, 1px) solid
            var(--ha-card-border-color, var(--divider-color, #e0e0e0));
          background: var(--ha-card-background, var(--card-background-color, #fff));
          box-shadow: var(--ha-card-box-shadow, none);
          -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
          backdrop-filter: var(--ha-card-backdrop-filter, none);
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-s, 12px);
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .chip:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .chip.is-live {
          border-color: color-mix(in srgb, var(--red-color, #f44336) 55%, transparent);
        }
        .chip.empty { color: var(--secondary-text-color); }
        .chip ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
        .chip-crest { width: 20px; height: 20px; object-fit: contain; flex: none; }
        .chip-text { display: inline-flex; align-items: center; gap: 5px; }
        .chip-score {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .chip-detail {
          color: var(--secondary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .chip-detail.won { color: var(--green-color, #4caf50); }
        .chip-detail.lost { color: var(--red-color, #f44336); }
        .chip-dot {
          width: 8px;
          height: 8px;
          flex: none;
          border-radius: 50%;
          background: var(--red-color, #f44336);
          animation: chip-pulse 1.6s ease-in-out infinite;
        }
        @keyframes chip-pulse { 50% { opacity: 0.35; } }
        @media (prefers-reduced-motion: reduce) { .chip-dot { animation: none; } }
        /* The badge row sets a small type size; the dialog is read like the
           card's, so it is put back. */
        dialog {
          font-size: var(--ha-font-size-m, 14px);
          font-weight: normal;
          line-height: normal;
          white-space: normal;
        }
        /* The badge's sections head the dialog on a wide screen; the nav
           comes after the view in the markup, for the phone's tab bar. */
        .dialog-nav {
          display: flex;
          order: -1;
          flex-wrap: wrap;
          flex: none;
          gap: 6px;
          /* Clear of the floating close button in the corner. */
          padding: 10px 52px 6px 14px;
        }
        .panel,
        .panel.tight { padding-top: 8px; }
        /* The tabs choose the view, so the table's own switch gives way to a
           heading. */
        .section-switch { display: none; }
        .section-heading { display: block; }
      `,
      PHONE_DIALOG,
    ];
  }
}

// The card's editor, less what only the card face shows.
class HockeyMatchBadgeEditor extends HockeyMatchCardEditor {
  _schema() {
    const drop = new Set(['title', 'show_powerplay', 'show_shots']);
    return super
      ._schema()
      .filter((s) => !drop.has(s.name))
      .map((s) =>
        s.schema ? { ...s, schema: s.schema.filter((f) => !drop.has(f.name)) } : s,
      );
  }
}

customElements.define('hockey-match-badge-editor', HockeyMatchBadgeEditor);
customElements.define('hockey-match-badge', HockeyMatchBadge);
window.customBadges = window.customBadges || [];
window.customBadges.push({
  type: 'hockey-match-badge',
  name: 'Hockey Match',
  description: 'Next game, or the score while one is on. Tap for the table.',
  preview: true,
});
