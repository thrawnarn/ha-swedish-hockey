/**
 * A made-up league, shaped like the integration's sensors and service answers.
 *
 * Fourteen clubs with invented names and codes, a season of games around a
 * fixed "now", statistics and a squad - enough for every view of the card,
 * and nothing copied from a real league's data.
 */

export const NOW = new Date("2026-10-05T18:00:00Z");

const NAMES = [
  ["NOR", "Norrby IF"], ["SÖD", "Söderås HC"], ["VÄS", "Västvik IK"], ["ÖST", "Östberga HK"],
  ["BJÖ", "Björkhamn BK"], ["LIN", "Lindvalla SK"], ["MOS", "Mossby IF"], ["FUR", "Furuholm HC"],
  ["ALM", "Almsjö IK"], ["EKE", "Ekeby HK"], ["GRA", "Granlunda IF"], ["HAG", "Hagaström BK"],
  ["KVA", "Kvarnby SK"], ["TOR", "Torsåker IK"],
];

const crest = (code) => `/crests/${code}.svg`;

export const CLUBS = NAMES.map(([code, name], index) => ({
  code,
  name,
  logo: crest(code),
  color: `#${((index * 2654435761) >>> 8).toString(16).padStart(6, "0").slice(0, 6)}`,
}));

/** The club the card follows. */
export const OURS = CLUBS[0];

const club = (code) => CLUBS.find((c) => c.code === code);

/** The league table, best first. */
export const TABLE = CLUBS.map((c, i) => ({
  rank: i + 1,
  team: c.name,
  team_code: c.code,
  logo: c.logo,
  games_played: 8,
  wins: 7 - Math.floor(i / 2),
  losses: Math.floor(i / 2),
  overtime_wins: 0,
  overtime_losses: 1,
  goals_for: 30 - i,
  goals_against: 15 + i,
  goal_difference: 15 - 2 * i,
  points: 22 - i,
  is_self: c.code === OURS.code,
  form: [
    { result: "win", opponent: "X", score: "3-1", is_home: true, start: "2026-09-20T17:00:00Z" },
    { result: i % 2 ? "loss" : "win", opponent: "Y", score: "2-4", is_home: false, start: "2026-09-25T17:00:00Z" },
  ],
}));

/** A season: two games a day for a fortnight either side of NOW. */
export const GAMES = (() => {
  const games = [];
  for (let day = -14; day <= 14; day++) {
    for (let slot = 0; slot < 2; slot++) {
      const at = (n) => CLUBS[((n % 14) + 14) % 14];
      const home = at(day * 2 + slot);
      const away = at(day * 5 + slot * 3 + 5);
      if (home === away) continue;
      const start = new Date(NOW);
      start.setUTCDate(start.getUTCDate() + day);
      start.setUTCHours(17, 0, 0, 0);
      const played = day < 0;
      games.push({
        start: start.toISOString(),
        home_team: home.name,
        away_team: away.name,
        home_code: home.code,
        away_code: away.code,
        home_logo: home.logo,
        away_logo: away.logo,
        home_color: home.color,
        away_color: away.color,
        home_score: played ? (day + 20) % 5 : null,
        away_score: played ? (slot + 21) % 4 : null,
        state: played ? "post-game" : "pre-game",
        decided_in: played ? "FT" : null,
        venue: `${home.name.split(" ")[0]} Arena`,
        tv_channels: played ? [] : ["Kanal 1"],
        round: String(day + 20),
        game_id: `g${day + 20}-${slot}`,
      });
    }
  }
  return games;
})();

export const NEXT_INDEX = GAMES.findIndex((g) => g.home_score === null);

/** The bookmaker's odds, as the services carry them, on the next games: the
 *  next round in the league and our own next game. */
export const ODDS = { home: 1.38, draw: 5.8, away: 6.75, market: "Ordinarie tid", source: "Svenska Spel", updated: "2026-10-05T17:30:00Z" };
const isOurs = (g) => g.home_code === "NOR" || g.away_code === "NOR";
for (const game of GAMES.filter((g) => g.home_score === null && !isOurs(g)).slice(0, 2)) {
  game.odds = { ...ODDS };
}
GAMES.find((g) => g.home_score === null && isOurs(g)).odds = { ...ODDS, home: 2.1, draw: 4.2, away: 2.9 };

export const ourGames = () =>
  GAMES.filter((g) => g.home_code === OURS.code || g.away_code === OURS.code);

const nextGame = () => ourGames().find((g) => g.home_score === null);
const lastGame = () => ourGames().filter((g) => g.home_score !== null).at(-1);

/** The result as the next-game sensor carries it. */
export function resultOf(game) {
  const home = game.home_code === OURS.code;
  const mine = home ? game.home_score : game.away_score;
  const theirs = home ? game.away_score : game.home_score;
  return {
    ...game,
    score: `${game.home_score}-${game.away_score}`,
    won: mine === theirs ? null : mine > theirs,
  };
}

/** The three sensors a team's device carries. */
export function sensors({ live = null, lastResult = null, liveTable = null } = {}) {
  const next = nextGame();
  return {
    "sensor.norrby_next": {
      state: next.start,
      attributes: {
        team_code: OURS.code,
        stat_net_number: "1",
        ...next,
        is_home: next.home_code === OURS.code,
        recent_results: ourGames().filter((g) => g.home_score !== null).slice(-5).reverse().map(resultOf),
        last_result: lastResult,
      },
    },
    "sensor.norrby_live": live ?? {
      state: "unknown",
      attributes: { live_scoring: true, in_progress: false },
    },
    "sensor.norrby_standing": {
      state: "1",
      attributes: {
        team_code: OURS.code,
        points: TABLE[0].points,
        table: TABLE,
        live_games: liveTable ? 2 : 0,
        ...(liveTable ? { live_table: liveTable } : {}),
      },
    },
  };
}

export const REGISTRY = {
  entities: {
    "sensor.norrby_next": { device_id: "dev-norrby", platform: "swedish_hockey" },
    "sensor.norrby_live": { device_id: "dev-norrby", platform: "swedish_hockey" },
    "sensor.norrby_standing": { device_id: "dev-norrby", platform: "swedish_hockey" },
    // Another integration's entity on another device, carrying an attribute
    // the live sensor has too: it must not be taken for a team.
    "update.something": { device_id: "dev-other", platform: "hacs" },
  },
  devices: {
    "dev-norrby": { name: "Norrby", config_entries: ["entry-1"] },
    "dev-other": { name: "Something", config_entries: ["entry-2"] },
  },
};

/** A game being played, as the live sensor reports it. */
export function liveSensor() {
  const game = nextGame();
  return {
    state: "2-1",
    attributes: {
      live_scoring: true,
      in_progress: true,
      period: "2",
      clock: "08:14",
      intermission: false,
      ...game,
      is_home: game.home_code === OURS.code,
      shots: { home: 14, away: 9, home_total: 25, away_total: 18 },
      powerplay: { advantage: "5 mot 4", team_name: OURS.name, until: "10:14" },
      events: [
        { kind: "goal", period: "1", time: "04:10", team_code: game.home_code, player: "#9 Ada Berg", assists: ["#4 Bo Ek"], score: "1-0" },
        { kind: "penalty", period: "1", time: "11:02", team_code: game.away_code, player: "#3 Cid Dahl", detail: "2 min, Hooking" },
        { kind: "goal", period: "2", time: "02:31", team_code: game.away_code, player: "#12 Dan Ehn", assists: [], score: "1-1" },
        { kind: "goal", period: "2", time: "07:58", team_code: game.home_code, player: "#9 Ada Berg", assists: ["#15 Eva Fors", "#4 Bo Ek"], score: "2-1", strength: "PP" },
      ],
      last_goal_scorer: "Ada Berg",
      last_goal_team: OURS.name,
      last_goal_team_code: OURS.code,
      last_goal_time: "07:58",
      last_goal_assists: ["Eva Fors", "Bo Ek"],
      last_goal_strength: "PP",
    },
  };
}

const PLAYERS = ["Ada Berg", "Bo Ek", "Cid Dahl", "Dan Ehn", "Eva Fors", "Fia Gran"];

/** The league's statistics, every club with six skaters and a goalkeeper. */
export function statistics({ last = null } = {}) {
  const skaters = [];
  const goalies = [];
  CLUBS.forEach((c, ci) => {
    PLAYERS.forEach((name, pi) => {
      const g = (ci + pi * 3) % 7;
      const a = (ci * 2 + pi) % 9;
      skaters.push({
        player: `${name} ${c.code}`,
        team_code: c.code,
        team: c.name,
        GP: 8,
        G: g,
        A: a,
        TP: g + a,
        PlusMinus: (pi % 5) - 2,
        PIM: pi * 2,
        SOG: 10 + pi + ci,
        S_perc: 8 + pi,
        S_perc_ok: pi !== 5,
        position_code: pi < 2 ? "CE" : pi < 4 ? "LD" : "RW",
        TOI_GP: `1${pi}:3${ci % 10}`,
      });
    });
    goalies.push({
      player: `Målvakt ${c.code}`,
      team_code: c.code,
      team: c.name,
      GPI: 8,
      SVS_perc: 92 - ci / 4,
      GAA: 2 + ci / 10,
      SO: ci % 3,
      W: 8 - (ci % 8),
      ok: true,
    });
  });
  const teams = TABLE.map((r, i) => ({
    team_code: r.team_code,
    team: r.team,
    logo: r.logo,
    color: CLUBS[i].color,
    GP: 8,
    PTS: r.points,
    PTS_GP: r.points / 8,
    GF_GP: 3.5 - i / 10,
    GA_GP: 2 + i / 10,
    GD: r.goal_difference,
    PP_perc: 25 - i,
    PK_perc: 85 - i / 2,
    SVS_perc: 92 - i / 4,
    FO_perc: 52 - i / 3,
    ATT_avg: 5000 - i * 150,
  }));
  return {
    skaters,
    goalies,
    teams,
    scopes: { last: true },
    updated: "2026-10-05T17:45:00Z",
    stats_url: "https://example.invalid/stats",
    ...(last ? { last } : {}),
  };
}

export function roster() {
  return {
    team: OURS.name,
    team_code: OURS.code,
    players: [
      ...PLAYERS.map((name, i) => ({
        player: name,
        team: OURS.code,
        jersey: String(4 + i * 3),
        GP: 8,
        G: 6 - i,
        A: 2 + i,
        TP: 8,
        role: "skater",
        position_code: i < 2 ? "CE" : i < 4 ? "LD" : "RW",
      })),
      { player: "Gun Hed", team: OURS.code, jersey: "30", GP: 8, SVS_perc: 92.1, SO: 1, GAA: 2.1, role: "goalkeeper", position_code: "GK" },
    ],
  };
}

export function recap(game = lastGame()) {
  return {
    game: { ...resultOf(game), attendance: 4321 },
    events: [
      { kind: "goal", period: "1", time: "05:00", team_code: game.home_code, player: "#9 Ada Berg", assists: ["#4 Bo Ek"], score: "1-0", ours: true },
      { kind: "penalty", period: "2", time: "10:00", team_code: game.away_code, player: "#3 Cid Dahl", detail: "2 min, Tripping" },
    ],
    stats: [
      { key: "shots_on_goal", kind: "count", home: 30, away: 22 },
      { key: "penalty_minutes", kind: "count", home: 4, away: 6 },
      { key: "save_pct", kind: "percent", home: 91.2, away: 88.5 },
    ],
    period_scores: ["1-0", "0-0", "1-1"],
    decided_in: "FT",
  };
}

export function player(name = "Ada Berg") {
  return {
    player: { name, team: OURS.name, role: "skater" },
    profile: { name, jersey: "9", position: "Center", shoots: "L", height: 180, weight: 82, age: 24, country: "SWE" },
    stats: { GP: 8, G: 6, A: 2, TP: 8, PlusMinus: 3, PIM: 2, SOG: 20, TOI_GP: "17:30" },
  };
}

/** Two clubs before a game, as get_matchup tells it. */
export function matchup(gameId) {
  const game = GAMES.find((g) => g.game_id === gameId) ?? ourGames().find((g) => g.home_score === null);
  const between = GAMES.filter(
    (g) =>
      [g.home_code, g.away_code].includes(game.home_code) &&
      [g.home_code, g.away_code].includes(game.away_code),
  );
  const side = (code, where) => {
    const row = TABLE.find((r) => r.team_code === code);
    const club = CLUBS.find((c) => c.code === code);
    return {
      team_code: code,
      team: club.name,
      logo: club.logo,
      color: club.color,
      form: row.form,
      home_form: row.form.slice(0, 1),
      away_form: row.form.slice(1),
      record: { games: 8, wins: 5, overtime_wins: 1, overtime_losses: 1, losses: 1, goals_for: 30, goals_against: 15, points: 20 },
      home_record: { games: 4, wins: 3, overtime_wins: 0, overtime_losses: 1, losses: 0, goals_for: 14, goals_against: 6, points: 10 },
      away_record: { games: 4, wins: 2, overtime_wins: 1, overtime_losses: 0, losses: 1, goals_for: 16, goals_against: 9, points: 8 },
      streak: where === "home" ? { kind: "win", count: 3 } : { kind: "loss", count: 1 },
      last_game: { result: "win", score: "4-3", opponent: "X", opponent_name: "Någon IF", is_home: true, start: "2026-10-03T16:00:00Z" },
      rest_days: where === "home" ? 3 : 1,
      standing: row,
    };
  };
  return {
    game,
    home: side(game.home_code, "home"),
    away: side(game.away_code, "away"),
    meetings: between.map((g) => ({ ...g, this_game: g.game_id === game.game_id })),
    season: 2026,
  };
}

/** Their meetings in earlier seasons, as the federation's archive gives them. */
export function headToHeadArchive(team, opponent, count = 9) {
  const one = CLUBS.find((c) => c.code === team);
  const other = CLUBS.find((c) => c.code === opponent);
  const meetings = Array.from({ length: count }, (_, i) => {
    const [home, away] = i % 2 ? [other, one] : [one, other];
    const season = 2025 - Math.floor(i / 4);
    return {
      season: `${season}-${String(season + 1).slice(2)}`,
      league: i < 4 ? "SHL" : "HockeyAllsvenskan",
      series: i === 0 ? "SM-slutspel SHL" : i < 4 ? "SHL" : "HockeyAllsvenskan",
      start: `${season + 1}-0${1 + (i % 3)}-1${i}T19:00:00+01:00`,
      home_team: home.name,
      away_team: away.name,
      home_code: home.code,
      away_code: away.code,
      home_logo: home.logo,
      away_logo: away.logo,
      home_score: (i + 3) % 5,
      away_score: (i + 1) % 4,
      decided_in: i === 2 ? "OT" : i === 5 ? "SO" : "FT",
      venue: `${home.name.split(" ")[0]} Arena`,
    };
  });
  return {
    meetings,
    seasons: ["2025-26 SHL", "2024-25 SHL", "2025-26 HockeyAllsvenskan", "2024-25 HockeyAllsvenskan"],
  };
}

/** What each service answers. A test can replace any of them. */
export function services() {
  return {
    get_schedule: (data) =>
      data.team
        ? { games: data.limit === 3 ? ourGames().filter((g) => g.home_score === null).slice(0, 3) : ourGames(), next_index: 0 }
        : { games: GAMES, next_index: NEXT_INDEX },
    get_results: () => ({ results: ourGames().filter((g) => g.home_score !== null).reverse().map(resultOf) }),
    get_statistics: (data) => statistics(data),
    get_live: () => ({ games: GAMES.slice(NEXT_INDEX, NEXT_INDEX + 2) }),
    get_form_table: () => ({ table: TABLE.slice().reverse().map((r, i) => ({ ...r, rank: i + 1 })) }),
    get_roster: () => roster(),
    get_recap: () => recap(),
    get_player: (data) => player(data.player),
    get_matchup: (data) => matchup(data.game_id),
    get_head_to_head: (data) => headToHeadArchive(data.team, data.opponent),
  };
}
