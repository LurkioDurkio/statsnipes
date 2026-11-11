// STATSNIPES — NBA • NFL • MLB Game Engine

(function () {
  "use strict";

  // 1. Combine all sport categories
  const ALL_CATEGORIES = [
    ...(window.NBA_CATEGORIES || []),
    ...(window.NFL_CATEGORIES || []),
    ...(window.MLB_CATEGORIES || [])
  ];
  const DAILY_NICHE_CATEGORIES = window.DAILY_NICHE_CATEGORIES || [];
  const DAILY_NICHE_MANIFEST = window.DAILY_NICHE_MANIFEST || { NBA: [], NFL: [], MLB: [] };
  const NICHE_EXTRA_NAMES = window.NICHE_EXTRA_NAMES || { NBA: [], NFL: [], MLB: [] };
  const hydratedNicheCache = {};
  const nicheShardPromises = {};

  // Build master searchable player directory per sport (so autocomplete never spoils Top 100 status)
  const SPORT_PLAYER_DIRECTORY = { NBA: [], NFL: [], MLB: [] };

  function registerNicheCategoryToDirectory(cat) {
    if (!cat || !cat.sport || !SPORT_PLAYER_DIRECTORY[cat.sport] || cat._dirRegistered) return;
    cat._dirRegistered = true;
    const dir = SPORT_PLAYER_DIRECTORY[cat.sport];
    const existing = new Set(dir.map((p) => p.name.toLowerCase()));
    let added = false;
    (cat.players || []).forEach((p) => {
      const k = p.name.toLowerCase();
      if (!existing.has(k)) {
        existing.add(k);
        dir.push({
          name: p.name,
          team: (p.team || cat.sport).replace(/\s*\(.*?\)/g, ""),
          era: p.era || "Career"
        });
        added = true;
      }
    });
    if (added) {
      dir.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  function hydrateNicheCategory(raw) {
    if (!raw) return null;
    if (raw.players) return raw;
    if (hydratedNicheCache[raw.id]) return hydratedNicheCache[raw.id];
    const players = (raw.p || []).map((row, idx) => ({
      rank: idx + 1,
      name: row[0],
      stat: row[1],
      team: row[2] || raw.sport,
      era: row[3] || "Career"
    }));
    const hydrated = {
      id: raw.id,
      sport: raw.sport,
      dailyOnly: true,
      title: raw.title,
      subtitle: raw.subtitle,
      unit: raw.unit,
      defaultTarget: raw.defaultTarget,
      targetDesc: raw.targetDesc,
      players,
      extraRanks: raw.ex || []
    };
    hydratedNicheCache[raw.id] = hydrated;
    registerNicheCategoryToDirectory(hydrated);
    return hydrated;
  }

  function findHydratedNicheById(id) {
    if (!id) return null;
    if (hydratedNicheCache[id]) return hydratedNicheCache[id];
    const shards = window.__NICHE_SHARDS || {};
    const keys = Object.keys(shards);
    for (let i = 0; i < keys.length; i++) {
      const bucket = shards[keys[i]];
      if (bucket && bucket[id]) {
        return hydrateNicheCategory(bucket[id]);
      }
    }
    return null;
  }

  function ensureDailyShardLoaded(shardName) {
    if (!shardName) return Promise.resolve();
    if (window.__NICHE_SHARDS && window.__NICHE_SHARDS[shardName]) {
      return Promise.resolve();
    }
    if (nicheShardPromises[shardName]) return nicheShardPromises[shardName];
    nicheShardPromises[shardName] = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = `data/niche/${shardName}.js?v=18`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return nicheShardPromises[shardName];
  }

  function buildSportDirectories() {
    ["NBA", "NFL", "MLB"].forEach((sport) => {
      const map = new Map();
      // Add all players from standard + daily-exclusive categories of this sport
      [...ALL_CATEGORIES, ...DAILY_NICHE_CATEGORIES]
        .filter((c) => c.sport === sport)
        .forEach((cat) => {
          cat.players.forEach((p) => {
            const key = p.name.toLowerCase();
            if (!map.has(key)) {
              map.set(key, {
                name: p.name,
                team: p.team.replace(/\s*\(.*?\)/g, ""), // Strip trap notes from autocomplete!
                era: p.era
              });
            }
          });
          if (Array.isArray(cat.extraRanks)) {
            cat.extraRanks.forEach((pair) => {
              const nm = pair[0];
              const key = nm.toLowerCase();
              if (!map.has(key)) {
                map.set(key, {
                  name: nm,
                  team: sport,
                  era: "Career"
                });
              }
            });
          }
        });

      // Add extra players + daily niche extra names (preloaded in manifest)
      const extras = (window.EXTRA_SPORT_PLAYERS && window.EXTRA_SPORT_PLAYERS[sport]) || [];
      extras.forEach((p) => {
        const key = p.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: p.name,
            team: p.team,
            era: p.era
          });
        }
      });

      const nicheExtras = NICHE_EXTRA_NAMES[sport] || [];
      nicheExtras.forEach((row) => {
        const nm = row[0];
        const key = nm.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: nm,
            team: row[1] || sport,
            era: row[2] || "Career"
          });
        }
      });

      // Add any seasonal players from window.SEASON_LOGS
      const sLogs = window.SEASON_LOGS && window.SEASON_LOGS[sport];
      if (sLogs) {
        Object.keys(sLogs).forEach((yr) => {
          (sLogs[yr] || []).forEach((row) => {
            const pName = row[0];
            const pTeam = row[1] || sport;
            const key = pName.toLowerCase();
            if (!map.has(key)) {
              map.set(key, {
                name: pName,
                team: pTeam,
                era: `${yr}`
              });
            }
          });
        });
      }

      SPORT_PLAYER_DIRECTORY[sport] = Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
  }

  buildSportDirectories();

  // 2. Web Audio Synth Sound Effects
  class SoundFX {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    playTone(freq, type, duration, delay = 0, vol = 0.14) {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration);
      } catch (e) {
        // Ignore audio errors
      }
    }

    playPinpointLegend() {
      // Celebratory 4-note fanfare for #90-#100 pulls!
      this.playTone(523.25, "triangle", 0.15, 0, 0.18);
      this.playTone(659.25, "triangle", 0.15, 0.09, 0.18);
      this.playTone(783.99, "triangle", 0.15, 0.18, 0.18);
      this.playTone(1046.5, "sine", 0.4, 0.27, 0.22);
    }

    playDeepPull() {
      this.playTone(440, "sine", 0.14, 0, 0.16);
      this.playTone(659.25, "sine", 0.28, 0.1, 0.18);
    }

    playSafeHit() {
      this.playTone(392, "sine", 0.18, 0, 0.14);
      this.playTone(493.88, "sine", 0.22, 0.08, 0.14);
    }

    playStrike() {
      // Low buzzer for losing a life
      this.playTone(155, "sawtooth", 0.22, 0, 0.16);
      this.playTone(115, "sawtooth", 0.35, 0.15, 0.18);
    }

    playVictory() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
        this.playTone(f, "triangle", 0.25, idx * 0.09, 0.16);
      });
    }
  }

  const sfx = new SoundFX();

  // 3. Game State
  const state = {
    sport: "NBA",
    mode: "top100", // 'top100' | 'target'
    isDaily: false,
    dailyDateStr: "", // YYYY-MM-DD (empty = today, or archive date)
    dailySubmode: "sniper", // 'sniper' (5-Shot Sniper, max 490 pts) | 'target' (5-Pick Target Stat)
    dailyMaxShots: 5,
    dailyPracticeReplay: false,
    categoryId: "nba_pts",
    cutoff: 100,
    maxLives: 3,
    winCondition: "points", // 'points' | 'survival'
    redemptionEnabled: true, // If eliminated, can still guess; hitting #90-#100 gives +1 life & points!
    showMissRank: true, // Show exact rank (#101+) when a guess is outside the Top 100
    targetGoal: 115000,
    maxPicks: 5,
    bustRule: "bust", // 'bust' | 'closest'
    shotClockSeconds: 0,
    boardHints: false,
    boardFilter: "all",
    boardRevealedPostgame: false,

    // Progressive 3-Stage Deep-Bag Clue state
    activeClueRank: null,
    activeClueStage: 0,

    // Couch Series tracking state for current match
    seriesRecordedForMatch: false,
    previousSeriesSnapshot: null,

    players: [
      {
        id: 0,
        name: "Player 1",
        score: 0,
        lives: 3,
        eliminated: false,
        bestPull: null,
        picks: []
      }
    ],
    playerCount: 1,
    playerNamesConfig: ["Player 1", "Player 2", "Player 3", "Player 4"],
    currentTurnIndex: 0,
    guessedNames: new Set(), // normalized lowercase names
    revealedRanks: new Map(), // rank -> { playerObj, pickedBy }
    pickHistory: [],
    gameOver: false,

    // Autocomplete state
    acMatches: [],
    acHighlightIndex: -1,

    // Shot clock timer
    timerInterval: null,
    timerRemaining: 0,

    // Custom dynamic category (when built via Season/Era/Constraint Explorer)
    customCategory: null,

    // Undo history stack for reverting misclicks / accidental guesses
    undoStack: []
  };

  // Sport Metric Definitions for Dynamic Season, Era & Constraint Builder
  const SPORT_METRICS = {
    NBA: [
      { key: "pts", label: "Points (PTS)", unit: "PTS", baseId: "nba_pts", idx: 3, defaultTarget: 115000 },
      { key: "ast", label: "Assists (AST)", unit: "AST", baseId: "nba_ast", idx: 4, defaultTarget: 35000 },
      { key: "reb", label: "Rebounds (REB)", unit: "REB", baseId: "nba_reb", idx: 5, defaultTarget: 55000 },
      { key: "fg3m", label: "3-Pointers Made (3PM)", unit: "3PM", baseId: "nba_3pm", idx: 6, defaultTarget: 11000 },
      { key: "blk", label: "Blocks (BLK)", unit: "BLK", baseId: "nba_blk", idx: 7, defaultTarget: 11500 },
      { key: "stl", label: "Steals (STL)", unit: "STL", baseId: "nba_stl", idx: 8, defaultTarget: 9500 },
      { key: "fgm", label: "Field Goals Made (FGM)", unit: "FGM", baseId: "nba_fgm", idx: 9, defaultTarget: 45000 },
      { key: "ftm", label: "Free Throws Made (FTM)", unit: "FTM", baseId: "nba_ftm", idx: 10, defaultTarget: 30000 },
      { key: "gp", label: "Games Played (GP)", unit: "GP", baseId: "nba_gp", idx: 2, defaultTarget: 6000 },
      { key: "tov", label: "Turnovers (TOV)", unit: "TOV", baseId: "nba_tov", idx: 11, defaultTarget: 16000 },
      { key: "pra", label: "Pts + Reb + Ast (PRA)", unit: "PRA", baseId: null, calc: (r) => (r[3] || 0) + (r[4] || 0) + (r[5] || 0), defaultTarget: 185000 }
    ],
    NFL: [
      { key: "pass_yds", label: "Passing Yards", unit: "YDS", baseId: "nfl_pass_yds", idx: 4, defaultTarget: 220000 },
      { key: "pass_td", label: "Passing Touchdowns", unit: "TD", baseId: "nfl_pass_td", idx: 5, defaultTarget: 1600 },
      { key: "rush_yds", label: "Rushing Yards", unit: "YDS", baseId: "nfl_rush_yds", idx: 6, defaultTarget: 55000 },
      { key: "rush_td", label: "Rushing Touchdowns", unit: "TD", baseId: "nfl_rush_td", idx: 7, defaultTarget: 500 },
      { key: "rec_yds", label: "Receiving Yards", unit: "YDS", baseId: "nfl_rec_yds", idx: 8, defaultTarget: 60000 },
      { key: "rec_td", label: "Receiving Touchdowns", unit: "TD", baseId: "nfl_rec_td", idx: 9, defaultTarget: 500 },
      { key: "rec", label: "Receptions", unit: "REC", baseId: "nfl_rec", idx: 10, defaultTarget: 4800 },
      { key: "sacks", label: "Quarterback Sacks", unit: "SACKS", baseId: "nfl_sacks", idx: 11, defaultTarget: 625 },
      { key: "def_int", label: "Defensive Interceptions", unit: "INT", baseId: null, idx: 12, defaultTarget: 160 },
      { key: "scrim_yds", label: "Scrimmage Yards (Rush+Rec)", unit: "YDS", baseId: null, calc: (r) => (r[6] || 0) + (r[8] || 0), defaultTarget: 75000 }
    ],
    MLB: [
      { key: "hr", label: "Home Runs (HR)", unit: "HR", baseId: "mlb_hr", idx: 2, defaultTarget: 2500 },
      { key: "hits", label: "Base Hits (HITS)", unit: "HITS", baseId: "mlb_hits", idx: 3, defaultTarget: 14500 },
      { key: "rbi", label: "Runs Batted In (RBI)", unit: "RBI", baseId: "mlb_rbi", idx: 4, defaultTarget: 8200 },
      { key: "runs", label: "Runs Scored (RUNS)", unit: "RUNS", baseId: "mlb_runs", idx: 5, defaultTarget: 8500 },
      { key: "sb", label: "Stolen Bases (SB)", unit: "SB", baseId: "mlb_sb", idx: 6, defaultTarget: 2600 },
      { key: "so", label: "Pitcher Strikeouts (SO)", unit: "SO", baseId: "mlb_so", idx: 7, defaultTarget: 16000 },
      { key: "wins", label: "Pitcher Wins (W)", unit: "W", baseId: "mlb_wins", idx: 8, defaultTarget: 1400 },
      { key: "sv", label: "Relief Saves (SV)", unit: "SV", baseId: "mlb_saves", idx: 9, defaultTarget: 1800 }
    ]
  };

  const SPORT_TEAMS = {
    NBA: ["ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS"],
    NFL: ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"],
    MLB: ["ARI", "ATL", "BAL", "BOS", "CHC", "CHW", "CIN", "CLE", "COL", "DET", "HOU", "KC", "LAA", "LAD", "MIA", "MIL", "MIN", "NYM", "NYY", "OAK", "PHI", "PIT", "SD", "SEA", "SF", "STL", "TB", "TEX", "TOR", "WAS"]
  };

  // Helper: Get current category object
  function getActiveCategory() {
    if (state.categoryId === "__custom__" && state.customCategory) {
      return state.customCategory;
    }
    return (
      ALL_CATEGORIES.find((c) => c.id === state.categoryId) ||
      DAILY_NICHE_CATEGORIES.find((c) => c.id === state.categoryId) ||
      findHydratedNicheById(state.categoryId) ||
      ALL_CATEGORIES.find((c) => c.sport === state.sport) ||
      ALL_CATEGORIES[0]
    );
  }

  function getCategoryExtraRankMap(cat) {
    if (!cat || !Array.isArray(cat.extraRanks)) return null;
    if (!cat._extraRankMap) {
      const m = new Map();
      const baseRank = (cat.players ? cat.players.length : 150) + 1;
      cat.extraRanks.forEach((pair, idx) => {
        const nk = normalizePlayerKey(pair[0]);
        if (nk && !m.has(nk)) {
          m.set(nk, { rank: baseRank + idx, stat: pair[1] });
        }
      });
      cat._extraRankMap = m;
    }
    return cat._extraRankMap;
  }

  function normalizePlayerKey(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function parseNicheWindowConfig(cat) {
    if (!cat || !cat.id || !window.SEASON_LOGS || !window.SEASON_LOGS[cat.sport]) return null;
    const id = cat.id;
    if (id.indexOf("_w_") === -1) return null;

    const sport = cat.sport;
    const metrics = SPORT_METRICS[sport] || [];
    let m = null;
    if (sport === "MLB") {
      const mlbMap = {
        hitting_homeRuns: "hr",
        hitting_hits: "hits",
        hitting_rbi: "rbi",
        hitting_runs: "runs",
        hitting_stolenBases: "sb",
        pitching_strikeOuts: "so",
        pitching_wins: "wins",
        pitching_saves: "sv"
      };
      const mlbKey = Object.keys(mlbMap).find((k) => id.includes(`_${k}_`) || id.endsWith(`_${k}`));
      if (mlbKey) m = metrics.find((x) => x.key === mlbMap[mlbKey]);
    } else {
      m = metrics.find((x) => id.includes(`_w_${x.key}_`));
    }
    if (!m) return null;

    let timeframe = "since";
    let year = sport === "NFL" ? 2000 : 1996;
    let yearEnd = 2025;
    const rangeM = id.match(/(\d{4})_(\d{4})/);
    const decM = id.match(/(\d{4})s_decade/);
    const sinceM = id.match(/since_(\d{4})/);
    const singleM = id.match(/_(\d{4})$/);

    if (id.includes("1_season_peak")) {
      timeframe = "peak";
    } else if (rangeM) {
      timeframe = "range";
      year = parseInt(rangeM[1], 10);
      yearEnd = parseInt(rangeM[2], 10);
    } else if (decM) {
      timeframe = "range";
      year = parseInt(decM[1], 10);
      yearEnd = year + 9;
    } else if (sinceM) {
      timeframe = "since";
      year = parseInt(sinceM[1], 10);
    } else if (singleM) {
      timeframe = "season";
      year = parseInt(singleM[1], 10);
    }

    let constraint = "none";
    if (id.includes("active_only")) constraint = "active";
    else if (id.includes("retired_only") || id.includes("retired_legends")) constraint = "retired";
    else if (id.includes("anti_chalk") || id.includes("no_top_25")) constraint = "antichalk";
    else if (id.includes("1_team_loyalty")) constraint = "oneteam";
    else if (id.includes("journeymen")) constraint = "journeyman";

    return { sport, metricKey: m.key, timeframe, year, yearEnd, team: "ALL", constraint };
  }

  function getVerifiedWindowFallback(cat) {
    if (!cat || cat._windowFallbackChecked) return cat ? cat._verifiedWindowCat : null;
    cat._windowFallbackChecked = true;
    cat._verifiedWindowCat = null;
    cat._unconstrainedWindowCat = null;
    const cfg = parseNicheWindowConfig(cat);
    if (!cfg || !cat.players || cat.players.length < 3) return null;
    const built = buildDynamicCategory(cfg);
    if (!built || !built.players || built.players.length < 3) return null;
    const matchCount = [0, 1, 2].filter((idx) => {
      const a = cat.players[idx];
      const b = built.players[idx];
      return (
        a &&
        b &&
        normalizePlayerKey(a.name) === normalizePlayerKey(b.name) &&
        Math.abs(a.stat - b.stat) <= Math.max(1, Math.round(a.stat * 0.015))
      );
    }).length;
    if (matchCount >= 2) {
      cat._verifiedWindowCat = built;
      cat._verifiedConstraint = cfg.constraint;
      if (cfg.constraint !== "none") {
        cat._unconstrainedWindowCat = buildDynamicCategory({ ...cfg, constraint: "none" });
      }
    }
    return cat._verifiedWindowCat;
  }

  // Helper: Get a player's career or filtered stat for any category
  function getPlayerStatForCategory(playerName, cat) {
    if (!playerName || !cat) return 0;
    const norm = normalizePlayerKey(playerName);
    const ranked = cat.players.find((p) => normalizePlayerKey(p.name) === norm);
    if (ranked) return ranked.stat;
    const extraMap = getCategoryExtraRankMap(cat);
    if (extraMap && extraMap.has(norm)) {
      return extraMap.get(norm).stat;
    }
    if (cat.customCrossMap && typeof cat.customCrossMap[norm] === "number") {
      return cat.customCrossMap[norm];
    }
    const winCat = getVerifiedWindowFallback(cat);
    if (winCat && winCat.customCrossMap && typeof winCat.customCrossMap[norm] === "number") {
      return winCat.customCrossMap[norm];
    }
    if (window.PLAYER_CROSS_STATS && window.PLAYER_CROSS_STATS[norm]) {
      const val = window.PLAYER_CROSS_STATS[norm][cat.id];
      if (typeof val === "number") return val;
    }
    // Fallback: sum from seasonal logs if base category metric exists
    const metrics = SPORT_METRICS[cat.sport] || [];
    const m = metrics.find((x) => x.baseId === cat.id);
    const sLogs = window.SEASON_LOGS && window.SEASON_LOGS[cat.sport];
    if (m && sLogs) {
      let total = 0;
      Object.keys(sLogs).forEach((yr) => {
        (sLogs[yr] || []).forEach((r) => {
          if (normalizePlayerKey(r[0]) === norm) {
            total += m.calc ? m.calc(r) : (r[m.idx] || 0);
          }
        });
      });
      if (total > 0) return Number.isInteger(total) ? total : Number(total.toFixed(1));
    }
    return 0;
  }

  // Helper: Get a player's exact rank (#1 to #3000+) and stat in the active category
  function getPlayerRankAndStat(playerName, cat) {
    if (!playerName || !cat) return { rank: null, stat: 0, team: "", statKnown: false, maxKnownRank: 100 };
    const maxKnownRank = (cat.players ? cat.players.length : 0) + (Array.isArray(cat.extraRanks) ? cat.extraRanks.length : 0);
    const norm = normalizePlayerKey(playerName);
    const ranked = cat.players.find((p) => normalizePlayerKey(p.name) === norm);
    if (ranked) {
      return { rank: ranked.rank, stat: ranked.stat, team: ranked.team || "", statKnown: true, maxKnownRank };
    }
    const extraMap = getCategoryExtraRankMap(cat);
    if (extraMap && extraMap.has(norm)) {
      const entry = extraMap.get(norm);
      return { rank: entry.rank, stat: entry.stat, team: "", statKnown: true, maxKnownRank };
    }
    if (cat.customRankMap && cat.customRankMap[norm]) {
      return {
        rank: cat.customRankMap[norm],
        stat: (cat.customCrossMap && cat.customCrossMap[norm]) || 0,
        team: "",
        statKnown: true,
        maxKnownRank
      };
    }
    const winCat = getVerifiedWindowFallback(cat);
    if (winCat) {
      if (winCat.customRankMap && winCat.customRankMap[norm]) {
        return {
          rank: winCat.customRankMap[norm],
          stat: (winCat.customCrossMap && winCat.customCrossMap[norm]) || 0,
          team: "",
          statKnown: true,
          maxKnownRank
        };
      }
      if (
        cat._unconstrainedWindowCat &&
        cat._unconstrainedWindowCat.customCrossMap &&
        cat._unconstrainedWindowCat.customCrossMap[norm] > 0
      ) {
        return {
          rank: null,
          stat: 0,
          rawStat: cat._unconstrainedWindowCat.customCrossMap[norm],
          team: "",
          statKnown: true,
          excludedByConstraint: cat._verifiedConstraint,
          maxKnownRank
        };
      }
      return { rank: null, stat: 0, team: "", statKnown: true, maxKnownRank };
    }
    const statVal = getPlayerStatForCategory(playerName, cat);
    if (statVal > 0) {
      const higherSet = new Set();
      cat.players.forEach((p) => {
        if (p.stat > statVal) higherSet.add(normalizePlayerKey(p.name));
      });
      if (window.PLAYER_CROSS_STATS) {
        Object.keys(window.PLAYER_CROSS_STATS).forEach((nk) => {
          const v = window.PLAYER_CROSS_STATS[nk][cat.id];
          if (typeof v === "number" && v > statVal) {
            higherSet.add(nk);
          }
        });
      }
      // Also include seasonal career sums so rank never caps at a leaderboard cutoff
      const metrics = SPORT_METRICS[cat.sport] || [];
      const m = metrics.find((x) => x.baseId === cat.id);
      const sLogs = window.SEASON_LOGS && window.SEASON_LOGS[cat.sport];
      if (m && sLogs) {
        if (!cat._seasonCareerMap) {
          const scMap = new Map();
          Object.keys(sLogs).forEach((yr) => {
            (sLogs[yr] || []).forEach((r) => {
              const nk = normalizePlayerKey(r[0]);
              const v = m.calc ? m.calc(r) : (r[m.idx] || 0);
              if (v > 0) scMap.set(nk, (scMap.get(nk) || 0) + v);
            });
          });
          cat._seasonCareerMap = scMap;
        }
        cat._seasonCareerMap.forEach((tot, nk) => {
          if (tot > statVal) higherSet.add(nk);
        });
      }
      return { rank: higherSet.size + 1, stat: statVal, team: "", statKnown: true, maxKnownRank };
    }
    return { rank: null, stat: null, team: "", statKnown: false, maxKnownRank };
  }

  function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
  }

  function getSportIcon(sport) {
    if (sport === "NBA") return "🏀";
    if (sport === "NFL") return "🏈";
    if (sport === "MLB") return "⚾";
    return "🎯";
  }

  function populateFilterControls(prefix, sport) {
    const statSel = document.getElementById(`${prefix}StatSelect`);
    const teamSel = document.getElementById(`${prefix}TeamSelect`);
    if (!statSel || !teamSel) return;

    const metrics = SPORT_METRICS[sport] || SPORT_METRICS.NBA;
    statSel.innerHTML = metrics
      .map((m) => `<option value="${m.key}">${escapeHtml(m.label)}</option>`)
      .join("");

    const teams = SPORT_TEAMS[sport] || [];
    teamSel.innerHTML =
      `<option value="ALL">🏟️ All Teams</option>` +
      teams.map((t) => `<option value="${t}">🏟️ ${t} Only</option>`).join("");

    updateYearVisibility(prefix, sport);
  }

  function populateExplorerControls(sport) {
    populateFilterControls("explorer", sport);
  }

  function updateYearVisibility(prefix, sport) {
    const tfSel = document.getElementById(`${prefix}TimeframeSelect`);
    const yrField = document.getElementById(`${prefix}YearField`);
    const yrLabel = document.getElementById(`${prefix}YearLabel`);
    const yrSel = document.getElementById(`${prefix}YearSelect`);
    const yrEndField = document.getElementById(`${prefix}YearEndField`);
    const yrEndSel = document.getElementById(`${prefix}YearEndSelect`);
    if (!tfSel || !yrField || !yrSel) return;

    const tf = tfSel.value;
    const minYr = sport === "NFL" ? 2000 : 1996;
    const maxYr = 2025;
    const prevYr = parseInt(yrSel.value, 10);
    const prevEndYr = yrEndSel ? parseInt(yrEndSel.value, 10) : 2019;

    if (tf === "season") {
      yrField.classList.remove("hidden");
      if (yrEndField) yrEndField.classList.add("hidden");
      if (yrLabel) yrLabel.textContent = "Season";
      const targetYr = prevYr >= minYr && prevYr <= maxYr ? prevYr : 2024;
      const opts = [];
      for (let y = maxYr; y >= minYr; y--) {
        const lbl = sport === "NBA" ? `${y}–${String(y + 1).slice(-2)}` : `${y}`;
        opts.push(`<option value="${y}" ${y === targetYr ? "selected" : ""}>${lbl}</option>`);
      }
      yrSel.innerHTML = opts.join("");
    } else if (tf === "since") {
      yrField.classList.remove("hidden");
      if (yrEndField) yrEndField.classList.add("hidden");
      if (yrLabel) yrLabel.textContent = "Since Year";
      const targetYr = prevYr >= minYr && prevYr <= maxYr ? prevYr : 2020;
      const opts = [];
      for (let y = maxYr; y >= minYr; y--) {
        opts.push(`<option value="${y}" ${y === targetYr ? "selected" : ""}>${y}</option>`);
      }
      yrSel.innerHTML = opts.join("");
    } else if (tf === "range") {
      yrField.classList.remove("hidden");
      if (yrEndField) yrEndField.classList.remove("hidden");
      if (yrLabel) yrLabel.textContent = "From Year";
      const startTarget = prevYr >= minYr && prevYr <= maxYr ? prevYr : 2010;
      const endTarget = prevEndYr >= minYr && prevEndYr <= maxYr ? prevEndYr : 2019;
      const startOpts = [];
      const endOpts = [];
      for (let y = maxYr; y >= minYr; y--) {
        startOpts.push(`<option value="${y}" ${y === startTarget ? "selected" : ""}>${y}</option>`);
        endOpts.push(`<option value="${y}" ${y === endTarget ? "selected" : ""}>${y}</option>`);
      }
      yrSel.innerHTML = startOpts.join("");
      if (yrEndSel) yrEndSel.innerHTML = endOpts.join("");
    } else {
      yrField.classList.add("hidden");
      if (yrEndField) yrEndField.classList.add("hidden");
    }
  }

  function buildDynamicCategory(cfg) {
    const sport = cfg.sport || state.sport;
    const metrics = SPORT_METRICS[sport] || SPORT_METRICS.NBA;
    const m = metrics.find((x) => x.key === cfg.metricKey) || metrics[0];
    const tf = cfg.timeframe || "alltime";
    const yrVal = parseInt(cfg.year, 10) || 2020;
    const yrEndVal = parseInt(cfg.yearEnd, 10) || 2025;
    const teamFilter = cfg.team || "ALL";
    const constraint = cfg.constraint || "none";

    // If standard unmodified all-time category exists, return it directly
    if (tf === "alltime" && m.baseId && teamFilter === "ALL" && constraint === "none") {
      const existing = ALL_CATEGORIES.find((c) => c.id === m.baseId);
      if (existing) return existing;
    }

    const activeList = (window.SEASON_LOGS && window.SEASON_LOGS.active && window.SEASON_LOGS.active[sport]) || [];
    const activeSet = new Set(activeList.map((n) => normalizePlayerKey(n)));

    // Build Top 25 Career Chalk Set for Anti-Chalk constraint
    const top25ChalkSet = new Set();
    if (m.baseId) {
      const baseCat = ALL_CATEGORIES.find((c) => c.id === m.baseId);
      if (baseCat) {
        baseCat.players.slice(0, 25).forEach((p) => top25ChalkSet.add(normalizePlayerKey(p.name)));
      }
    }

    // Build player career metadata map from existing categories + seasonal logs
    const metaByNorm = new Map();
    ALL_CATEGORIES.filter((c) => c.sport === sport).forEach((c) => {
      c.players.forEach((p) => {
        const nk = normalizePlayerKey(p.name);
        if (!metaByNorm.has(nk)) {
          metaByNorm.set(nk, { name: p.name, teams: new Set(p.team.split("/").filter(Boolean)), era: p.era });
        }
      });
    });

    const sLogs = (window.SEASON_LOGS && window.SEASON_LOGS[sport]) || {};
    Object.keys(sLogs).forEach((yStr) => {
      (sLogs[yStr] || []).forEach((r) => {
        const nk = normalizePlayerKey(r[0]);
        const tm = r[1];
        if (!metaByNorm.has(nk)) {
          metaByNorm.set(nk, { name: r[0], teams: new Set(), era: `${yStr}` });
        }
        if (tm && tm !== "TOT" && tm !== sport) {
          metaByNorm.get(nk).teams.add(tm);
        }
      });
    });

    let candidates = [];
    const minSportYr = sport === "NFL" ? 2000 : 1996;
    let minYr = minSportYr;
    let maxYr = 2025;
    let aggMode = "sum";

    if (tf === "alltime" && m.baseId) {
      // Pull from official All-Time Career dataset + cross-stats
      const baseCat = ALL_CATEGORIES.find((c) => c.id === m.baseId);
      const valMap = new Map();
      if (baseCat) {
        baseCat.players.forEach((p) => {
          valMap.set(normalizePlayerKey(p.name), { name: p.name, stat: p.stat, team: p.team, era: p.era });
        });
      }
      if (window.PLAYER_CROSS_STATS) {
        Object.keys(window.PLAYER_CROSS_STATS).forEach((nk) => {
          const v = window.PLAYER_CROSS_STATS[nk][m.baseId];
          if (typeof v === "number" && v > 0 && !valMap.has(nk)) {
            const meta = metaByNorm.get(nk);
            if (meta) {
              valMap.set(nk, {
                name: meta.name,
                stat: v,
                team: Array.from(meta.teams).slice(0, 3).join("/") || sport,
                era: meta.era || "Career"
              });
            }
          }
        });
      }
      candidates = Array.from(valMap.entries()).map(([nk, obj]) => {
        const meta = metaByNorm.get(nk);
        const allTeams = meta ? Array.from(meta.teams) : obj.team.split("/");
        return {
          nk,
          name: obj.name,
          stat: obj.stat,
          team: obj.team,
          era: obj.era,
          teamCount: allTeams.length,
          hasTeam: teamFilter === "ALL" || allTeams.includes(teamFilter) || obj.team.split("/").includes(teamFilter)
        };
      });
    } else {
      // Seasonal / Era / Range / Peak aggregation from window.SEASON_LOGS
      if (tf === "season") {
        minYr = yrVal;
        maxYr = yrVal;
      } else if (tf === "since") {
        minYr = yrVal;
        maxYr = 2025;
      } else if (tf === "range") {
        minYr = Math.min(yrVal, yrEndVal);
        maxYr = Math.max(yrVal, yrEndVal);
      } else if (tf === "peak") {
        minYr = minSportYr;
        maxYr = 2025;
        aggMode = "peak";
      }

      const agg = new Map();
      Object.keys(sLogs).forEach((yStr) => {
        const y = parseInt(yStr, 10);
        if (y < minYr || y > maxYr) return;
        (sLogs[yStr] || []).forEach((r) => {
          const pName = r[0];
          const pTeam = r[1] || sport;
          if (teamFilter !== "ALL" && pTeam !== teamFilter) return;
          const val = m.calc ? m.calc(r) : (r[m.idx] || 0);
          if (val <= 0) return;
          const nk = normalizePlayerKey(pName);
          if (!agg.has(nk)) {
            agg.set(nk, {
              nk,
              name: pName,
              stat: 0,
              teams: [],
              minY: y,
              maxY: y,
              peakY: y,
              peakTeam: pTeam
            });
          }
          const d = agg.get(nk);
          if (pTeam && pTeam !== "TOT" && !d.teams.includes(pTeam)) {
            d.teams.push(pTeam);
          }
          d.minY = Math.min(d.minY, y);
          d.maxY = Math.max(d.maxY, y);
          if (aggMode === "peak") {
            if (val > d.stat) {
              d.stat = val;
              d.peakY = y;
              d.peakTeam = pTeam;
            }
          } else {
            d.stat += val;
          }
        });
      });

      if (top25ChalkSet.size === 0) {
        // Fallback top 25 for composite stats like PRA / Scrimmage Yds
        Array.from(agg.values())
          .sort((a, b) => b.stat - a.stat)
          .slice(0, 25)
          .forEach((x) => top25ChalkSet.add(x.nk));
      }

      candidates = Array.from(agg.values()).map((d) => {
        const st = Number.isInteger(d.stat) ? d.stat : Number(d.stat.toFixed(1));
        const era =
          aggMode === "peak"
            ? sport === "NBA"
              ? `${d.peakY}–${String(d.peakY + 1).slice(-2)}`
              : `${d.peakY} Season`
            : minYr === maxYr
            ? sport === "NBA"
              ? `${minYr}–${String(minYr + 1).slice(-2)}`
              : `${minYr} Season`
            : `${d.minY}–${d.maxY}`;
        const teamStr =
          aggMode === "peak"
            ? d.peakTeam
            : d.teams.slice(0, 3).join("/") || sport;
        return {
          nk: d.nk,
          name: d.name,
          stat: st,
          team: teamStr,
          era,
          teamCount: d.teams.length,
          hasTeam: true
        };
      });
    }

    // Apply Team & Player/Bag Constraints
    const filtered = candidates.filter((c) => {
      if (!c.hasTeam) return false;
      if (constraint === "active") return activeSet.has(c.nk);
      if (constraint === "retired") return !activeSet.has(c.nk);
      if (constraint === "antichalk") return !top25ChalkSet.has(c.nk);
      if (constraint === "journeyman") return c.teamCount >= 3;
      if (constraint === "oneteam") return c.teamCount === 1;
      return true;
    });

    filtered.sort((a, b) => b.stat - a.stat);

    const customCrossMap = {};
    const customRankMap = {};
    filtered.forEach((c, idx) => {
      customCrossMap[c.nk] = c.stat;
      customRankMap[c.nk] = idx + 1;
    });

    const playersOut = filtered.slice(0, 150).map((c, i) => ({
      rank: i + 1,
      name: c.name,
      stat: c.stat,
      team: c.team,
      era: c.era
    }));

    // Build descriptive Title, Subtitle & smart Target Goal
    let tfTitle = "All-Time Career";
    if (tf === "season") {
      tfTitle = sport === "NBA" ? `${yrVal}–${String(yrVal + 1).slice(-2)} Season` : `${yrVal} Season`;
    } else if (tf === "since") {
      tfTitle = `Since ${yrVal}`;
    } else if (tf === "range") {
      tfTitle = `${minYr}–${maxYr}`;
    } else if (tf === "peak") {
      tfTitle = `Single-Season Peak`;
    }

    const constraintLabels = {
      none: "",
      active: " • Active Only ⚡",
      retired: " • Legends/Retired 🏛️",
      antichalk: " • Anti-Chalk (No Top 25) 💎",
      journeyman: " • Journeymen (3+ Teams) 🧳",
      oneteam: " • 1-Team Loyalty 🛡️"
    };
    const teamTag = teamFilter !== "ALL" ? ` [${teamFilter} Only]` : "";
    const title = `${sport} ${m.label.replace(/\s*\(.*?\)/, "")}: ${tfTitle}${teamTag}${constraintLabels[constraint] || ""}`;
    const subtitle = `Official ${sport} ${m.label} Leaders • ${tfTitle}${teamFilter !== "ALL" ? ` • Franchise: ${teamFilter}` : ""}${constraintLabels[constraint] || ""}`;

    // Compute smart target score from top 15 eligible players
    const topSample = playersOut.slice(0, Math.min(15, playersOut.length));
    const avgTop =
      topSample.length > 0
        ? topSample.reduce((acc, p) => acc + p.stat, 0) / topSample.length
        : 1000;
    const rawTarget = Math.max(10, Math.round(avgTop * 4.1));
    const roundStep = rawTarget > 50000 ? 5000 : rawTarget > 5000 ? 500 : rawTarget > 500 ? 50 : rawTarget > 100 ? 10 : 5;
    const smartTarget = Math.max(roundStep, Math.round(rawTarget / roundStep) * roundStep);

    return {
      id: "__custom__",
      sport,
      group: "Custom Explorer",
      title,
      subtitle,
      unit: m.unit,
      defaultTarget: smartTarget,
      targetDesc: `Reach ${formatNumber(smartTarget)} combined ${m.unit} in 5 picks without going over!`,
      players: playersOut,
      customCrossMap,
      customRankMap
    };
  }

  function getTierInfo(rank, cutoff) {
    const ratio = rank / cutoff;
    if (rank >= cutoff - 10) {
      return {
        cls: "tier-legendary",
        label: "🔥 ELITE STAT SNIPE!",
        short: "SNIPE"
      };
    }
    if (ratio >= 0.75) {
      return {
        cls: "tier-deep",
        label: "💎 DEEP BAG PULL!",
        short: "DEEP BAG"
      };
    }
    if (ratio >= 0.5) {
      return {
        cls: "tier-solid",
        label: "✅ SOLID PULL!",
        short: "SOLID"
      };
    }
    return {
      cls: "tier-safe",
      label: "🛡️ SAFE PICK",
      short: "SAFE"
    };
  }

  // 4. Initialize or Reset Match
  function startMatch(skipAnalytics = false) {
    stopShotClock();
    const cat = getActiveCategory();
    state.sport = cat.sport;
    document.body.setAttribute("data-sport", state.sport);

    if (!skipAnalytics) {
      trackEvent("puzzle_start", {
        sport: state.sport,
        mode: state.isDaily ? `daily_${state.dailySubmode}` : state.mode,
        is_daily: Boolean(state.isDaily),
        player_count: state.playerCount,
        category_id: cat.id
      });
    }

    state.guessedNames.clear();
    state.revealedRanks.clear();
    state.pickHistory = [];
    state.undoStack = [];
    state.gameOver = false;
    state.boardRevealedPostgame = false;
    state.currentTurnIndex = 0;
    state.activeClueRank = null;
    state.activeClueStage = 0;
    state.seriesRecordedForMatch = false;
    state.previousSeriesSnapshot = null;

    // Build active players array
    state.players = [];
    for (let i = 0; i < state.playerCount; i++) {
      state.players.push({
        id: i,
        name: state.playerNamesConfig[i] || `Player ${i + 1}`,
        score: 0,
        lives: state.maxLives,
        eliminated: false,
        finalRedemptionAvailable: false,
        bestPull: null,
        picks: [],
        sniperShots: [],
        busted: false
      });
    }

    // Hide feedback banner & clue toast
    const fb = document.getElementById("feedbackBanner");
    fb.className = "feedback-banner hidden";
    document.getElementById("clueToast").classList.add("hidden");
    document.getElementById("gameOverModal").classList.add("hidden");

    // Clear search input
    const input = document.getElementById("playerSearchInput");
    input.value = "";
    input.disabled = false;
    document.getElementById("submitGuessBtn").disabled = false;
    hideAutocomplete();

    renderHeaderState();
    renderCategoryBanner();
    renderCouchSeriesBar();
    renderScoreboard();
    renderTurnPrompt();
    renderMainArena();
    renderPickFeed();
    updateUndoButtonState();

    if (state.shotClockSeconds > 0) {
      startShotClock();
    }
  }

  // 5. Render Functions
  function renderHeaderState() {
    document.body.setAttribute("data-sport", state.sport || "NBA");
    document.body.classList.toggle("is-daily-mode", Boolean(state.isDaily));
    const arenaEl = document.getElementById("gameArena");
    if (arenaEl) {
      arenaEl.classList.toggle("daily-layout", Boolean(state.isDaily));
    }
    const searchInputEl = document.getElementById("playerSearchInput");
    if (searchInputEl) {
      searchInputEl.placeholder = `Search ${state.sport || "NBA"} player...`;
    }

    // Sport buttons
    document.querySelectorAll(".sport-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sport === state.sport);
    });

    // Mode tabs
    const setupOpen = !document.getElementById("customSetupPanel").classList.contains("hidden");
    document.getElementById("tabTop100").classList.toggle("active", !setupOpen && !state.isDaily && state.mode === "top100");
    document.getElementById("tabTarget").classList.toggle("active", !setupOpen && !state.isDaily && state.mode === "target");
    document.getElementById("tabDaily").classList.toggle("active", !setupOpen && state.isDaily);
    document.getElementById("tabCustom").classList.toggle("active", setupOpen);

    // Daily Challenge bar
    const dailyBar = document.getElementById("dailyChallengeBar");
    if (state.isDaily) {
      dailyBar.classList.remove("hidden");
      renderDailyBar();
    } else {
      dailyBar.classList.add("hidden");
    }

    // Protect in-progress Official Daily from accidental New Match reset
    const newBtn = document.getElementById("newGameQuickBtn");
    if (newBtn) {
      if (state.isDaily) {
        newBtn.classList.toggle("hidden", !state.gameOver && !state.dailyPracticeReplay);
        newBtn.innerHTML = "<span>🔄 Replay</span>";
      } else {
        newBtn.classList.remove("hidden");
        newBtn.innerHTML = "<span>🔄 New Match</span>";
      }
    }
  }

  function renderCategoryBanner() {
    const cat = getActiveCategory();
    document.getElementById("activeSportPill").textContent = `${getSportIcon(cat.sport)} ${cat.sport}`;
    document.getElementById("activeCategoryTitle").textContent = cat.title;
    const subEl = document.getElementById("activeCategorySubtitle");
    if (subEl) {
      subEl.textContent = cat.subtitle;
      const keepSubInDaily = !state.isDaily || /\bmin(?:imum)?\b/i.test(cat.subtitle || "");
      subEl.classList.toggle("hidden", !keepSubInDaily);
    }

    const expBar = document.getElementById("constraintExplorerBar");
    if (expBar) {
      expBar.classList.toggle("hidden", state.isDaily);
    }
    const actionPills = document.getElementById("bannerActionPills");
    if (actionPills) {
      const mysBtn = document.getElementById("mysteryBagBtn");
      const shareBtn = document.getElementById("shareChallengeLinkBtn");
      const mobFilterBtn = document.getElementById("mobileFilterToggleBtn");
      if (mysBtn) mysBtn.classList.toggle("hidden", state.isDaily);
      if (shareBtn) shareBtn.classList.toggle("hidden", state.isDaily);
      if (mobFilterBtn) mobFilterBtn.classList.toggle("hidden", state.isDaily);
    }

    const endRevealBtn = document.getElementById("endRevealBtn");
    if (endRevealBtn) {
      endRevealBtn.classList.remove("armed-danger");
      endRevealBtn.removeAttribute("data-armed");
      if (state.isDaily && !state.dailyPracticeReplay && !state.gameOver) {
        endRevealBtn.textContent = "🏳️ Give Up";
        endRevealBtn.classList.toggle("hidden", state.mode !== "top100");
      } else if (state.isDaily) {
        endRevealBtn.textContent = "👁️ Reveal All 100";
        endRevealBtn.classList.toggle("hidden", state.mode !== "top100" || state.boardRevealedPostgame);
      } else {
        endRevealBtn.textContent = "👁️ Reveal Board";
        endRevealBtn.classList.toggle("hidden", state.mode !== "top100");
      }
    }

    const rulePillEl = document.getElementById("activeRulePill");
    if (state.mode === "top100") {
      const redMin = Math.max(1, state.cutoff - 10);
      document.getElementById("activeModePill").textContent = state.isDaily
        ? `🎯 5-SHOT SNIPER${state.dailyPracticeReplay ? " (PRACTICE)" : ""}`
        : `TOP ${state.cutoff} SURVIVAL`;
      if (rulePillEl) {
        rulePillEl.classList.toggle("hidden", state.isDaily);
        rulePillEl.textContent = `Rank #${state.cutoff} = ${state.cutoff} PTS • ${state.maxLives} ${state.maxLives === 1 ? "Life" : "Lives"}${state.redemptionEnabled ? ` • 🐦‍🔥 #${redMin}-${state.cutoff} Revive` : ""}`;
      }
      document.getElementById("bannerStatSummary").classList.toggle("hidden", state.isDaily);
      document.getElementById("boardFoundCount").textContent = `${state.revealedRanks.size} / ${state.cutoff}`;
      document.getElementById("cutoffRankLabel").textContent = `#${state.cutoff}`;
      document.getElementById("getClueBtn").classList.toggle("hidden", state.isDaily);
      const redBtn = document.getElementById("toggleRedemptionQuickBtn");
      if (redBtn) {
        redBtn.classList.toggle("hidden", state.isDaily);
        redBtn.textContent = `🐦‍🔥 ${redMin}–${state.cutoff} Redemption: ${state.redemptionEnabled ? "ON" : "OFF"}`;
        redBtn.classList.toggle("active-redemption-chip", state.redemptionEnabled);
      }
      const missRankBtn = document.getElementById("toggleShowMissRankBtn");
      if (missRankBtn) {
        missRankBtn.classList.toggle("hidden", state.isDaily);
        missRankBtn.textContent = `📊 Show ${state.cutoff + 1}+ Rank: ${state.showMissRank ? "ON" : "OFF"}`;
        missRankBtn.classList.toggle("active-redemption-chip", state.showMissRank);
      }
    } else {
      document.getElementById("activeModePill").textContent = state.isDaily
        ? `⚡ TARGET STAT${state.dailyPracticeReplay ? " (PRACTICE)" : ""}`
        : "TARGET SCORE";
      if (rulePillEl) {
        rulePillEl.classList.toggle("hidden", state.isDaily);
        rulePillEl.textContent = `Target: ${formatNumber(state.targetGoal)} ${cat.unit} • ${state.maxPicks} Picks • Don't Bust`;
      }
      document.getElementById("bannerStatSummary").classList.add("hidden");
      document.getElementById("getClueBtn").classList.add("hidden");
      const redBtn = document.getElementById("toggleRedemptionQuickBtn");
      if (redBtn) redBtn.classList.add("hidden");
      const missRankBtn = document.getElementById("toggleShowMissRankBtn");
      if (missRankBtn) missRankBtn.classList.add("hidden");
    }
  }

  function getSniperGrade(score) {
    if (score >= 435) return { grade: "S+", label: "GOAT DEEP BAG 🐐" };
    if (score >= 380) return { grade: "S", label: "SNIPE MASTER 🔥" };
    if (score >= 320) return { grade: "A", label: "ELITE SNIPER 💎" };
    if (score >= 250) return { grade: "B", label: "SOLID BAG ✅" };
    if (score >= 160) return { grade: "C", label: "SAFE CHALK 🛡️" };
    return { grade: "D", label: "ROOKIE BAG 📋" };
  }

  function renderScoreboard() {
    const strip = document.getElementById("scoreboardStrip");
    const cat = getActiveCategory();
    if (state.isDaily && state.dailySubmode === "target") {
      strip.classList.add("hidden");
      strip.innerHTML = "";
      return;
    }
    strip.classList.remove("hidden");
    strip.classList.toggle("single-player-strip", state.isDaily || state.playerCount === 1);

    // Special 5-Shot Sniper Rack for Daily 5-Shot Sniper Mode!
    if (state.isDaily && state.dailySubmode === "sniper" && state.players[0]) {
      const p = state.players[0];
      const shots = p.sniperShots || [];
      const gInfo = getSniperGrade(p.score);
      const slotsHtml = [];
      for (let i = 0; i < state.dailyMaxShots; i++) {
        const sh = shots[i];
        const isCurrent = !state.gameOver && i === shots.length;
        if (sh) {
          const slotCls = !sh.hit
            ? "filled-strike"
            : sh.rank >= 90
            ? "filled-legend"
            : sh.rank >= 75
            ? "filled-deep"
            : "filled-hit";
          const badgeEmoji = sh.hit
            ? sh.rank >= 90
              ? `🔥 #${sh.rank}`
              : sh.rank >= 75
              ? `💎 #${sh.rank}`
              : `✅ #${sh.rank}`
            : sh.rank
            ? `💔 #${sh.rank}`
            : sh.excludedByConstraint
            ? `🚫 OUT`
            : `💔 MISS`;
          const hasStat = typeof sh.stat === "number" && (sh.statKnown === true || sh.hit || sh.rank || sh.stat > 0);
          const statText = sh.hit
            ? `${formatNumber(sh.stat)} ${cat.unit}`
            : sh.excludedByConstraint && sh.rawStat > 0
            ? `${formatNumber(sh.rawStat)} ${cat.unit}`
            : hasStat
            ? `${formatNumber(sh.stat)} ${cat.unit}`
            : `Not in Top ${sh.maxKnownRank || 360}`;
          const statColor = sh.hit ? "var(--sport-secondary)" : hasStat || sh.rawStat > 0 ? "#fca5a5" : "var(--text-secondary)";
          const ptsChip = sh.hit ? `+${sh.pts} pts` : `0 pts`;
          slotsHtml.push(`
            <div class="sniper-slot ${slotCls}">
              <div class="ss-top">
                <span>SHOT #${i + 1}</span>
                <span>${badgeEmoji}</span>
              </div>
              <div class="ss-player" title="${escapeHtml(sh.name)}">${escapeHtml(sh.name)}</div>
              <div class="ss-stat-row">
                <span class="ss-stat" style="color:${statColor}">${statText}</span>
                <span class="ss-pts-chip ${sh.hit ? "hit" : "miss"}">${ptsChip}</span>
              </div>
            </div>
          `);
        } else {
          slotsHtml.push(`
            <div class="sniper-slot ${isCurrent ? "active-shot" : ""}">
              <div class="ss-top">
                <span>SHOT #${i + 1}</span>
                <span>${isCurrent ? "🎯 UP NOW" : "🔒"}</span>
              </div>
              <div class="ss-player" style="color:var(--text-muted);font-weight:600;">
                ${isCurrent ? "Hunt #90–#100..." : "Empty Slot"}
              </div>
              <div class="ss-pts" style="color:var(--text-muted);">Max +100 PTS</div>
            </div>
          `);
        }
      }

      strip.innerHTML = `
        <div class="daily-sniper-card">
          <div class="sniper-header-row">
            <span class="sniper-grade-label">
              Grade: <strong>${gInfo.grade} (${gInfo.label})</strong>
            </span>
            <div class="sniper-score-big">
              ${formatNumber(p.score)} <span class="sniper-score-max">/ 490 PTS</span>
            </div>
          </div>
          <div class="sniper-slots-grid">
            ${slotsHtml.join("")}
          </div>
        </div>
      `;
      return;
    }

    strip.innerHTML = state.players
      .map((p, idx) => {
        const isTurn = !state.gameOver && idx === state.currentTurnIndex;
        const cardClasses = [
          "player-score-card",
          isTurn ? "active-turn" : "",
          p.eliminated ? "eliminated" : ""
        ]
          .filter(Boolean)
          .join(" ");

        if (state.mode === "top100") {
          const heartSlots = Math.max(state.maxLives, p.lives);
          const hearts = [];
          for (let h = 0; h < heartSlots; h++) {
            hearts.push(h < p.lives ? "❤️" : "💔");
          }
          const bestText = p.bestPull
            ? `Best: #${p.bestPull.rank} ${p.bestPull.name} (+${p.bestPull.rank})`
            : "Best Pull: —";

          return `
            <div class="${cardClasses}">
              <div class="psc-top">
                <div class="psc-name-wrap">
                  <span class="p-badge p-${idx + 1}">P${idx + 1}</span>
                  <span class="psc-name">${escapeHtml(p.name)}</span>
                </div>
                ${
                  p.eliminated && isTurn && state.redemptionEnabled
                    ? `<span class="psc-redemption-badge">🐦‍🔥 REDEMPTION</span>`
                    : p.eliminated
                    ? `<span class="psc-out-badge">${state.redemptionEnabled ? "0 ❤️ (REVIVABLE)" : "OUT"}</span>`
                    : isTurn
                    ? `<span class="psc-turn-badge">UP NOW</span>`
                    : ""
                }
              </div>
              <div class="psc-mid">
                <div>
                  <span class="psc-points">${formatNumber(p.score)}</span>
                  <span class="psc-points-unit">PTS</span>
                </div>
                <div class="psc-lives-wrap">
                  <div class="psc-lives" title="${p.lives} lives remaining">${hearts.join("")}</div>
                  <button type="button" class="give-life-btn" data-grantlife="${idx}" title="Give +1 Life back to ${escapeHtml(p.name)} (or revive if eliminated)">+❤️</button>
                </div>
              </div>
              <div class="psc-bottom">
                <span class="psc-best">${escapeHtml(bestText)}</span>
                <span>${p.picks.length} Picks</span>
              </div>
            </div>
          `;
        } else {
          // Target Mode Scoreboard Card
          const diff = state.targetGoal - p.score;
          const statusLabel = p.busted
            ? "💥 BUSTED"
            : `${formatNumber(Math.abs(diff))} ${diff >= 0 ? "under" : "over"}`;
          return `
            <div class="${cardClasses}">
              <div class="psc-top">
                <div class="psc-name-wrap">
                  <span class="p-badge p-${idx + 1}">P${idx + 1}</span>
                  <span class="psc-name">${escapeHtml(p.name)}</span>
                </div>
                ${
                  p.eliminated
                    ? `<span class="psc-out-badge">DONE</span>`
                    : isTurn
                    ? `<span class="psc-turn-badge">DRAFTING</span>`
                    : ""
                }
              </div>
              <div class="psc-mid">
                <div>
                  <span class="psc-points">${formatNumber(p.score)}</span>
                  <span class="psc-points-unit">${cat.unit}</span>
                </div>
                <div style="font-size:0.8rem;font-weight:700;color:${p.busted ? "#f87171" : "#34d399"}">
                  ${statusLabel}
                </div>
              </div>
              <div class="psc-bottom">
                <span>Target: ${formatNumber(state.targetGoal)}</span>
                <span>Picks: ${p.picks.length} / ${state.maxPicks}</span>
              </div>
            </div>
          `;
        }
      })
      .join("");

    strip.querySelectorAll(".give-life-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pIdx = parseInt(btn.getAttribute("data-grantlife"), 10);
        grantLifeToPlayer(pIdx);
      });
    });
  }

  function pushUndoSnapshot(actionLabel) {
    state.undoStack.push({
      actionLabel: actionLabel || "Last Guess",
      players: JSON.parse(JSON.stringify(state.players)),
      guessedNames: new Set(state.guessedNames),
      revealedRanks: new Map(state.revealedRanks),
      pickHistory: JSON.parse(JSON.stringify(state.pickHistory)),
      currentTurnIndex: state.currentTurnIndex,
      gameOver: state.gameOver,
      boardRevealedPostgame: state.boardRevealedPostgame
    });
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    const canUndo = !state.isDaily || state.dailyPracticeReplay;
    const hasUndo = canUndo && state.undoStack && state.undoStack.length > 0;
    const undoBtn = document.getElementById("undoGuessBtn");
    if (undoBtn) {
      undoBtn.classList.toggle("hidden", !canUndo);
      undoBtn.disabled = !hasUndo;
    }
    const undoModalBtn = document.getElementById("undoLastModalBtn");
    if (undoModalBtn) {
      undoModalBtn.classList.toggle("hidden", !hasUndo);
    }
  }

  function undoLastAction() {
    if (state.isDaily && !state.dailyPracticeReplay) return;
    if (!state.undoStack || state.undoStack.length === 0) return;
    stopShotClock();
    const snap = state.undoStack.pop();
    state.players = snap.players;
    state.guessedNames = new Set(snap.guessedNames);
    state.revealedRanks = new Map(snap.revealedRanks);
    state.pickHistory = snap.pickHistory;
    state.currentTurnIndex = snap.currentTurnIndex;
    state.gameOver = snap.gameOver;
    state.boardRevealedPostgame = snap.boardRevealedPostgame;

    const input = document.getElementById("playerSearchInput");
    const submitBtn = document.getElementById("submitGuessBtn");
    if (!state.gameOver) {
      if (input) input.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
      document.getElementById("gameOverModal").classList.add("hidden");
      if (state.seriesRecordedForMatch && state.previousSeriesSnapshot) {
        saveCouchSeries(state.previousSeriesSnapshot);
        state.seriesRecordedForMatch = false;
        state.previousSeriesSnapshot = null;
      }
    }

    sfx.playSafeHit();
    showFeedbackBanner({
      tierClass: "tier-safe",
      rankBadge: "↩️",
      title: `UNDID LAST GUESS: ${snap.actionLabel}`,
      subtitle: `Restored turn, lives & score back to ${state.players[state.currentTurnIndex].name}!`,
      pointsText: "RESTORED"
    });

    renderCategoryBanner();
    renderCouchSeriesBar();
    renderScoreboard();
    renderTurnPrompt();
    renderMainArena();
    renderPickFeed();
    updateUndoButtonState();

    if (state.shotClockSeconds > 0 && !state.gameOver) {
      startShotClock();
    }
  }

  function grantLifeToPlayer(playerIdx) {
    const p = state.players[playerIdx];
    if (!p) return;
    pushUndoSnapshot(`+1 Life to ${p.name}`);
    p.lives += 1;
    if (p.eliminated) {
      p.eliminated = false;
      p.finalRedemptionAvailable = false;
    }
    if (state.gameOver) {
      state.gameOver = false;
      state.boardRevealedPostgame = false;
      state.currentTurnIndex = playerIdx;
      document.getElementById("playerSearchInput").disabled = false;
      document.getElementById("submitGuessBtn").disabled = false;
      document.getElementById("gameOverModal").classList.add("hidden");
      if (state.seriesRecordedForMatch && state.previousSeriesSnapshot) {
        saveCouchSeries(state.previousSeriesSnapshot);
        state.seriesRecordedForMatch = false;
        state.previousSeriesSnapshot = null;
      }
    }
    sfx.playSafeHit();
    showFeedbackBanner({
      tierClass: "tier-solid",
      rankBadge: "+❤️",
      title: `RESTORED +1 LIFE TO ${p.name}!`,
      subtitle: `${p.name} now has ${p.lives} ${p.lives === 1 ? "life" : "lives"} remaining.`,
      pointsText: "+1 ❤️"
    });
    renderCouchSeriesBar();
    renderScoreboard();
    renderTurnPrompt();
    renderMainArena();
    updateUndoButtonState();
  }

  function renderTurnPrompt() {
    const promptEl = document.getElementById("currentTurnPrompt");
    const searchWrap = document.getElementById("searchBoxWrapper");
    const cmdSec = document.getElementById("commandCenterSection");
    const hideDailySearch = Boolean(state.isDaily && state.gameOver);
    if (searchWrap) searchWrap.classList.toggle("hidden", hideDailySearch);
    if (cmdSec) cmdSec.classList.toggle("is-complete-compact", hideDailySearch);

    if (state.gameOver) {
      if (state.isDaily) {
        promptEl.innerHTML = `
          <strong>✅ Daily Complete!</strong>
          <span class="prompt-inline-actions">
            <button type="button" class="prompt-inline-btn" id="promptShareScoreBtn">📲 Share Score</button>
            <button type="button" class="prompt-inline-btn secondary" id="promptOpenModalBtn">📊 Summary</button>
          </span>
        `;
      } else {
        promptEl.innerHTML = `
          <strong>Match Complete!</strong> — Share your result, inspect the board below, or start a new match.
          <span class="prompt-inline-actions">
            <button type="button" class="prompt-inline-btn" id="promptShareScoreBtn">📲 Share Result</button>
            <button type="button" class="prompt-inline-btn secondary" id="promptOpenModalBtn">📊 Summary</button>
          </span>
        `;
      }
      const pShare = document.getElementById("promptShareScoreBtn");
      if (pShare) {
        pShare.addEventListener("click", (e) => copyCurrentResultText(e.currentTarget));
      }
      const pModal = document.getElementById("promptOpenModalBtn");
      if (pModal) {
        pModal.addEventListener("click", () => {
          document.getElementById("gameOverModal").classList.remove("hidden");
        });
      }
      return;
    }
    const activePlayer = state.players[state.currentTurnIndex];
    if (!activePlayer) return;

    if (state.mode === "top100") {
      if (state.isDaily && state.dailySubmode === "sniper") {
        const shotNum = Math.min(state.dailyMaxShots, (activePlayer.sniperShots ? activePlayer.sniperShots.length : 0) + 1);
        promptEl.innerHTML = `🎯 <strong>Shot ${shotNum} of ${state.dailyMaxShots}</strong> • Hunt #90–#100`;
      } else if (activePlayer.eliminated && state.redemptionEnabled) {
        const redMin = Math.max(1, state.cutoff - 10);
        promptEl.innerHTML = `🐦‍🔥 <strong>${escapeHtml(activePlayer.name)}'s REDEMPTION SHOT!</strong> — Eliminated! Snipe a player ranked <strong>#${redMin}–#${state.cutoff}</strong> to earn <strong>1 Life ❤️ back + those points!</strong>`;
      } else {
        promptEl.innerHTML = `<strong>${escapeHtml(activePlayer.name)}'s Turn</strong> — Snipe a player in the Top ${state.cutoff} (#${state.cutoff} = ${state.cutoff} pts)!`;
      }
    } else {
      const cat = getActiveCategory();
      const remaining = state.targetGoal - activePlayer.score;
      if (state.isDaily) {
        promptEl.innerHTML = `⚡ <strong>Pick ${activePlayer.picks.length + 1} of ${state.maxPicks}</strong> — Need <strong>${formatNumber(Math.max(0, remaining))} ${cat.unit}</strong>`;
      } else {
        promptEl.innerHTML = `<strong>${escapeHtml(activePlayer.name)}'s Pick (${activePlayer.picks.length + 1}/${state.maxPicks})</strong> — Need <strong>${formatNumber(Math.max(0, remaining))} ${cat.unit}</strong> to hit target!`;
      }
    }
  }

  function renderMainArena() {
    const splitSection = document.getElementById("arenaSplitSection");
    const feedSidebar = document.getElementById("pickFeedSidebar");
    const top100Panel = document.getElementById("top100BoardPanel");
    const targetPanel = document.getElementById("targetScorePanel");

    const hideDailyFeed = state.isDaily;
    const hideSniperBoard = state.isDaily && state.dailySubmode === "sniper" && !state.boardRevealedPostgame;

    if (feedSidebar) {
      feedSidebar.classList.toggle("hidden", hideDailyFeed);
    }
    if (splitSection) {
      splitSection.classList.toggle("single-col", hideDailyFeed);
      splitSection.classList.toggle("hidden", hideSniperBoard && state.mode === "top100");
    }

    if (state.mode === "top100") {
      top100Panel.classList.toggle("hidden", hideSniperBoard);
      targetPanel.classList.add("hidden");
      if (!hideSniperBoard) {
        renderTop100Board();
      }
    } else {
      top100Panel.classList.add("hidden");
      targetPanel.classList.remove("hidden");
      renderTargetArena();
    }
  }

  function renderTop100Board() {
    const cat = getActiveCategory();
    document.getElementById("boardHeaderCutoff").textContent = state.cutoff;
    document.getElementById("boardFoundCount").textContent = `${state.revealedRanks.size} / ${state.cutoff}`;

    const toggleCluesBtn = document.getElementById("toggleBoardCluesBtn");
    toggleCluesBtn.textContent = `🔍 Team Clues: ${state.boardHints ? "On" : "Off"}`;
    toggleCluesBtn.classList.toggle("active", state.boardHints);

    const grid = document.getElementById("top100Grid");
    const list = cat.players.filter((p) => p.rank <= state.cutoff);

    const filtered = list.filter((p) => {
      if (state.boardFilter === "found") return state.revealedRanks.has(p.rank);
      if (state.boardFilter === "1-50") return p.rank >= 1 && p.rank <= 50;
      if (state.boardFilter === "51-100") return p.rank >= 51 && p.rank <= 100;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--text-muted);">No players revealed in this filter yet!</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((p) => {
        const revealedInfo = state.revealedRanks.get(p.rank);
        const isRevealed = Boolean(revealedInfo) || state.boardRevealedPostgame;
        const tier = getTierInfo(p.rank, state.cutoff);

        if (isRevealed) {
          const postgameClass = !revealedInfo && state.boardRevealedPostgame ? "postgame-reveal" : "";
          const pickedByTag = revealedInfo ? ` • P${revealedInfo.pickedBy + 1}` : "";
          return `
            <div class="rank-tile revealed ${tier.cls} ${postgameClass}">
              <span class="rt-num">#${p.rank}</span>
              <div class="rt-body">
                <div class="rt-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
                <div class="rt-stat">${formatNumber(p.stat)} ${cat.unit}${pickedByTag}</div>
              </div>
            </div>
          `;
        } else {
          const clueHtml = state.boardHints
            ? `<div class="rt-clue">${escapeHtml(p.team)} (${escapeHtml(p.era)})</div>`
            : `<div class="rt-clue">• • •</div>`;
          return `
            <div class="rank-tile locked">
              <span class="rt-num">#${p.rank}</span>
              <div class="rt-body">
                ${clueHtml}
              </div>
            </div>
          `;
        }
      })
      .join("");
  }

  function renderTargetArena() {
    const cat = getActiveCategory();
    document.getElementById("targetGoalDisplay").textContent = `${formatNumber(state.targetGoal)} ${cat.unit}`;
    const targetRuleEl = document.getElementById("targetRuleExplanation");
    if (targetRuleEl) {
      targetRuleEl.classList.toggle("hidden", Boolean(state.isDaily));
      targetRuleEl.textContent =
        state.bustRule === "bust"
          ? `Draft ${state.maxPicks} players to get as close to ${formatNumber(state.targetGoal)} ${cat.unit} as possible WITHOUT going over!`
          : `Draft ${state.maxPicks} players to get as close to ${formatNumber(state.targetGoal)} ${cat.unit} as possible (over or under allowed)!`;
    }

    const container = document.getElementById("targetPlayersContainer");
    container.innerHTML = state.players
      .map((p, idx) => {
        const pct = Math.min(100, Math.round((p.score / state.targetGoal) * 100));
        const slotsHtml = [];
        for (let s = 0; s < state.maxPicks; s++) {
          const pick = p.picks[s];
          if (pick) {
            slotsHtml.push(`
              <div class="tpb-slot filled ${pick.bustedPick ? "busted" : ""}">
                <div style="font-weight:700;font-size:0.82rem;">${escapeHtml(pick.name)}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:${pick.bustedPick ? "#fca5a5" : "var(--sport-secondary)"};">
                  ${pick.bustedPick ? `${formatNumber(pick.stat)} ${cat.unit} (BUST 💥)` : `+${formatNumber(pick.stat)} ${cat.unit}`}
                </div>
              </div>
            `);
          } else {
            slotsHtml.push(`
              <div class="tpb-slot">
                <div style="font-size:0.75rem;color:var(--text-muted);">Pick #${s + 1}</div>
              </div>
            `);
          }
        }

        const headerLeft = state.isDaily
          ? `<strong>5-Pick Progress</strong>`
          : `<span class="p-badge p-${idx + 1}">P${idx + 1}</span> <strong>${escapeHtml(p.name)}</strong>`;

        return `
          <div class="target-player-box">
            <div class="tpb-header">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                ${headerLeft}
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-weight:800;">
                ${formatNumber(p.score)} / ${formatNumber(state.targetGoal)} ${cat.unit} (${pct}%)
              </div>
            </div>
            <div class="tpb-progress-track">
              <div class="tpb-progress-fill ${p.busted ? "busted" : ""}" style="width:${pct}%"></div>
            </div>
            <div class="tpb-slots">
              ${slotsHtml.join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderPickFeed() {
    const feed = document.getElementById("pickFeedList");
    document.getElementById("totalPicksBadge").textContent = `${state.pickHistory.length} ${state.pickHistory.length === 1 ? "Pick" : "Picks"}`;

    if (state.pickHistory.length === 0) {
      feed.innerHTML = `
        <div class="empty-feed-state">
          <div class="empty-icon">🎯</div>
          <p>No players locked in yet! Search for a player above to start sniping.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = state.pickHistory
      .map((item) => {
        return `
          <div class="feed-item ${item.tierClass}">
            <div class="fi-left">
              <div class="fi-player">${escapeHtml(item.playerName)}</div>
              <div class="fi-meta">${escapeHtml(item.pickerName)} • ${escapeHtml(item.subtitle)}</div>
            </div>
            <div class="fi-right">
              <div class="fi-pts">${escapeHtml(item.pointsLabel)}</div>
              <div class="fi-rank">${escapeHtml(item.rankLabel)}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // 6. Guess Submission & Evaluation Logic
  function handleGuessSubmission(rawName) {
    if (state.gameOver) return;
    const query = (rawName || "").trim();
    if (!query) return;

    const cat = getActiveCategory();
    const normQuery = query.toLowerCase();

    // Check if already guessed
    if (state.guessedNames.has(normQuery)) {
      showFeedbackBanner({
        tierClass: "tier-safe",
        rankBadge: "⚠️",
        title: `${query} was already guessed!`,
        subtitle: "Pick a different player — your turn is still active.",
        pointsText: "TRY AGAIN"
      });
      return;
    }

    // Find exact or best match in current category's player list
    let matchedCatPlayer = cat.players.find((p) => p.name.toLowerCase() === normQuery);

    // Also check if user typed a partial name that uniquely matches top autocomplete suggestion
    if (!matchedCatPlayer && state.acMatches.length > 0) {
      const exactAc = state.acMatches.find((m) => m.name.toLowerCase() === normQuery);
      const chosenAc = exactAc || state.acMatches[Math.max(0, state.acHighlightIndex)];
      if (chosenAc) {
        const chosenNorm = chosenAc.name.toLowerCase();
        if (state.guessedNames.has(chosenNorm)) {
          showFeedbackBanner({
            tierClass: "tier-safe",
            rankBadge: "⚠️",
            title: `${chosenAc.name} was already guessed!`,
            subtitle: "Pick a different player — your turn is still active.",
            pointsText: "TRY AGAIN"
          });
          return;
        }
        matchedCatPlayer = cat.players.find((p) => p.name.toLowerCase() === chosenNorm);
        // Use canonical name from directory
        rawName = chosenAc.name;
      }
    } else if (matchedCatPlayer) {
      rawName = matchedCatPlayer.name;
    }

    const canonicalNorm = rawName.trim().toLowerCase();

    // Save undo snapshot before mutating state
    pushUndoSnapshot(rawName.trim());

    state.guessedNames.add(canonicalNorm);

    // Clear input
    const input = document.getElementById("playerSearchInput");
    input.value = "";
    hideAutocomplete();

    const activePlayer = state.players[state.currentTurnIndex];

    if (state.mode === "top100") {
      evaluateTop100Pick(activePlayer, rawName.trim(), matchedCatPlayer, cat);
    } else {
      evaluateTargetPick(activePlayer, rawName.trim(), matchedCatPlayer, cat);
    }
  }

  function evaluateTop100Pick(activePlayer, displayName, matchedCatPlayer, cat) {
    const redMin = Math.max(1, state.cutoff - 10);

    // Special evaluation for Daily 5-Shot Sniper Mode (5 Shots total, max 490 pts)
    if (state.isDaily && state.dailySubmode === "sniper") {
      if (!activePlayer.sniperShots) activePlayer.sniperShots = [];
      const shotNum = activePlayer.sniperShots.length + 1;

      if (matchedCatPlayer && matchedCatPlayer.rank <= state.cutoff) {
        const rank = matchedCatPlayer.rank;
        const pts = rank;
        activePlayer.score += pts;
        activePlayer.picks.push(matchedCatPlayer);
        if (!activePlayer.bestPull || rank > activePlayer.bestPull.rank) {
          activePlayer.bestPull = matchedCatPlayer;
        }
        state.revealedRanks.set(rank, {
          playerObj: matchedCatPlayer,
          pickedBy: activePlayer.id
        });
        const tier = getTierInfo(rank, state.cutoff);
        if (tier.cls === "tier-legendary") {
          sfx.playPinpointLegend();
        } else if (tier.cls === "tier-deep") {
          sfx.playDeepPull();
        } else {
          sfx.playSafeHit();
        }

        activePlayer.sniperShots.push({
          shotNum,
          name: matchedCatPlayer.name,
          rank,
          stat: matchedCatPlayer.stat,
          statKnown: true,
          pts,
          hit: true,
          tier: tier.cls
        });

        showFeedbackBanner({
          tierClass: tier.cls,
          rankBadge: `#${rank}`,
          title: `SHOT ${shotNum}/${state.dailyMaxShots}: ${tier.label} — ${matchedCatPlayer.name}`,
          subtitle: `Ranked #${rank} (${matchedCatPlayer.team}) • Earned +${pts} PTS`,
          pointsText: `${formatNumber(matchedCatPlayer.stat)} ${cat.unit}`,
          pointsSubText: `+${pts} PTS`
        });

        state.pickHistory.unshift({
          playerName: matchedCatPlayer.name,
          pickerName: `Shot #${shotNum}`,
          subtitle: `${formatNumber(matchedCatPlayer.stat)} ${cat.unit} • ${tier.short}`,
          pointsLabel: `${formatNumber(matchedCatPlayer.stat)} ${cat.unit} (+${pts})`,
          rankLabel: `Rank #${rank}`,
          tierClass: tier.cls
        });
      } else {
        sfx.playStrike();
        const missInfo = getPlayerRankAndStat(displayName, cat);
        const cut100 = cat.players && cat.players[Math.min(state.cutoff - 1, cat.players.length - 1)];
        const cut100Text = cut100 ? `#100 cut: ${formatNumber(cut100.stat)} ${cat.unit}` : `Outside Top ${state.cutoff}`;
        const constraintNames = {
          active: "Active Only",
          retired: "Retired Only",
          antichalk: "Anti-Chalk (No Top 25)",
          oneteam: "1-Team Loyalty",
          journeyman: "3+ Teams Only"
        };

        activePlayer.sniperShots.push({
          shotNum,
          name: displayName,
          rank: missInfo.rank,
          stat: missInfo.statKnown ? missInfo.stat : null,
          rawStat: missInfo.rawStat || 0,
          statKnown: Boolean(missInfo.statKnown),
          excludedByConstraint: missInfo.excludedByConstraint || "",
          maxKnownRank: missInfo.maxKnownRank || 360,
          pts: 0,
          hit: false,
          tier: "tier-strike"
        });

        let badgeTxt = "💔";
        let fbTitle = `SHOT ${shotNum}/${state.dailyMaxShots}: MISS — ${displayName}`;
        let subText = "";
        let statBannerText = "";
        let subPtsText = "0 PTS 💔";
        let rankLabel = "MISS";

        if (missInfo.rank) {
          badgeTxt = `#${missInfo.rank}`;
          subText = `Ranked #${missInfo.rank} (Outside Top ${state.cutoff} • ${cut100Text})`;
          statBannerText = `${formatNumber(missInfo.stat)} ${cat.unit}`;
          rankLabel = `Rank #${missInfo.rank}`;
        } else if (missInfo.excludedByConstraint) {
          badgeTxt = "🚫";
          fbTitle = `SHOT ${shotNum}/${state.dailyMaxShots}: INELIGIBLE — ${displayName}`;
          const fName = constraintNames[missInfo.excludedByConstraint] || "Filter";
          subText = `${fName} excluded from list (${cut100Text})`;
          statBannerText = `${formatNumber(missInfo.rawStat)} ${cat.unit}`;
          subPtsText = "0 PTS (OUT)";
          rankLabel = "INELIGIBLE";
        } else if (missInfo.statKnown) {
          badgeTxt = "0";
          subText = `0 ${cat.unit} recorded in ${cat.title} • ${cut100Text}`;
          statBannerText = `0 ${cat.unit}`;
          rankLabel = `0 ${cat.unit}`;
        } else {
          const maxK = missInfo.maxKnownRank || (cat.players ? cat.players.length : 100);
          const cutMaxStat =
            cat.extraRanks && cat.extraRanks.length
              ? cat.extraRanks[cat.extraRanks.length - 1][1]
              : cat.players && cat.players.length
              ? cat.players[cat.players.length - 1].stat
              : null;
          badgeTxt = `>${maxK}`;
          subText = `Not ranked in Top ${maxK} (${cut100Text}${cutMaxStat ? ` • #${maxK} cut: ${formatNumber(cutMaxStat)} ${cat.unit}` : ""})`;
          statBannerText = `Not in Top ${maxK}`;
          rankLabel = `>${maxK}`;
        }

        showFeedbackBanner({
          tierClass: "tier-strike",
          rankBadge: badgeTxt,
          title: fbTitle,
          subtitle: subText,
          pointsText: statBannerText,
          pointsSubText: subPtsText
        });

        state.pickHistory.unshift({
          playerName: displayName,
          pickerName: `Shot #${shotNum}`,
          subtitle: subText,
          pointsLabel: `${statBannerText} (0 PTS)`,
          rankLabel,
          tierClass: "tier-strike"
        });
      }

      if (activePlayer.sniperShots.length >= state.dailyMaxShots) {
        activePlayer.eliminated = true;
      }
      advanceTurnOrEndGame();
      return;
    }

    // Check if this player is currently eliminated and taking a 90-100 Redemption Shot!
    if (activePlayer.eliminated && state.redemptionEnabled) {
      activePlayer.finalRedemptionAvailable = false;

      if (matchedCatPlayer && matchedCatPlayer.rank >= redMin && matchedCatPlayer.rank <= state.cutoff) {
        // REDEMPTION SUCCESS! #90-#100 HIT! +1 LIFE & +RANK POINTS!
        const rank = matchedCatPlayer.rank;
        const pts = rank;
        activePlayer.lives = 1;
        activePlayer.eliminated = false;
        activePlayer.score += pts;
        activePlayer.picks.push(matchedCatPlayer);

        if (!activePlayer.bestPull || rank > activePlayer.bestPull.rank) {
          activePlayer.bestPull = matchedCatPlayer;
        }

        state.revealedRanks.set(rank, {
          playerObj: matchedCatPlayer,
          pickedBy: activePlayer.id
        });

        sfx.playPinpointLegend();

        showFeedbackBanner({
          tierClass: "tier-legendary",
          rankBadge: `#${rank}`,
          title: `🐦‍🔥 REDEMPTION REVIVAL! ${activePlayer.name} is BACK with 1 ❤️!`,
          subtitle: `Sniped #${rank} ${matchedCatPlayer.name} (${formatNumber(matchedCatPlayer.stat)} ${cat.unit}) — Earned +${pts} PTS & +1 LIFE!`,
          pointsText: `+${pts} PTS & +1 ❤️`
        });

        state.pickHistory.unshift({
          playerName: matchedCatPlayer.name,
          pickerName: activePlayer.name,
          subtitle: `🐦‍🔥 REVIVED! (${formatNumber(matchedCatPlayer.stat)} ${cat.unit})`,
          pointsLabel: `+${pts} PTS & +1 ❤️`,
          rankLabel: `Rank #${rank}`,
          tierClass: "tier-legendary"
        });
      } else {
        // REDEMPTION MISSED (Either #1-#89 or #101+/Unranked)
        sfx.playStrike();
        if (matchedCatPlayer && matchedCatPlayer.rank <= state.cutoff) {
          // Reveal on board so the name is used up, but 0 pts and no revival
          state.revealedRanks.set(matchedCatPlayer.rank, {
            playerObj: matchedCatPlayer,
            pickedBy: activePlayer.id
          });
        }

        const missInfo = getPlayerRankAndStat(displayName, cat);
        const canShowRank =
          (matchedCatPlayer && matchedCatPlayer.rank <= state.cutoff) || state.showMissRank;
        const actualRankInfo =
          canShowRank && missInfo.rank
            ? `Ranked #${missInfo.rank} (${formatNumber(missInfo.stat)} ${cat.unit})`
            : missInfo.stat > 0 && state.showMissRank
            ? `Total: ${formatNumber(missInfo.stat)} ${cat.unit} (Outside Top ${state.cutoff})`
            : `Outside #${redMin}–#${state.cutoff}`;

        showFeedbackBanner({
          tierClass: "tier-strike",
          rankBadge: canShowRank && missInfo.rank ? `#${missInfo.rank}` : "❌",
          title: `NO REVIVAL! ${displayName} missed the #${redMin}–#${state.cutoff} zone!`,
          subtitle: `${actualRankInfo} — Needed #${redMin}–#${state.cutoff} to earn a life back. ${activePlayer.name} remains eliminated.`,
          pointsText: "0 PTS (OUT)"
        });

        state.pickHistory.unshift({
          playerName: displayName,
          pickerName: activePlayer.name,
          subtitle: `Missed Redemption (${actualRankInfo})`,
          pointsLabel: "NO REVIVAL",
          rankLabel: canShowRank && missInfo.rank ? `Rank #${missInfo.rank}` : `OUTSIDE #${state.cutoff}`,
          tierClass: "tier-strike"
        });
      }

      advanceTurnOrEndGame();
      return;
    }

    if (matchedCatPlayer && matchedCatPlayer.rank <= state.cutoff) {
      // VALID TOP 100 HIT!
      const rank = matchedCatPlayer.rank;
      const pts = rank; // Pinpoint rule: Rank = Points!
      activePlayer.score += pts;
      activePlayer.picks.push(matchedCatPlayer);

      if (!activePlayer.bestPull || rank > activePlayer.bestPull.rank) {
        activePlayer.bestPull = matchedCatPlayer;
      }

      state.revealedRanks.set(rank, {
        playerObj: matchedCatPlayer,
        pickedBy: activePlayer.id
      });

      const tier = getTierInfo(rank, state.cutoff);
      if (tier.cls === "tier-legendary") {
        sfx.playPinpointLegend();
      } else if (tier.cls === "tier-deep") {
        sfx.playDeepPull();
      } else {
        sfx.playSafeHit();
      }

      showFeedbackBanner({
        tierClass: tier.cls,
        rankBadge: `#${rank}`,
        title: `${tier.label} — ${matchedCatPlayer.name}`,
        subtitle: `Ranked #${rank} with ${formatNumber(matchedCatPlayer.stat)} ${cat.unit} (${matchedCatPlayer.team})`,
        pointsText: `+${pts} PTS`
      });

      state.pickHistory.unshift({
        playerName: matchedCatPlayer.name,
        pickerName: activePlayer.name,
        subtitle: `${formatNumber(matchedCatPlayer.stat)} ${cat.unit} • ${tier.short}`,
        pointsLabel: `+${pts} PTS`,
        rankLabel: `Rank #${rank}`,
        tierClass: tier.cls
      });
    } else {
      // MISS / OUTSIDE TOP 100 -> LOSE A LIFE!
      sfx.playStrike();
      activePlayer.lives = Math.max(0, activePlayer.lives - 1);
      if (activePlayer.lives === 0) {
        activePlayer.eliminated = true;
        if (state.redemptionEnabled) {
          activePlayer.finalRedemptionAvailable = true;
        }
      }

      const missInfo = getPlayerRankAndStat(displayName, cat);
      const redemptionNote =
        activePlayer.lives === 0 && state.redemptionEnabled
          ? ` — Eliminated, but can still guess #${redMin}–#${state.cutoff} for Redemption!`
          : ` (${activePlayer.name} has ${activePlayer.lives} ${activePlayer.lives === 1 ? "life" : "lives"} left)`;

      let badgeText = "💔";
      let bannerTitle = `STRIKE! ${displayName} is outside the Top ${state.cutoff}!`;
      let missSubtitle = `Not in the Top ${state.cutoff} for ${cat.title}!`;
      let rankLabel = `OUTSIDE #${state.cutoff}`;
      let feedSubtitle = `Outside Top ${state.cutoff}`;

      if (state.showMissRank) {
        if (missInfo.rank) {
          badgeText = `#${missInfo.rank}`;
          bannerTitle = `STRIKE! ${displayName} is Ranked #${missInfo.rank} (Outside Top ${state.cutoff})!`;
          missSubtitle = `Ranked #${missInfo.rank} with ${formatNumber(missInfo.stat)} ${cat.unit}${missInfo.team ? ` (${missInfo.team})` : ""} — Outside the Top ${state.cutoff}!`;
          rankLabel = `Rank #${missInfo.rank}`;
          feedSubtitle = `Ranked #${missInfo.rank} (${formatNumber(missInfo.stat)} ${cat.unit})`;
        } else {
          missSubtitle = `0 ${cat.unit} recorded in ${cat.title} (Unranked)!`;
          rankLabel = "UNRANKED";
          feedSubtitle = `Unranked (0 ${cat.unit})`;
        }
      }

      showFeedbackBanner({
        tierClass: "tier-strike",
        rankBadge: badgeText,
        title: bannerTitle,
        subtitle: `${missSubtitle}${redemptionNote}`,
        pointsText: "0 PTS (-1 ❤️)"
      });

      state.pickHistory.unshift({
        playerName: displayName,
        pickerName: activePlayer.name,
        subtitle: feedSubtitle,
        pointsLabel: "-1 LIFE 💔",
        rankLabel: rankLabel,
        tierClass: "tier-strike"
      });
    }

    advanceTurnOrEndGame();
  }

  function evaluateTargetPick(activePlayer, displayName, matchedCatPlayer, cat) {
    const statInfo = getPlayerRankAndStat(displayName, cat);
    const statVal =
      statInfo.statKnown && typeof statInfo.stat === "number"
        ? statInfo.stat
        : getPlayerStatForCategory(displayName, cat);

    // If a player genuinely has 0 in this specific stat or isn't in the stored list, don't waste their pick!
    if (!statVal || statVal <= 0) {
      state.undoStack.pop();
      updateUndoButtonState();
      state.guessedNames.delete(displayName.trim().toLowerCase());
      if (statInfo.excludedByConstraint) {
        showFeedbackBanner({
          tierClass: "tier-safe",
          rankBadge: "🚫",
          title: `${displayName} is excluded by this filter!`,
          subtitle: `Has ${formatNumber(statInfo.rawStat)} ${cat.unit}, but didn't qualify for ${cat.title} — pick NOT used.`,
          pointsText: `${formatNumber(statInfo.rawStat)} ${cat.unit}`,
          pointsSubText: "PICK NOT USED"
        });
      } else if (!statInfo.statKnown) {
        const maxK = statInfo.maxKnownRank || 360;
        showFeedbackBanner({
          tierClass: "tier-safe",
          rankBadge: `>${maxK}`,
          title: `${displayName} is not in the Top ${maxK}`,
          subtitle: `Only the Top ${maxK} are tracked for ${cat.title} — your pick was NOT used.`,
          pointsText: `Not in Top ${maxK}`,
          pointsSubText: "TRY AGAIN"
        });
      } else {
        showFeedbackBanner({
          tierClass: "tier-safe",
          rankBadge: "0",
          title: `${displayName} has 0 ${cat.unit} in ${cat.title}!`,
          subtitle: `Pick a player who recorded ${cat.unit} — your draft pick was NOT used.`,
          pointsText: `0 ${cat.unit}`,
          pointsSubText: "TRY AGAIN"
        });
      }
      return;
    }

    const newTotal = activePlayer.score + statVal;
    const rankDisplay = statInfo.rank ? `Rank #${statInfo.rank}` : "Career Total";

    if (state.bustRule === "bust" && newTotal > state.targetGoal) {
      // Busted on this pick!
      sfx.playStrike();
      activePlayer.picks.push({
        name: displayName,
        stat: statVal,
        bustedPick: true
      });
      showFeedbackBanner({
        tierClass: "tier-strike",
        rankBadge: "💥",
        title: `BUSTED PICK! ${displayName} has ${formatNumber(statVal)} ${cat.unit}!`,
        subtitle: `Adding ${formatNumber(statVal)} would put total at ${formatNumber(newTotal)} (Over ${formatNumber(state.targetGoal)}) • Pick scores 0.`,
        pointsText: `${formatNumber(statVal)} ${cat.unit}`,
        pointsSubText: "+0 (BUST 💥)"
      });

      state.pickHistory.unshift({
        playerName: displayName,
        pickerName: activePlayer.name,
        subtitle: `${formatNumber(statVal)} ${cat.unit} went over target!`,
        pointsLabel: "OVER 💥",
        rankLabel: rankDisplay,
        tierClass: "tier-strike"
      });
    } else {
      activePlayer.score = newTotal;
      activePlayer.picks.push({
        name: displayName,
        stat: statVal
      });
      sfx.playDeepPull();

      const rem = state.targetGoal - activePlayer.score;
      const subProg = state.isDaily
        ? `Total: ${formatNumber(activePlayer.score)} / ${formatNumber(state.targetGoal)} ${cat.unit} (${formatNumber(Math.abs(rem))} remaining)`
        : `${activePlayer.name} is now at ${formatNumber(activePlayer.score)} ${cat.unit} (${formatNumber(Math.abs(rem))} ${rem >= 0 ? "remaining" : "over"})`;
      showFeedbackBanner({
        tierClass: "tier-deep",
        rankBadge: statInfo.rank ? `#${statInfo.rank}` : "⚡",
        title: `${displayName} — +${formatNumber(statVal)} ${cat.unit}`,
        subtitle: subProg,
        pointsText: `+${formatNumber(statVal)} ${cat.unit}`,
        pointsSubText: `${formatNumber(activePlayer.score)} / ${formatNumber(state.targetGoal)}`
      });

      state.pickHistory.unshift({
        playerName: displayName,
        pickerName: activePlayer.name,
        subtitle: `Total: ${formatNumber(activePlayer.score)} ${cat.unit}`,
        pointsLabel: `+${formatNumber(statVal)}`,
        rankLabel: rankDisplay,
        tierClass: "tier-deep"
      });
    }

    if (activePlayer.picks.length >= state.maxPicks) {
      activePlayer.eliminated = true;
    }

    advanceTurnOrEndGame();
  }

  function showFeedbackBanner({ tierClass, rankBadge, title, subtitle, pointsText, pointsSubText = "" }) {
    const fb = document.getElementById("feedbackBanner");
    fb.className = `feedback-banner ${tierClass}`;
    fb.innerHTML = `
      <div class="fb-left">
        <div class="fb-rank-circle">${escapeHtml(rankBadge)}</div>
        <div>
          <div class="fb-title">${escapeHtml(title)}</div>
          <div class="fb-sub">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <div class="fb-right-stat">
        <div class="fb-points-award">${escapeHtml(pointsText)}</div>
        ${pointsSubText ? `<div class="fb-points-sub">${escapeHtml(pointsSubText)}</div>` : ""}
      </div>
    `;
  }

  function advanceTurnOrEndGame() {
    renderScoreboard();
    renderMainArena();
    renderPickFeed();

    // Check if game should end
    const alivePlayers = state.players.filter((p) => !p.eliminated);
    const pendingRedemptionPlayers = state.players.filter((p) => p.finalRedemptionAvailable);

    if (state.mode === "top100") {
      // Check if all Top 100 slots have been found
      if (state.revealedRanks.size >= state.cutoff) {
        finishGame("All Top 100 players have been sniped!");
        return;
      }
      // If multiplayer "Last Player Standing Wins Immediately" and >1 player started (only when redemption is OFF)
      if (
        !state.redemptionEnabled &&
        state.playerCount > 1 &&
        state.winCondition === "survival" &&
        alivePlayers.length === 1
      ) {
        finishGame(`${alivePlayers[0].name} is the Last Player Standing!`);
        return;
      }
      // When everyone is out of lives AND no one has a pending redemption shot left
      if (alivePlayers.length === 0 && (!state.redemptionEnabled || pendingRedemptionPlayers.length === 0)) {
        finishGame("All players are out of lives!");
        return;
      }
    } else {
      // Target Mode: all players completed their picks
      if (alivePlayers.length === 0) {
        finishGame("All draft picks completed!");
        return;
      }
    }

    // Advance turn
    let nextIdx = state.currentTurnIndex;
    for (let step = 1; step <= state.playerCount; step++) {
      const candidate = (state.currentTurnIndex + step) % state.playerCount;
      const candPlayer = state.players[candidate];
      if (state.mode === "top100" && state.redemptionEnabled) {
        // If at least one player is still alive, ALL players (even eliminated ones!) stay in rotation to attempt 90-100 Redemption!
        // If 0 players are alive, only players with finalRedemptionAvailable get their final clutch shot.
        if (alivePlayers.length > 0 || candPlayer.finalRedemptionAvailable) {
          nextIdx = candidate;
          break;
        }
      } else {
        if (!candPlayer.eliminated) {
          nextIdx = candidate;
          break;
        }
      }
    }
    state.currentTurnIndex = nextIdx;

    renderScoreboard();
    renderTurnPrompt();

    if (state.shotClockSeconds > 0) {
      startShotClock();
    }
  }

  function finishGame(reasonText, opts = {}) {
    const { autoOpenModal = true, silentSfx = false } = opts;
    stopShotClock();
    state.gameOver = true;
    if (!silentSfx) {
      sfx.playVictory();
    }

    document.getElementById("playerSearchInput").disabled = true;
    document.getElementById("submitGuessBtn").disabled = true;
    renderHeaderState();
    renderCategoryBanner();
    renderScoreboard();
    renderTurnPrompt();
    updateUndoButtonState();

    // Sort standings
    const sorted = [...state.players].sort((a, b) => {
      if (state.mode === "top100") {
        if (state.playerCount > 1 && state.winCondition === "survival") {
          if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        }
        return b.score - a.score;
      } else {
        // Closest to targetGoal
        const distA = Math.abs(state.targetGoal - a.score);
        const distB = Math.abs(state.targetGoal - b.score);
        return distA - distB;
      }
    });

    const winner = sorted[0];
    const cat = getActiveCategory();

    // Save daily completion & show spoiler-free share preview if in daily mode
    const sharePreviewEl = document.getElementById("dailySharePreviewBox");
    const shareLegendEl = document.getElementById("dailyShareLegend");
    const playAgainBtn = document.getElementById("playAgainModalBtn");
    const shareBtn = document.getElementById("shareScoreBtn");
    const undoModalBtn = document.getElementById("undoLastModalBtn");

    if (state.isDaily) {
      const activeDate = state.dailyDateStr || getTodayString();
      if (!state.dailyPracticeReplay) {
        recordDailyCompletion(state.sport, state.dailySubmode, winner, cat, activeDate);
      }
      renderDailyBar();
      const shareCard = buildDailyShareText(winner, cat, activeDate);
      if (sharePreviewEl) {
        sharePreviewEl.textContent = shareCard;
        sharePreviewEl.classList.remove("hidden");
      }
      if (shareLegendEl) {
        shareLegendEl.classList.toggle("hidden", state.dailySubmode !== "sniper");
      }
      if (playAgainBtn) {
        playAgainBtn.textContent = "🔄 Practice Replay (Unofficial)";
      }
      if (shareBtn) {
        shareBtn.removeAttribute("data-orig-label");
        shareBtn.textContent = "📲 Share Daily Grid";
      }
      if (undoModalBtn) {
        undoModalBtn.classList.toggle("hidden", !state.dailyPracticeReplay || state.undoStack.length === 0);
      }
    } else {
      // Record Couch Series stats if multiplayer match (and not just board reveal with 0 picks)
      if (state.playerCount > 1 && !state.seriesRecordedForMatch && state.pickHistory.length > 0) {
        recordMatchInCouchSeries(winner, cat);
      }
      renderCouchSeriesBar();
      if (sharePreviewEl) sharePreviewEl.classList.add("hidden");
      if (shareLegendEl) shareLegendEl.classList.add("hidden");
      if (playAgainBtn) playAgainBtn.textContent = "🔄 Play Again";
      if (shareBtn) {
        shareBtn.removeAttribute("data-orig-label");
        shareBtn.textContent = "📲 Share Result";
      }
      if (undoModalBtn) {
        undoModalBtn.classList.toggle("hidden", state.undoStack.length === 0);
      }
    }

    const activeDailyNum = getDailyNumber(state.dailyDateStr || getTodayString());
    if (state.isDaily && state.dailySubmode === "sniper") {
      const gInfo = getSniperGrade(winner.score);
      document.getElementById("gameOverBadge").textContent = `🎯 DAILY #${activeDailyNum} COMPLETE`;
      document.getElementById("gameOverTitle").textContent = `${formatNumber(winner.score)} / 490 PTS (${gInfo.grade})`;
      document.getElementById("gameOverSubtitle").textContent = `${gInfo.label} • ${cat.title}`;
    } else if (state.isDaily && state.dailySubmode === "target") {
      const diff = Math.abs(state.targetGoal - winner.score);
      const pct = Math.min(100, ((winner.score / state.targetGoal) * 100)).toFixed(1);
      document.getElementById("gameOverBadge").textContent = `⚡ DAILY #${activeDailyNum} COMPLETE`;
      document.getElementById("gameOverTitle").textContent = `${pct}% Accuracy (${formatNumber(diff)} away)`;
      document.getElementById("gameOverSubtitle").textContent = `Drafted ${formatNumber(winner.score)} / ${formatNumber(state.targetGoal)} ${cat.unit} • ${cat.title}`;
    } else {
      document.getElementById("gameOverBadge").textContent = "🏆 MATCH COMPLETE";
      document.getElementById("gameOverTitle").textContent =
        state.playerCount === 1
          ? `Final Score: ${formatNumber(winner.score)} ${state.mode === "top100" ? "PTS" : cat.unit}`
          : `🏆 ${winner.name} Wins!`;
      document.getElementById("gameOverSubtitle").textContent = reasonText;
    }

    const standingsEl = document.getElementById("finalStandingsList");
    standingsEl.innerHTML = sorted
      .map((p, idx) => {
        const unitLabel = state.mode === "top100" ? "PTS" : cat.unit;
        const extra =
          state.mode === "top100"
            ? `${p.picks.length} hits${p.bestPull ? ` • Best: #${p.bestPull.rank} ${p.bestPull.name}` : ""}`
            : `Diff from Target: ${formatNumber(Math.abs(state.targetGoal - p.score))} ${cat.unit}`;
        return `
          <div class="standing-row ${idx === 0 ? "winner" : ""}">
            <div>
              <strong>${idx === 0 ? "👑 " : `#${idx + 1} `}${escapeHtml(p.name)}</strong>
              <div style="font-size:0.76rem;color:var(--text-secondary);">${escapeHtml(extra)}</div>
            </div>
            <div style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:1.2rem;">
              ${formatNumber(p.score)} ${unitLabel}
            </div>
          </div>
        `;
      })
      .join("");

    // Best Pull Showcase
    const allValidPicks = state.players.flatMap((p) => p.picks).filter((pk) => pk && pk.rank);
    const highestRankPick = allValidPicks.sort((a, b) => b.rank - a.rank)[0];
    const showcaseEl = document.getElementById("bestPullsShowcase");
    if (highestRankPick && state.mode === "top100") {
      showcaseEl.innerHTML = `🔥 <strong>Deepest Bag Pull of the Match:</strong> #${highestRankPick.rank} ${escapeHtml(highestRankPick.name)} (${formatNumber(highestRankPick.stat)} ${cat.unit}) for <strong>+${highestRankPick.rank} PTS</strong>!`;
    } else {
      showcaseEl.innerHTML = `🎯 Category: <strong>${escapeHtml(cat.sport)} — ${escapeHtml(cat.title)}</strong>`;
    }

    if (autoOpenModal) {
      document.getElementById("gameOverModal").classList.remove("hidden");
    }
    if (!silentSfx) {
      trackEvent("puzzle_complete", {
        sport: cat.sport,
        mode: state.isDaily ? `daily_${state.dailySubmode}` : state.mode,
        is_daily: Boolean(state.isDaily),
        is_practice: Boolean(state.dailyPracticeReplay),
        score: winner ? winner.score : 0,
        category_id: cat.id
      });
    }
  }

  // 7. Shot Clock Timer
  function startShotClock() {
    stopShotClock();
    if (state.shotClockSeconds <= 0 || state.gameOver) {
      document.getElementById("shotClockBox").classList.add("hidden");
      return;
    }
    state.timerRemaining = state.shotClockSeconds;
    const box = document.getElementById("shotClockBox");
    const val = document.getElementById("shotClockValue");
    box.classList.remove("hidden");
    val.textContent = `${state.timerRemaining}s`;

    state.timerInterval = setInterval(() => {
      state.timerRemaining -= 1;
      val.textContent = `${state.timerRemaining}s`;
      if (state.timerRemaining <= 0) {
        stopShotClock();
        handleShotClockExpired();
      }
    }, 1000);
  }

  function stopShotClock() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function handleShotClockExpired() {
    if (state.gameOver) return;
    const activePlayer = state.players[state.currentTurnIndex];
    pushUndoSnapshot(`Shot Clock Expired (${activePlayer.name})`);
    sfx.playStrike();
    if (state.mode === "top100") {
      activePlayer.lives = Math.max(0, activePlayer.lives - 1);
      if (activePlayer.lives === 0) activePlayer.eliminated = true;
      showFeedbackBanner({
        tierClass: "tier-strike",
        rankBadge: "⏰",
        title: `SHOT CLOCK VIOLATION! ${activePlayer.name} ran out of time!`,
        subtitle: `Lost 1 life (${activePlayer.lives} remaining).`,
        pointsText: "-1 LIFE 💔"
      });
      state.pickHistory.unshift({
        playerName: "Shot Clock Expired",
        pickerName: activePlayer.name,
        subtitle: "Ran out of time",
        pointsLabel: "-1 LIFE 💔",
        rankLabel: "TIMEOUT",
        tierClass: "tier-strike"
      });
    } else {
      activePlayer.picks.push({ name: "Shot Clock Expired", stat: 0 });
      if (activePlayer.picks.length >= state.maxPicks) activePlayer.eliminated = true;
    }
    advanceTurnOrEndGame();
  }

  // 8. Autocomplete Engine
  const NICKNAME_EXPANSIONS = {
    mike: "michael",
    michael: "mike",
    matt: "matthew",
    matthew: "matt",
    rob: "robert",
    robert: "rob",
    bob: "robert",
    dan: "daniel",
    danny: "daniel",
    chris: "christopher",
    steve: "steven",
    will: "william",
    bill: "william",
    dave: "david",
    jim: "james",
    jimmy: "james",
    tom: "thomas",
    tommy: "thomas",
    joe: "joseph",
    ben: "benjamin",
    alex: "alexander",
    nick: "nicholas",
    pat: "patrick",
    tony: "anthony",
    ken: "kenneth",
    kenny: "kenneth"
  };

  function expandQueryVariants(q) {
    const clean = q.replace(/\./g, "");
    const variants = [q];
    if (clean !== q) variants.push(clean);
    const parts = clean.split(/\s+/);
    if (parts.length >= 1 && NICKNAME_EXPANSIONS[parts[0]]) {
      const altParts = [...parts];
      altParts[0] = NICKNAME_EXPANSIONS[parts[0]];
      variants.push(altParts.join(" "));
    }
    return variants;
  }

  function updateAutocomplete(query) {
    const dropdown = document.getElementById("autocompleteDropdown");
    const q = (query || "").trim().toLowerCase();
    if (!q) {
      hideAutocomplete();
      return;
    }

    const qVariants = expandQueryVariants(q);
    const pool = SPORT_PLAYER_DIRECTORY[state.sport] || [];
    // Score matches: startsWith first, then word startsWith, then includes
    const matches = [];
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const nameLow = p.name.toLowerCase();
      const nameNoDots = nameLow.replace(/\./g, "");
      let bestPrio = 99;
      for (let v = 0; v < qVariants.length; v++) {
        const qv = qVariants[v];
        if (nameLow.startsWith(qv) || nameNoDots.startsWith(qv)) {
          bestPrio = Math.min(bestPrio, v === 0 ? 1 : 2);
        } else if (nameLow.split(/\s+/).some((part) => part.replace(/\./g, "").startsWith(qv))) {
          bestPrio = Math.min(bestPrio, 2);
        } else if (nameLow.includes(qv) || nameNoDots.includes(qv)) {
          bestPrio = Math.min(bestPrio, 3);
        }
      }
      if (bestPrio < 99) {
        matches.push({ player: p, priority: bestPrio });
      }
    }

    matches.sort((a, b) => a.priority - b.priority || a.player.name.localeCompare(b.player.name));
    state.acMatches = matches.slice(0, 8).map((m) => m.player);
    state.acHighlightIndex = state.acMatches.length > 0 ? 0 : -1;

    if (state.acMatches.length === 0) {
      hideAutocomplete();
      return;
    }

    renderAutocompleteItems();
    dropdown.classList.remove("hidden");
  }

  function renderAutocompleteItems() {
    const dropdown = document.getElementById("autocompleteDropdown");
    dropdown.innerHTML = state.acMatches
      .map((p, idx) => {
        const alreadyPicked = state.guessedNames.has(p.name.toLowerCase());
        const classes = [
          "ac-item",
          idx === state.acHighlightIndex ? "highlighted" : "",
          alreadyPicked ? "already-picked" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div class="${classes}" data-name="${escapeHtml(p.name)}" role="option">
            <span class="ac-name">${escapeHtml(p.name)} ${alreadyPicked ? "(Already Picked)" : ""}</span>
            <div class="ac-meta">
              <span class="ac-team-pill">${escapeHtml(p.team)}</span>
              <span>${escapeHtml(p.era)}</span>
            </div>
          </div>
        `;
      })
      .join("");

    dropdown.querySelectorAll(".ac-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const name = el.getAttribute("data-name");
        handleGuessSubmission(name);
      });
    });
  }

  function hideAutocomplete() {
    const dropdown = document.getElementById("autocompleteDropdown");
    dropdown.classList.add("hidden");
    state.acMatches = [];
    state.acHighlightIndex = -1;
  }

  // 9. Daily Challenge Engine (365+ Verified Niche Categories Per Sport, Zero Yearly Repeats)
  const dailyPermCache = {};
  const dailyTriedShards = {};
  let dailyLaunchSeq = 0;

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getYesterdayString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const DAILY_LAUNCH_DATE = [2026, 11, 10]; // YYYY, MM (1-12), DD -> Daily #1

  function getRawDailyNumber(dateStr) {
    const epoch = Date.UTC(DAILY_LAUNCH_DATE[0], DAILY_LAUNCH_DATE[1] - 1, DAILY_LAUNCH_DATE[2]);
    let targetUtc;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      targetUtc = Date.UTC(y, m - 1, d);
    } else {
      const now = new Date();
      targetUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }
    return Math.round((targetUtc - epoch) / 86400000) + 1;
  }

  function getDailyNumber(dateStr) {
    return Math.max(1, getRawDailyNumber(dateStr));
  }

  function getPastDateString(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getNextDailyCountdownText() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diffMs = Math.max(0, tomorrow.getTime() - now.getTime());
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `⏳ Next: ${hrs}h ${mins}m`;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function getDeterministicCyclePermutation(sport, cycleIdx, length) {
    const cacheKey = `${sport}_${cycleIdx}_${length}`;
    if (dailyPermCache[cacheKey]) return dailyPermCache[cacheKey];
    const arr = new Array(length);
    for (let i = 0; i < length; i++) arr[i] = i;
    let seed = hashString(`pinpoint_daily_365_v2_${sport}_${cycleIdx}`) || 1337;
    for (let i = length - 1; i > 0; i--) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const rnd = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      const j = Math.floor(rnd * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    dailyPermCache[cacheKey] = arr;
    return arr;
  }

  function getDailyManifestEntryForSport(sport, submode = "sniper", dateStr = "") {
    const dKey = dateStr || state.dailyDateStr || getTodayString();
    const list = DAILY_NICHE_MANIFEST[sport] || [];
    if (!list.length) return null;
    const dayNum = getDailyNumber(dKey);
    const n = list.length;
    const cycleIdx = Math.floor((dayNum - 1) / n);
    const posInCycle = (dayNum - 1) % n;
    const perm = getDeterministicCyclePermutation(sport, cycleIdx, n);
    const slotIdx = submode === "sniper" ? posInCycle : (posInCycle + Math.floor(n / 2)) % n;
    return list[perm[slotIdx]] || list[0];
  }

  function getDailyCategoryForSport(sport, submode = "sniper", dateStr = "") {
    const dKey = dateStr || state.dailyDateStr || getTodayString();
    const entry = getDailyManifestEntryForSport(sport, submode, dKey);
    if (entry) {
      const hydrated = findHydratedNicheById(entry.id);
      if (hydrated) return hydrated;
      return {
        id: entry.id,
        sport: entry.sport,
        dailyOnly: true,
        title: entry.title,
        subtitle: entry.title,
        unit: entry.unit,
        defaultTarget: entry.defaultTarget,
        shard: entry.shard,
        _manifestStub: true,
        players: []
      };
    }
    return (
      DAILY_NICHE_CATEGORIES.find((c) => c.sport === sport) ||
      ALL_CATEGORIES.find((c) => c.sport === sport) ||
      ALL_CATEGORIES[0]
    );
  }

  function getDailyStorageKey(sport, submode = "sniper", dateStr = "") {
    const dKey = dateStr || state.dailyDateStr || getTodayString();
    return `pinpoint_daily_v2_${dKey}_${sport}_${submode}`;
  }

  function getDailyProfile() {
    try {
      const raw = localStorage.getItem("pinpoint_daily_profile_v2");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // Ignore
    }
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastPlayedDate: "",
      totalCompleted: 0,
      totalSnipes90: 0
    };
  }

  function saveDailyProfile(prof) {
    try {
      localStorage.setItem("pinpoint_daily_profile_v2", JSON.stringify(prof));
    } catch (e) {
      // Ignore
    }
  }

  function getDailyCompletion(sport, submode = "sniper", dateStr = "") {
    try {
      const raw = localStorage.getItem(getDailyStorageKey(sport, submode, dateStr));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function recordDailyCompletion(sport, submode, winner, cat, dateStr = "") {
    const dKey = dateStr || state.dailyDateStr || getTodayString();
    const existing = getDailyCompletion(sport, submode, dKey);
    if (existing) return existing; // Keep official first try!

    const today = getTodayString();
    const yesterday = getYesterdayString();
    const prof = getDailyProfile();

    // Only live Today completions advance the daily streak
    if (dKey === today && prof.lastPlayedDate !== today) {
      if (prof.lastPlayedDate === yesterday) {
        prof.currentStreak = (prof.currentStreak || 0) + 1;
      } else {
        prof.currentStreak = 1;
      }
      prof.lastPlayedDate = today;
      prof.bestStreak = Math.max(prof.bestStreak || 0, prof.currentStreak);
    }
    prof.totalCompleted = (prof.totalCompleted || 0) + 1;

    if (submode === "sniper" && winner.sniperShots) {
      const snipes = winner.sniperShots.filter((s) => s.hit && s.rank >= 90 && s.rank <= 100).length;
      prof.totalSnipes90 = (prof.totalSnipes90 || 0) + snipes;
    }
    saveDailyProfile(prof);

    const payload = {
      date: dKey,
      sport,
      submode,
      score: winner.score,
      targetGoal: state.targetGoal,
      sniperShots: winner.sniperShots || [],
      picks: winner.picks || [],
      bestPull: winner.bestPull || null,
      revealedEntries: Array.from(state.revealedRanks.entries()),
      pickHistory: state.pickHistory || []
    };
    try {
      localStorage.setItem(getDailyStorageKey(sport, submode, dKey), JSON.stringify(payload));
    } catch (e) {
      // Ignore
    }
    return payload;
  }

  function getSniperShotColorSquare(sh) {
    if (!sh || !sh.hit) return "🟥";
    if (sh.rank >= 90) return "🟪";
    if (sh.rank >= 75) return "🟩";
    if (sh.rank >= 50) return "🟦";
    return "🟨";
  }

  function buildDailyShareText(winner, cat, dateStr = "") {
    const dKey = dateStr || state.dailyDateStr || getTodayString();
    const dailyNum = getDailyNumber(dKey);
    const isArchive = dKey !== getTodayString();
    const prof = getDailyProfile();
    const streakPart = prof.currentStreak > 0 && !isArchive ? ` · 🔥 ${prof.currentStreak}d` : "";

    if (state.dailySubmode === "sniper") {
      const gInfo = getSniperGrade(winner.score);
      const shots = winner.sniperShots || [];
      const squares = shots.map((sh) => getSniperShotColorSquare(sh)).join(" ") || "⬜ ⬜ ⬜ ⬜ ⬜";
      return [
        `🎯 StatSnipes #${dailyNum}${isArchive ? " (Archive)" : ""} (${getSportIcon(cat.sport)} ${cat.sport})`,
        `${cat.title}`,
        `${formatNumber(winner.score)} / 490 · Grade ${gInfo.grade}${streakPart}`,
        `[ ${squares} ]`,
        `statsnipes.com`
      ].join("\n");
    } else {
      const pct = Math.min(100, (winner.score / state.targetGoal) * 100).toFixed(1);
      const squares =
        (winner.picks || []).map((pk) => (pk.bustedPick ? "🟥" : "🟩")).join(" ") || "⬜ ⬜ ⬜ ⬜ ⬜";
      return [
        `⚡ StatSnipes #${dailyNum}${isArchive ? " (Archive)" : ""} (${getSportIcon(cat.sport)} Target Stat)`,
        `${cat.title}`,
        `${formatNumber(winner.score)} / ${formatNumber(state.targetGoal)} ${cat.unit} (${pct}%)${streakPart}`,
        `[ ${squares} ]`,
        `statsnipes.com`
      ].join("\n");
    }
  }

  function buildMatchShareText() {
    const cat = getActiveCategory();
    const winner = [...state.players].sort((a, b) => b.score - a.score)[0];
    if (state.isDaily) {
      return buildDailyShareText(winner, cat, state.dailyDateStr || getTodayString());
    }
    return [
      `🎯 STATSNIPES (${cat.sport}) — ${cat.title}`,
      `🏆 ${winner.name}: ${formatNumber(winner.score)} ${state.mode === "top100" ? "PTS" : cat.unit}`,
      winner.bestPull ? `🔥 Best Snipe: #${winner.bestPull.rank} ${winner.bestPull.name} (+${winner.bestPull.rank})` : "",
      `📋 ${state.revealedRanks.size}/${state.cutoff} Top Players Sniped`,
      `statsnipes.com`
    ]
      .filter(Boolean)
      .join("\n");
  }

  function copyMatchTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    }
    fallbackCopyText(text);
    return Promise.resolve();
  }

  function fallbackCopyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {
      // Ignore
    }
    document.body.removeChild(ta);
  }

  const DAILY_SUMMARY_DISMISSED_KEY = "statsnipes_summary_dismissed_v1";
  const dismissedDailySummariesMem = new Set();

  function getDailyPuzzleKey(sport, submode, dateStr) {
    return `${sport || state.sport}_${submode || state.dailySubmode}_${dateStr || state.dailyDateStr || getTodayString()}`;
  }

  function hasDismissedDailySummary(sport, submode, dateStr) {
    const key = getDailyPuzzleKey(sport, submode, dateStr);
    if (dismissedDailySummariesMem.has(key)) return true;
    try {
      const raw = localStorage.getItem(DAILY_SUMMARY_DISMISSED_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.includes(key)) {
          dismissedDailySummariesMem.add(key);
          return true;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
    return false;
  }

  function markDailySummaryDismissed(sport, submode, dateStr) {
    const key = getDailyPuzzleKey(sport, submode, dateStr);
    dismissedDailySummariesMem.add(key);
    try {
      const raw = localStorage.getItem(DAILY_SUMMARY_DISMISSED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list.filter((item) => item !== key) : [];
      next.push(key);
      localStorage.setItem(DAILY_SUMMARY_DISMISSED_KEY, JSON.stringify(next.slice(-60)));
    } catch (e) {
      // Ignore storage errors
    }
  }

  function closeGameOverModal(markDismissed = true) {
    const modal = document.getElementById("gameOverModal");
    if (modal) modal.classList.add("hidden");
    if (markDismissed && state.isDaily && !state.dailyPracticeReplay) {
      markDailySummaryDismissed(state.sport, state.dailySubmode, state.dailyDateStr || getTodayString());
    }
  }

  function flashActionFeedback(btnEl, statusText) {
    if (!btnEl) return;
    const orig = btnEl.getAttribute("data-orig-label") || btnEl.textContent;
    btnEl.setAttribute("data-orig-label", orig);
    btnEl.textContent = statusText;
    setTimeout(() => {
      btnEl.textContent = orig;
    }, 2000);
  }

  function trackEvent(eventName, params = {}) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, params);
      }
    } catch (e) {
      // Ignore analytics errors
    }
  }

  function shareOrCopyPayload({ shareData, clipboardText, btnEl, sharedLabel = "✅ Shared!", copiedLabel = "✅ Copied!" }) {
    const shareProps = {
      sport: state.sport,
      mode: state.isDaily ? `daily_${state.dailySubmode}` : state.mode,
      is_daily: Boolean(state.isDaily)
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        const sharePromise = navigator.share(shareData);
        if (sharePromise && typeof sharePromise.then === "function") {
          sharePromise
            .then(() => {
              trackEvent("share_click", { ...shareProps, method: "native" });
              flashActionFeedback(btnEl, sharedLabel);
            })
            .catch((err) => {
              if (err && err.name === "AbortError") return;
              copyMatchTextToClipboard(clipboardText);
              trackEvent("share_click", { ...shareProps, method: "clipboard" });
              flashActionFeedback(btnEl, copiedLabel);
            });
          return;
        }
      } catch (e) {
        // Fall through to clipboard copy if synchronous share throws
      }
    }
    copyMatchTextToClipboard(clipboardText);
    trackEvent("share_click", { ...shareProps, method: "clipboard" });
    flashActionFeedback(btnEl, copiedLabel);
  }

  function copyCurrentResultText(btnEl) {
    const text = buildMatchShareText();
    shareOrCopyPayload({
      shareData: { title: "StatSnipes", text },
      clipboardText: text,
      btnEl,
      sharedLabel: "✅ Shared!",
      copiedLabel: "✅ Copied!"
    });
  }

  function populateDailyArchiveSelect() {
    const sel = document.getElementById("dailyArchiveSelect");
    if (!sel) return;
    const today = getTodayString();
    const activeDate = state.dailyDateStr || today;
    const opts = [];
    for (let i = 0; i < 14; i++) {
      const ds = getPastDateString(i);
      const rawNum = getRawDailyNumber(ds);
      if (rawNum < 1 && i > 0) break; // Never show pre-launch dates in Past Archive
      const num = Math.max(1, rawNum);
      const doneS = Boolean(getDailyCompletion(state.sport, "sniper", ds));
      const doneT = Boolean(getDailyCompletion(state.sport, "target", ds));
      const checkMark = doneS && doneT ? " ✅" : doneS || doneT ? " ☑️" : "";
      const labelPrefix = i === 0 ? `🔥 Today` : i === 1 ? `📅 Yesterday` : `📅 #${num} (${ds})`;
      opts.push(`<option value="${ds}" ${ds === activeDate ? "selected" : ""}>${labelPrefix}${checkMark}</option>`);
    }
    sel.innerHTML = opts.join("");
  }

  function renderDailyBar() {
    const today = getTodayString();
    const activeDate = state.dailyDateStr || today;
    const dailyNum = getDailyNumber(activeDate);
    const isArchive = activeDate !== today;

    document.getElementById("dailyDateLabel").textContent = isArchive
      ? `ARCHIVE DAILY #${dailyNum}`
      : `DAILY STATSNIPES #${dailyNum}`;
    const cdEl = document.getElementById("dailyCountdownLabel");
    if (cdEl) {
      cdEl.textContent = isArchive ? `📅 ${activeDate}` : getNextDailyCountdownText();
    }

    populateDailyArchiveSelect();

    let dateDoneCount = 0;
    ["NBA", "NFL", "MLB"].forEach((sp) => {
      if (getDailyCompletion(sp, "sniper", activeDate)) dateDoneCount++;
      if (getDailyCompletion(sp, "target", activeDate)) dateDoneCount++;
    });

    const streakEl = document.getElementById("dailyStreakSummary");
    if (streakEl) {
      streakEl.innerHTML = `
        <span class="daily-stat-pill">✅ ${dateDoneCount}/6</span>
      `;
    }

    const leaguePillsEl = document.getElementById("dailyLeaguePills");
    if (leaguePillsEl) {
      leaguePillsEl.innerHTML = ["NBA", "NFL", "MLB"]
        .map((lg) => {
          const lgS = Boolean(getDailyCompletion(lg, "sniper", activeDate));
          const lgT = Boolean(getDailyCompletion(lg, "target", activeDate));
          const lgDone = (lgS ? 1 : 0) + (lgT ? 1 : 0);
          const progCls = lgDone === 2 ? "done" : lgDone === 1 ? "partial" : "";
          const progTxt = lgDone === 2 ? "✓ 2/2" : `${lgDone}/2`;
          return `
            <button type="button" class="daily-league-btn ${lg === state.sport ? "active" : ""} ${lgDone === 2 ? "all-done" : ""}" data-dailyleague="${lg}" role="tab" aria-selected="${lg === state.sport}">
              <span>${getSportIcon(lg)} ${lg}</span>
              <span class="dl-prog ${progCls}">${progTxt}</span>
            </button>
          `;
        })
        .join("");

      leaguePillsEl.querySelectorAll(".daily-league-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lg = btn.getAttribute("data-dailyleague");
          if (!lg) return;
          populateExplorerControls(lg);
          launchDailyChallenge(lg, state.dailySubmode || "sniper", false, activeDate);
        });
      });
    }

    const gamesLabelEl = document.getElementById("dailyGamesGroupLabel");
    if (gamesLabelEl) {
      gamesLabelEl.textContent = `${getSportIcon(state.sport)} ${state.sport} DAILY GAMES`;
    }

    const container = document.getElementById("dailySportCards");
    const sp = state.sport;
    const sniperCat = getDailyCategoryForSport(sp, "sniper", activeDate);
    const targetCat = getDailyCategoryForSport(sp, "target", activeDate);
    if (state.isDaily) {
      if (sniperCat && sniperCat.shard && !dailyTriedShards[sniperCat.shard]) {
        ensureDailyShardLoaded(sniperCat.shard);
      }
      if (targetCat && targetCat.shard && !dailyTriedShards[targetCat.shard]) {
        ensureDailyShardLoaded(targetCat.shard);
      }
    }
    const doneSniper = getDailyCompletion(sp, "sniper", activeDate);
    const doneTarget = getDailyCompletion(sp, "target", activeDate);

    const sniperBadge = doneSniper
      ? `<span class="completed-check">✓ ${formatNumber(doneSniper.score)}</span>`
      : `<span style="color:var(--sport-secondary);font-size:0.72rem;font-weight:800;">Play →</span>`;

    const targetPct = doneTarget
      ? Math.min(100, ((doneTarget.score / (doneTarget.targetGoal || targetCat.defaultTarget)) * 100)).toFixed(1)
      : null;
    const targetBadge = doneTarget
      ? `<span class="completed-check">✓ ${targetPct}%</span>`
      : `<span style="color:var(--sport-secondary);font-size:0.72rem;font-weight:800;">Play →</span>`;

    container.innerHTML = `
      <button type="button" class="daily-card-btn ${state.dailySubmode === "sniper" ? "active" : ""}" data-dailysubmode="sniper" title="${escapeHtml(sniperCat.title)}">
        <span class="dc-mode-title">🎯 5-Shot Sniper</span>
        ${sniperBadge}
      </button>

      <button type="button" class="daily-card-btn ${state.dailySubmode === "target" ? "active" : ""}" data-dailysubmode="target" title="${escapeHtml(targetCat.title)} • Target: ${formatNumber(targetCat.defaultTarget)} ${targetCat.unit}">
        <span class="dc-mode-title">⚡ Target Stat</span>
        ${targetBadge}
      </button>
    `;

    container.querySelectorAll(".daily-card-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-dailysubmode");
        launchDailyChallenge(state.sport, sub, false, activeDate);
      });
    });
  }

  function launchDailyChallenge(sport, submode = state.dailySubmode || "sniper", isPractice = false, dateStr = "") {
    const activeDate = dateStr || state.dailyDateStr || getTodayString();
    state.dailyDateStr = activeDate;
    state.isDaily = true;
    state.dailySubmode = submode;
    state.dailyPracticeReplay = Boolean(isPractice);
    state.sport = sport;
    state.mode = submode === "sniper" ? "top100" : "target";

    let cat = getDailyCategoryForSport(sport, submode, activeDate);
    if (cat && cat._manifestStub && cat.shard && !dailyTriedShards[cat.shard]) {
      dailyTriedShards[cat.shard] = true;
      const reqId = ++dailyLaunchSeq;
      renderHeaderState();
      renderDailyBar();
      const titleEl = document.getElementById("activeCategoryTitle");
      const subEl = document.getElementById("activeCategorySubtitle");
      if (titleEl) titleEl.textContent = cat.title;
      if (subEl) {
        subEl.textContent = "Loading verified Top 100 niche dataset...";
        subEl.classList.remove("hidden");
      }
      ensureDailyShardLoaded(cat.shard).then(() => {
        if (reqId !== dailyLaunchSeq || !state.isDaily) return;
        launchDailyChallenge(sport, submode, isPractice, activeDate);
      });
      return;
    }
    if (!cat || !cat.players || cat.players.length < 100) {
      cat =
        ALL_CATEGORIES.find((c) => c.sport === sport) ||
        ALL_CATEGORIES[0];
    }

    if (cat.id === "__custom__") {
      state.customCategory = cat;
      state.categoryId = "__custom__";
    } else {
      state.customCategory = null;
      state.categoryId = cat.id;
    }

    state.cutoff = 100;
    state.maxLives = 5;
    state.maxPicks = 5;
    state.bustRule = "bust";
    state.targetGoal = cat.defaultTarget;
    state.playerCount = 1;
    state.playerNamesConfig[0] = "Daily Challenger";
    document.getElementById("customSetupPanel").classList.add("hidden");

    const saved = !isPractice ? getDailyCompletion(sport, submode, activeDate) : null;
    startMatch(Boolean(saved));

    // If the user already completed this exact Daily Puzzle and isn't clicking Practice Replay, show their official completed state!
    if (saved && state.players[0]) {
      const p = state.players[0];
      p.score = saved.score || 0;
      p.sniperShots = saved.sniperShots || [];
      p.picks = saved.picks || [];
      p.bestPull = saved.bestPull || null;
      p.eliminated = true;
      if (Array.isArray(saved.revealedEntries)) {
        state.revealedRanks = new Map(saved.revealedEntries);
      }
      if (Array.isArray(saved.pickHistory)) {
        state.pickHistory = saved.pickHistory;
      }
      const alreadyDismissed = hasDismissedDailySummary(sport, submode, activeDate);
      finishGame(
        `You already completed this official Daily Puzzle (${activeDate})! Copy your grid below or click Practice Replay.`,
        { autoOpenModal: !alreadyDismissed, silentSfx: true }
      );
    }
  }

  // 10. Couch Series Tracker (Pass-and-Play Multi-Game Session Standings)
  function getCouchSeries() {
    try {
      const raw = localStorage.getItem("pinpoint_couch_series_v1");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // Ignore
    }
    return {
      matchesPlayed: 0,
      players: {},
      deepestPull: null
    };
  }

  function saveCouchSeries(series) {
    try {
      localStorage.setItem("pinpoint_couch_series_v1", JSON.stringify(series));
    } catch (e) {
      // Ignore
    }
  }

  function resetCouchSeries() {
    const empty = { matchesPlayed: 0, players: {}, deepestPull: null };
    saveCouchSeries(empty);
    state.seriesRecordedForMatch = false;
    state.previousSeriesSnapshot = null;
    renderCouchSeriesBar();
  }

  function recordMatchInCouchSeries(winner, cat) {
    const currentSeries = getCouchSeries();
    state.previousSeriesSnapshot = JSON.parse(JSON.stringify(currentSeries));
    state.seriesRecordedForMatch = true;

    currentSeries.matchesPlayed = (currentSeries.matchesPlayed || 0) + 1;
    state.players.forEach((p) => {
      const key = p.name.trim();
      if (!currentSeries.players[key]) {
        currentSeries.players[key] = { name: key, wins: 0, totalPts: 0, snipes90: 0 };
      }
      const entry = currentSeries.players[key];
      if (winner && p.id === winner.id) {
        entry.wins += 1;
      }
      if (state.mode === "top100") {
        entry.totalPts += p.score;
        const s90 = (p.picks || []).filter((pk) => pk && pk.rank >= 90 && pk.rank <= 100).length;
        entry.snipes90 += s90;
      }
      if (p.bestPull && p.bestPull.rank) {
        if (!currentSeries.deepestPull || p.bestPull.rank >= currentSeries.deepestPull.rank) {
          currentSeries.deepestPull = {
            rank: p.bestPull.rank,
            name: p.bestPull.name,
            picker: p.name,
            catTitle: cat.title
          };
        }
      }
    });

    saveCouchSeries(currentSeries);
  }

  function renderCouchSeriesBar() {
    const bar = document.getElementById("couchSeriesBar");
    if (!bar) return;
    const series = getCouchSeries();

    if (state.isDaily || (state.playerCount <= 1 && (!series.matchesPlayed || series.matchesPlayed === 0))) {
      bar.classList.add("hidden");
      return;
    }

    bar.classList.remove("hidden");
    const activeNames = state.players.map((p) => p.name.trim());
    const entries = activeNames.map((n, idx) => {
      const d = (series.players && series.players[n]) || { name: n, wins: 0, totalPts: 0, snipes90: 0 };
      return { ...d, badgeIdx: idx + 1 };
    });

    const maxWins = Math.max(0, ...entries.map((e) => e.wins));

    const pillsHtml = entries
      .map((e) => {
        const isLeader = maxWins > 0 && e.wins === maxWins;
        return `
          <div class="cs-player-pill ${isLeader ? "series-leader" : ""}">
            <span class="p-badge p-${e.badgeIdx}" style="width:20px;height:20px;font-size:0.65rem;border-radius:5px;">P${e.badgeIdx}</span>
            <strong>${isLeader ? "👑 " : ""}${escapeHtml(e.name)}</strong>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--sport-secondary);">${e.wins}W</span>
            <span style="color:var(--text-secondary);font-size:0.7rem;">(${formatNumber(e.totalPts)} pts${e.snipes90 > 0 ? ` • ${e.snipes90}🎯` : ""})</span>
          </div>
        `;
      })
      .join("");

    const deepestHtml = series.deepestPull
      ? `<span class="cs-deepest" title="${escapeHtml(series.deepestPull.catTitle)}">🔥 Night's Best: <strong>#${series.deepestPull.rank} ${escapeHtml(series.deepestPull.name)}</strong> (${escapeHtml(series.deepestPull.picker)})</span>`
      : `<span style="font-size:0.74rem;color:var(--text-secondary);">Play matches to track your Couch Series!</span>`;

    bar.innerHTML = `
      <div class="cs-left">
        <span class="cs-title-badge">🛋️ COUCH SERIES (${series.matchesPlayed || 0} ${series.matchesPlayed === 1 ? "GAME" : "GAMES"})</span>
        <div class="cs-standings-pills">
          ${pillsHtml}
        </div>
      </div>
      <div class="cs-right">
        ${deepestHtml}
        <button type="button" class="cs-reset-btn" id="resetCouchSeriesBtn" title="Reset Couch Series Wins & Stats">🔄 Reset Series</button>
      </div>
    `;

    const resetBtn = document.getElementById("resetCouchSeriesBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        resetCouchSeries();
      });
    }
  }

  // 10b. Progressive 3-Stage Deep-Bag Clue Generator
  function showDeepBagClue(forceNewRank = false) {
    const cat = getActiveCategory();
    const candidates = cat.players.filter(
      (p) => p.rank >= Math.max(1, state.cutoff - 25) && p.rank <= state.cutoff && !state.revealedRanks.has(p.rank)
    );
    if (candidates.length === 0) return;

    let pick = null;
    if (!forceNewRank && state.activeClueRank && !state.revealedRanks.has(state.activeClueRank)) {
      pick = candidates.find((p) => p.rank === state.activeClueRank);
    }

    if (!pick) {
      pick = candidates[Math.floor(Math.random() * candidates.length)];
      state.activeClueRank = pick.rank;
      state.activeClueStage = 1;
    } else if (!forceNewRank) {
      state.activeClueStage = Math.min(3, (state.activeClueStage || 1) + 1);
    }

    renderActiveClueToast(pick, cat);
  }

  function renderActiveClueToast(pick, cat) {
    const toast = document.getElementById("clueToast");
    const badge = document.getElementById("clueStageBadge");
    const text = document.getElementById("clueText");
    const nextBtn = document.getElementById("nextClueStageBtn");
    if (!toast || !text || !pick) return;

    const stage = state.activeClueStage || 1;
    const initials = pick.name
      .split(" ")
      .map((part) => part[0] + ".")
      .join(" ");

    if (badge) badge.textContent = `💡 HINT ${stage}/3`;

    if (stage === 1) {
      text.innerHTML = `<strong>Target Rank #${pick.rank} (+${pick.rank} PTS):</strong> Era played: <strong>${escapeHtml(pick.era)}</strong>`;
      if (nextBtn) {
        nextBtn.textContent = "Reveal Team (2/3) →";
        nextBtn.disabled = false;
      }
    } else if (stage === 2) {
      text.innerHTML = `<strong>Target Rank #${pick.rank} (+${pick.rank} PTS):</strong> Era: <strong>${escapeHtml(pick.era)}</strong> • Team(s): <strong>${escapeHtml(pick.team)}</strong>`;
      if (nextBtn) {
        nextBtn.textContent = "Reveal Stat & Initials (3/3) →";
        nextBtn.disabled = false;
      }
    } else {
      text.innerHTML = `<strong>Target Rank #${pick.rank} (${formatNumber(pick.stat)} ${cat.unit}):</strong> Team(s): <strong>${escapeHtml(pick.team)}</strong> (${escapeHtml(pick.era)}) • Initials: <strong>${initials}</strong>`;
      if (nextBtn) {
        nextBtn.textContent = "All 3 Hints Revealed ✓";
        nextBtn.disabled = true;
      }
    }

    toast.classList.remove("hidden");
  }

  // 10c. Mystery Bag Randomizer & Shareable Custom Challenge Links
  function rollMysteryBag(prefix = "explorer", launchImmediately = true) {
    const activeSportBtn = document.querySelector("#setupSportSelect .seg-btn.active");
    const sp = prefix === "setup" && activeSportBtn ? activeSportBtn.dataset.val : state.sport;
    const metrics = SPORT_METRICS[sp] || SPORT_METRICS.NBA;
    const minSportYr = sp === "NFL" ? 2000 : 1996;

    const timeframes = ["alltime", "since", "since", "season", "range", "peak"];
    const constraints = ["none", "none", "active", "retired", "antichalk", "journeyman", "oneteam"];

    let chosenCfg = null;
    let builtCat = null;

    for (let attempt = 0; attempt < 25; attempt++) {
      const m = metrics[Math.floor(Math.random() * metrics.length)];
      const tf = timeframes[Math.floor(Math.random() * timeframes.length)];
      let yr = 2016;
      let yrEnd = 2024;
      let con = "none";

      if (tf === "since") {
        const sinceYears = [2010, 2012, 2014, 2015, 2016, 2018, 2020];
        yr = sinceYears[Math.floor(Math.random() * sinceYears.length)];
        con = Math.random() < 0.35 ? "antichalk" : "none";
      } else if (tf === "season") {
        yr = Math.floor(Math.random() * (2024 - Math.max(2004, minSportYr) + 1)) + Math.max(2004, minSportYr);
        con = "none";
      } else if (tf === "range") {
        const spans = [
          [2000, 2009],
          [2010, 2019],
          [2015, 2024],
          [2005, 2014]
        ];
        const pair = spans[Math.floor(Math.random() * spans.length)];
        yr = Math.max(minSportYr, pair[0]);
        yrEnd = pair[1];
        con = Math.random() < 0.3 ? "antichalk" : "none";
      } else if (tf === "alltime") {
        con = constraints[Math.floor(Math.random() * constraints.length)];
      } else if (tf === "peak") {
        con = Math.random() < 0.3 ? "active" : "none";
      }

      const candidateCfg = {
        sport: sp,
        metricKey: m.key,
        timeframe: tf,
        year: yr,
        yearEnd: yrEnd,
        team: "ALL",
        constraint: con
      };
      const testCat = buildDynamicCategory(candidateCfg);
      if (testCat && testCat.players && testCat.players.length >= 100) {
        chosenCfg = candidateCfg;
        builtCat = testCat;
        break;
      }
    }

    if (!chosenCfg || !builtCat) return;

    // Sync controls for prefix
    const statSel = document.getElementById(`${prefix}StatSelect`);
    const tfSel = document.getElementById(`${prefix}TimeframeSelect`);
    const teamSel = document.getElementById(`${prefix}TeamSelect`);
    const conSel = document.getElementById(`${prefix}ConstraintSelect`);
    if (statSel) statSel.value = chosenCfg.metricKey;
    if (tfSel) tfSel.value = chosenCfg.timeframe;
    updateYearVisibility(prefix, sp);
    const yrSel = document.getElementById(`${prefix}YearSelect`);
    const yrEndSel = document.getElementById(`${prefix}YearEndSelect`);
    if (yrSel && chosenCfg.year) yrSel.value = String(chosenCfg.year);
    if (yrEndSel && chosenCfg.yearEnd) yrEndSel.value = String(chosenCfg.yearEnd);
    if (teamSel) teamSel.value = "ALL";
    if (conSel) conSel.value = chosenCfg.constraint;

    if (prefix === "setup") {
      updateSetupTargetPreview();
    }

    if (launchImmediately) {
      if (builtCat.id === "__custom__") {
        state.customCategory = builtCat;
        state.categoryId = "__custom__";
      } else {
        state.customCategory = null;
        state.categoryId = builtCat.id;
      }
      state.targetGoal = builtCat.defaultTarget;
      state.isDaily = false;
      startMatch();
      sfx.playDeepPull();
      showFeedbackBanner({
        tierClass: "tier-deep",
        rankBadge: "🎲",
        title: `MYSTERY BAG ROLLED: ${builtCat.title}`,
        subtitle: builtCat.subtitle,
        pointsText: "LET'S COOK"
      });
    }
  }

  function buildChallengeShareUrl() {
    const url = new URL(window.location.href.split("?")[0]);
    if (state.isDaily) {
      url.searchParams.set("daily", "1");
      url.searchParams.set("sport", state.sport);
      url.searchParams.set("sub", state.dailySubmode);
      url.searchParams.set("date", state.dailyDateStr || getTodayString());
      return url.toString();
    }
    url.searchParams.set("sport", state.sport);
    url.searchParams.set("mode", state.mode);
    const statSel = document.getElementById("explorerStatSelect");
    const tfSel = document.getElementById("explorerTimeframeSelect");
    const yrSel = document.getElementById("explorerYearSelect");
    const yrEndSel = document.getElementById("explorerYearEndSelect");
    const teamSel = document.getElementById("explorerTeamSelect");
    const conSel = document.getElementById("explorerConstraintSelect");
    if (statSel && statSel.value) url.searchParams.set("stat", statSel.value);
    if (tfSel && tfSel.value) url.searchParams.set("tf", tfSel.value);
    if (yrSel && yrSel.value && (tfSel.value === "since" || tfSel.value === "season" || tfSel.value === "range")) {
      url.searchParams.set("yr", yrSel.value);
    }
    if (yrEndSel && yrEndSel.value && tfSel.value === "range") {
      url.searchParams.set("yrend", yrEndSel.value);
    }
    if (teamSel && teamSel.value && teamSel.value !== "ALL") {
      url.searchParams.set("team", teamSel.value);
    }
    if (conSel && conSel.value && conSel.value !== "none") {
      url.searchParams.set("con", conSel.value);
    }
    return url.toString();
  }

  function applyUrlChallengeParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const sp = (params.get("sport") || "").toUpperCase();
      if (["NBA", "NFL", "MLB"].includes(sp)) {
        state.sport = sp;
      }
      populateExplorerControls(state.sport);
      populateSetupCategoryDropdown(state.sport);

      if (params.get("daily") === "1") {
        const sub = params.get("sub") === "target" ? "target" : "sniper";
        const dt = params.get("date") || getTodayString();
        launchDailyChallenge(state.sport, sub, false, dt);
        return true;
      }

      if (params.has("stat") || params.has("tf") || params.has("con") || params.has("team") || params.has("mode")) {
        const modeParam = params.get("mode");
        if (modeParam === "target" || modeParam === "top100") {
          state.mode = modeParam;
        }
        const statEl = document.getElementById("explorerStatSelect");
        const tfEl = document.getElementById("explorerTimeframeSelect");
        const teamEl = document.getElementById("explorerTeamSelect");
        const conEl = document.getElementById("explorerConstraintSelect");
        if (statEl && params.get("stat")) statEl.value = params.get("stat");
        if (tfEl && params.get("tf")) tfEl.value = params.get("tf");
        updateYearVisibility("explorer", state.sport);
        const yrEl = document.getElementById("explorerYearSelect");
        const yrEndEl = document.getElementById("explorerYearEndSelect");
        if (yrEl && params.get("yr")) yrEl.value = params.get("yr");
        if (yrEndEl && params.get("yrend")) yrEndEl.value = params.get("yrend");
        if (teamEl && params.get("team")) teamEl.value = params.get("team");
        if (conEl && params.get("con")) conEl.value = params.get("con");
        applyExplorerSelection();
        return true;
      }
    } catch (e) {
      // Ignore URL parse issues
    }
    return false;
  }

  // 11. Custom Game Setup & Banner Filter Sync
  function buildCategoryFromPrefix(prefix, sport) {
    const statSel = document.getElementById(`${prefix}StatSelect`);
    const tfSel = document.getElementById(`${prefix}TimeframeSelect`);
    const yrSel = document.getElementById(`${prefix}YearSelect`);
    const yrEndSel = document.getElementById(`${prefix}YearEndSelect`);
    const teamSel = document.getElementById(`${prefix}TeamSelect`);
    const conSel = document.getElementById(`${prefix}ConstraintSelect`);
    return buildDynamicCategory({
      sport,
      metricKey: statSel ? statSel.value : "pts",
      timeframe: tfSel ? tfSel.value : "alltime",
      year: yrSel ? yrSel.value : 2020,
      yearEnd: yrEndSel ? yrEndSel.value : 2025,
      team: teamSel ? teamSel.value : "ALL",
      constraint: conSel ? conSel.value : "none"
    });
  }

  function updateSetupTargetPreview() {
    const activeSportBtn = document.querySelector("#setupSportSelect .seg-btn.active");
    const sp = activeSportBtn ? activeSportBtn.dataset.val : state.sport;
    const dynCat = buildCategoryFromPrefix("setup", sp);
    const targetInput = document.getElementById("setupTargetInput");
    if (targetInput && dynCat) {
      targetInput.value = dynCat.defaultTarget;
    }
  }

  function populateSetupCategoryDropdown(sport) {
    populateFilterControls("setup", sport);
    // Sync current explorer selections into setup if same sport
    if (sport === state.sport) {
      ["StatSelect", "TimeframeSelect"].forEach((suffix) => {
        const expEl = document.getElementById(`explorer${suffix}`);
        const setEl = document.getElementById(`setup${suffix}`);
        if (expEl && setEl) setEl.value = expEl.value;
      });
      updateYearVisibility("setup", sport);
      ["YearSelect", "YearEndSelect", "TeamSelect", "ConstraintSelect"].forEach((suffix) => {
        const expEl = document.getElementById(`explorer${suffix}`);
        const setEl = document.getElementById(`setup${suffix}`);
        if (expEl && setEl && expEl.value) setEl.value = expEl.value;
      });
    }
    updateSetupTargetPreview();
  }

  function applyExplorerSelection() {
    const dynCat = buildCategoryFromPrefix("explorer", state.sport);
    if (dynCat.id === "__custom__") {
      state.customCategory = dynCat;
      state.categoryId = "__custom__";
    } else {
      state.customCategory = null;
      state.categoryId = dynCat.id;
    }
    state.targetGoal = dynCat.defaultTarget;
    state.isDaily = false;
    startMatch();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const RULES_SEEN_STORAGE_KEY = "statsnipes_rules_seen_v1";

  function hasSeenRulesModal() {
    try {
      return localStorage.getItem(RULES_SEEN_STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markRulesModalSeen() {
    try {
      localStorage.setItem(RULES_SEEN_STORAGE_KEY, "1");
    } catch (e) {
      // Ignore storage errors in private browsing
    }
  }

  function setRulesModalTab(tabName = "daily") {
    const activeTab = tabName === "couch" ? "couch" : "daily";
    const dailyBtn = document.getElementById("rulesTabDailyBtn");
    const couchBtn = document.getElementById("rulesTabCouchBtn");
    const dailyPane = document.getElementById("rulesDailyPane");
    const couchPane = document.getElementById("rulesCouchPane");
    if (dailyBtn) dailyBtn.classList.toggle("active", activeTab === "daily");
    if (couchBtn) couchBtn.classList.toggle("active", activeTab === "couch");
    if (dailyPane) dailyPane.classList.toggle("hidden", activeTab !== "daily");
    if (couchPane) couchPane.classList.toggle("hidden", activeTab !== "couch");
  }

  function openRulesModal(tabName) {
    const chosen = tabName || (state.isDaily ? "daily" : "couch");
    setRulesModalTab(chosen);
    const modal = document.getElementById("rulesModal");
    if (modal) modal.classList.remove("hidden");
  }

  function closeRulesModal(markSeen = true) {
    if (markSeen) markRulesModalSeen();
    const modal = document.getElementById("rulesModal");
    if (modal) modal.classList.add("hidden");
  }

  // 12. Wire Up Event Listeners
  function bindEvents() {
    // Sport Switcher Pills
    document.querySelectorAll(".sport-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sp = btn.dataset.sport;
        state.sport = sp;
        state.customCategory = null;
        populateExplorerControls(sp);
        const firstCat = ALL_CATEGORIES.find((c) => c.sport === sp);
        if (firstCat) {
          state.categoryId = firstCat.id;
          state.targetGoal = firstCat.defaultTarget;
        }
        if (state.isDaily) {
          launchDailyChallenge(sp);
        } else {
          startMatch();
        }
      });
    });

    // Inline Category & Filter Bar Events (in Banner)
    const expTfSel = document.getElementById("explorerTimeframeSelect");
    if (expTfSel) {
      expTfSel.addEventListener("change", () => {
        updateYearVisibility("explorer", state.sport);
        applyExplorerSelection();
      });
    }
    ["explorerStatSelect", "explorerYearSelect", "explorerYearEndSelect", "explorerTeamSelect", "explorerConstraintSelect"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => {
          applyExplorerSelection();
        });
      }
    });

    // Setup Panel Stat/Timeframe/Year/Constraint Events
    const setupTfSel = document.getElementById("setupTimeframeSelect");
    if (setupTfSel) {
      setupTfSel.addEventListener("change", () => {
        const activeSportBtn = document.querySelector("#setupSportSelect .seg-btn.active");
        const sp = activeSportBtn ? activeSportBtn.dataset.val : state.sport;
        updateYearVisibility("setup", sp);
        updateSetupTargetPreview();
      });
    }
    ["setupStatSelect", "setupYearSelect", "setupYearEndSelect", "setupTeamSelect", "setupConstraintSelect"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => {
          updateSetupTargetPreview();
        });
      }
    });

    // Mode Navigation Tabs
    document.getElementById("tabTop100").addEventListener("click", () => {
      state.isDaily = false;
      state.dailyPracticeReplay = false;
      state.mode = "top100";
      state.maxLives = parseInt(document.getElementById("setupLivesSelect").value, 10) || 3;
      document.getElementById("customSetupPanel").classList.add("hidden");
      applyExplorerSelection();
    });

    document.getElementById("tabTarget").addEventListener("click", () => {
      state.isDaily = false;
      state.dailyPracticeReplay = false;
      state.mode = "target";
      document.getElementById("customSetupPanel").classList.add("hidden");
      applyExplorerSelection();
    });

    document.getElementById("tabDaily").addEventListener("click", () => {
      state.dailyDateStr = state.dailyDateStr || getTodayString();
      launchDailyChallenge(state.sport, state.dailySubmode || "sniper", false, state.dailyDateStr);
    });

    const archiveSel = document.getElementById("dailyArchiveSelect");
    if (archiveSel) {
      archiveSel.addEventListener("change", (e) => {
        const chosenDate = e.target.value || getTodayString();
        state.dailyDateStr = chosenDate;
        launchDailyChallenge(state.sport, state.dailySubmode || "sniper", false, chosenDate);
      });
    }

    // Mystery Bag & Share Challenge Link & Mobile Filter Drawer Toggle
    const mysBtn = document.getElementById("mysteryBagBtn");
    if (mysBtn) {
      mysBtn.addEventListener("click", () => {
        rollMysteryBag("explorer", true);
      });
    }
    const setupMysBtn = document.getElementById("setupMysteryBagBtn");
    if (setupMysBtn) {
      setupMysBtn.addEventListener("click", () => {
        rollMysteryBag("setup", false);
      });
    }
    const shareLinkBtn = document.getElementById("shareChallengeLinkBtn");
    if (shareLinkBtn) {
      shareLinkBtn.addEventListener("click", (e) => {
        const shareUrl = buildChallengeShareUrl();
        shareOrCopyPayload({
          shareData: {
            title: "StatSnipes Challenge",
            text: "Can you beat this StatSnipes challenge?",
            url: shareUrl
          },
          clipboardText: shareUrl,
          btnEl: e.currentTarget,
          sharedLabel: "✅ Shared!",
          copiedLabel: "✅ Link Copied!"
        });
      });
    }
    const mobFilterBtn = document.getElementById("mobileFilterToggleBtn");
    if (mobFilterBtn) {
      mobFilterBtn.addEventListener("click", () => {
        const expBar = document.getElementById("constraintExplorerBar");
        if (!expBar) return;
        const isOpen = expBar.classList.toggle("mobile-open");
        mobFilterBtn.setAttribute("aria-expanded", String(isOpen));
        mobFilterBtn.textContent = isOpen ? "⚙️ Filters ▴" : "⚙️ Filters ▾";
      });
    }

    document.getElementById("tabCustom").addEventListener("click", () => {
      const panel = document.getElementById("customSetupPanel");
      panel.classList.toggle("hidden");
      document.querySelectorAll("#setupSportSelect .seg-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.val === state.sport);
      });
      populateSetupCategoryDropdown(state.sport);
      renderHeaderState();
    });

    document.getElementById("closeSetupBtn").addEventListener("click", () => {
      document.getElementById("customSetupPanel").classList.add("hidden");
      renderHeaderState();
    });

    // Sound Toggle
    document.getElementById("soundToggleBtn").addEventListener("click", (e) => {
      sfx.enabled = !sfx.enabled;
      e.currentTarget.textContent = sfx.enabled ? "🔊" : "🔇";
    });

    // Rules Modal
    document.getElementById("howToPlayBtn").addEventListener("click", () => {
      openRulesModal();
    });
    document.getElementById("closeRulesBtn").addEventListener("click", () => {
      closeRulesModal(true);
    });
    document.getElementById("gotItRulesBtn").addEventListener("click", () => {
      closeRulesModal(true);
    });
    const rulesDailyTabBtn = document.getElementById("rulesTabDailyBtn");
    if (rulesDailyTabBtn) {
      rulesDailyTabBtn.addEventListener("click", () => setRulesModalTab("daily"));
    }
    const rulesCouchTabBtn = document.getElementById("rulesTabCouchBtn");
    if (rulesCouchTabBtn) {
      rulesCouchTabBtn.addEventListener("click", () => setRulesModalTab("couch"));
    }
    const rulesBackdrop = document.getElementById("rulesModal");
    if (rulesBackdrop) {
      rulesBackdrop.addEventListener("click", (e) => {
        if (e.target === rulesBackdrop) {
          closeRulesModal(true);
        }
      });
    }

    // New Match Quick Button (Practice Replay in Daily, Fresh Match in Endless)
    document.getElementById("newGameQuickBtn").addEventListener("click", () => {
      if (state.isDaily) {
        launchDailyChallenge(state.sport, state.dailySubmode, true, state.dailyDateStr);
      } else {
        startMatch();
      }
    });

    // Clue, Undo, Redemption Toggle, Show Miss Rank Toggle & Reveal Board Buttons
    const undoBtn = document.getElementById("undoGuessBtn");
    if (undoBtn) {
      undoBtn.addEventListener("click", () => {
        undoLastAction();
      });
    }
    const undoModalBtn = document.getElementById("undoLastModalBtn");
    if (undoModalBtn) {
      undoModalBtn.addEventListener("click", () => {
        undoLastAction();
      });
    }
    const redQuickBtn = document.getElementById("toggleRedemptionQuickBtn");
    if (redQuickBtn) {
      redQuickBtn.addEventListener("click", () => {
        state.redemptionEnabled = !state.redemptionEnabled;
        const setupCheck = document.getElementById("setupRedemptionCheck");
        if (setupCheck) setupCheck.checked = state.redemptionEnabled;
        renderCategoryBanner();
        renderScoreboard();
        renderTurnPrompt();
      });
    }
    const missRankQuickBtn = document.getElementById("toggleShowMissRankBtn");
    if (missRankQuickBtn) {
      missRankQuickBtn.addEventListener("click", () => {
        state.showMissRank = !state.showMissRank;
        const setupCheck = document.getElementById("setupShowMissRankCheck");
        if (setupCheck) setupCheck.checked = state.showMissRank;
        renderCategoryBanner();
      });
    }
    document.getElementById("getClueBtn").addEventListener("click", () => {
      showDeepBagClue(false);
    });
    const nextClueBtn = document.getElementById("nextClueStageBtn");
    if (nextClueBtn) {
      nextClueBtn.addEventListener("click", () => {
        showDeepBagClue(false);
      });
    }
    const newClueRankBtn = document.getElementById("newClueRankBtn");
    if (newClueRankBtn) {
      newClueRankBtn.addEventListener("click", () => {
        showDeepBagClue(true);
      });
    }
    document.getElementById("closeClueBtn").addEventListener("click", () => {
      document.getElementById("clueToast").classList.add("hidden");
    });

    document.getElementById("endRevealBtn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (state.isDaily && state.gameOver) {
        state.boardRevealedPostgame = true;
        state.boardFilter = "all";
        renderCategoryBanner();
        renderMainArena();
        return;
      }
      if (state.isDaily && !state.dailyPracticeReplay && !btn.getAttribute("data-armed")) {
        btn.setAttribute("data-armed", "1");
        btn.classList.add("armed-danger");
        btn.textContent = "⚠️ Tap Again to Forfeit";
        setTimeout(() => {
          if (btn.getAttribute("data-armed")) {
            btn.removeAttribute("data-armed");
            btn.classList.remove("armed-danger");
            btn.textContent = "🏳️ Give Up";
          }
        }, 3500);
        return;
      }
      btn.removeAttribute("data-armed");
      btn.classList.remove("armed-danger");
      state.boardRevealedPostgame = true;
      finishGame("Board revealed! Check out every player in the Top 100 below.");
      renderMainArena();
    });

    // Search Input & Keyboard Navigation
    const searchInput = document.getElementById("playerSearchInput");
    searchInput.addEventListener("focus", () => {
      if (window.innerWidth <= 768) {
        const cmdSec = document.getElementById("commandCenterSection");
        if (cmdSec) {
          setTimeout(() => {
            cmdSec.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 120);
        }
      }
    });
    searchInput.addEventListener("input", (e) => {
      updateAutocomplete(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        if (state.acMatches.length > 0) {
          e.preventDefault();
          state.acHighlightIndex = (state.acHighlightIndex + 1) % state.acMatches.length;
          renderAutocompleteItems();
        }
      } else if (e.key === "ArrowUp") {
        if (state.acMatches.length > 0) {
          e.preventDefault();
          state.acHighlightIndex =
            (state.acHighlightIndex - 1 + state.acMatches.length) % state.acMatches.length;
          renderAutocompleteItems();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (state.acMatches.length > 0 && state.acHighlightIndex >= 0) {
          handleGuessSubmission(state.acMatches[state.acHighlightIndex].name);
        } else {
          handleGuessSubmission(searchInput.value);
        }
      } else if (e.key === "Escape") {
        hideAutocomplete();
      }
    });

    document.getElementById("submitGuessBtn").addEventListener("click", () => {
      if (state.acMatches.length > 0 && state.acHighlightIndex >= 0) {
        handleGuessSubmission(state.acMatches[state.acHighlightIndex].name);
      } else {
        handleGuessSubmission(searchInput.value);
      }
    });

    document.addEventListener("click", (e) => {
      if (!document.getElementById("searchBoxWrapper").contains(e.target)) {
        hideAutocomplete();
      }
    });

    // Board Filters
    document.querySelectorAll(".board-filters .filter-chip[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".board-filters .filter-chip[data-filter]").forEach((b) =>
          b.classList.remove("active")
        );
        btn.classList.add("active");
        state.boardFilter = btn.getAttribute("data-filter");
        renderTop100Board();
      });
    });

    document.getElementById("toggleBoardCluesBtn").addEventListener("click", () => {
      state.boardHints = !state.boardHints;
      renderTop100Board();
    });

    // Game Over Modal Actions
    document.getElementById("playAgainModalBtn").addEventListener("click", () => {
      if (state.isDaily) {
        launchDailyChallenge(state.sport, state.dailySubmode, true);
      } else {
        startMatch();
      }
    });

    document.getElementById("inspectBoardAfterBtn").addEventListener("click", () => {
      state.boardRevealedPostgame = true;
      state.boardFilter = "all";
      closeGameOverModal(true);
      renderCategoryBanner();
      renderMainArena();
    });

    document.getElementById("shareScoreBtn").addEventListener("click", (e) => {
      copyCurrentResultText(e.currentTarget);
    });

    const closeGameOverBtn = document.getElementById("closeGameOverBtn");
    if (closeGameOverBtn) {
      closeGameOverBtn.addEventListener("click", () => {
        closeGameOverModal(true);
      });
    }

    const gameOverBackdrop = document.getElementById("gameOverModal");
    if (gameOverBackdrop) {
      gameOverBackdrop.addEventListener("click", (e) => {
        if (e.target === gameOverBackdrop) {
          closeGameOverModal(true);
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const goModal = document.getElementById("gameOverModal");
        if (goModal && !goModal.classList.contains("hidden")) {
          closeGameOverModal(true);
        }
        const rulesModal = document.getElementById("rulesModal");
        if (rulesModal && !rulesModal.classList.contains("hidden")) {
          closeRulesModal(true);
        }
      }
    });

    // Custom Setup Panel Controls
    document.querySelectorAll("#setupSportSelect .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#setupSportSelect .seg-btn").forEach((b) =>
          b.classList.remove("active")
        );
        btn.classList.add("active");
        populateSetupCategoryDropdown(btn.dataset.val);
      });
    });

    document.querySelectorAll("#setupModeSelect .radio-card").forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll("#setupModeSelect .radio-card").forEach((c) =>
          c.classList.remove("active")
        );
        card.classList.add("active");
        const m = card.dataset.val;
        document.getElementById("top100RulesGroup").classList.toggle("hidden", m !== "top100");
        document.getElementById("targetRulesGroup").classList.toggle("hidden", m !== "target");
      });
    });

    document.querySelectorAll("#setupPlayerCount .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#setupPlayerCount .seg-btn").forEach((b) =>
          b.classList.remove("active")
        );
        btn.classList.add("active");
        const count = parseInt(btn.dataset.val, 10);
        document.querySelectorAll("#playerNameInputs .player-input-row").forEach((row, idx) => {
          row.classList.toggle("hidden", idx >= count);
        });
      });
    });

    // Launch Custom Match Button
    document.getElementById("startCustomGameBtn").addEventListener("click", () => {
      const activeSportBtn = document.querySelector("#setupSportSelect .seg-btn.active");
      const activeModeCard = document.querySelector("#setupModeSelect .radio-card.active");
      const activePlayerCountBtn = document.querySelector("#setupPlayerCount .seg-btn.active");

      state.isDaily = false;
      state.sport = activeSportBtn ? activeSportBtn.dataset.val : "NBA";
      state.mode = activeModeCard ? activeModeCard.dataset.val : "top100";

      // Build category from Setup filter controls and sync Banner controls
      const dynCat = buildCategoryFromPrefix("setup", state.sport);
      if (dynCat.id === "__custom__") {
        state.customCategory = dynCat;
        state.categoryId = "__custom__";
      } else {
        state.customCategory = null;
        state.categoryId = dynCat.id;
      }
      populateExplorerControls(state.sport);
      ["StatSelect", "TimeframeSelect"].forEach((suffix) => {
        const setEl = document.getElementById(`setup${suffix}`);
        const expEl = document.getElementById(`explorer${suffix}`);
        if (setEl && expEl) expEl.value = setEl.value;
      });
      updateYearVisibility("explorer", state.sport);
      ["YearSelect", "YearEndSelect", "TeamSelect", "ConstraintSelect"].forEach((suffix) => {
        const setEl = document.getElementById(`setup${suffix}`);
        const expEl = document.getElementById(`explorer${suffix}`);
        if (setEl && expEl && setEl.value) expEl.value = setEl.value;
      });

      state.maxLives = parseInt(document.getElementById("setupLivesSelect").value, 10) || 3;
      state.cutoff = parseInt(document.getElementById("setupCutoffSelect").value, 10) || 100;
      state.winCondition = document.getElementById("setupWinCondSelect").value;
      const redCheck = document.getElementById("setupRedemptionCheck");
      if (redCheck) state.redemptionEnabled = redCheck.checked;
      const missRankCheck = document.getElementById("setupShowMissRankCheck");
      if (missRankCheck) state.showMissRank = missRankCheck.checked;
      state.targetGoal = parseInt(document.getElementById("setupTargetInput").value, 10) || 100000;
      state.maxPicks = parseInt(document.getElementById("setupPicksSelect").value, 10) || 5;
      state.bustRule = document.getElementById("setupBustRuleSelect").value;
      state.shotClockSeconds = parseInt(document.getElementById("setupTimerSelect").value, 10) || 0;
      state.boardHints = document.getElementById("setupBoardHintSelect").value === "team";

      state.playerCount = activePlayerCountBtn ? parseInt(activePlayerCountBtn.dataset.val, 10) : 1;
      document.querySelectorAll(".player-name-field").forEach((field, idx) => {
        state.playerNamesConfig[idx] = field.value.trim() || `Player ${idx + 1}`;
      });

      document.getElementById("customSetupPanel").classList.add("hidden");
      startMatch();
    });
  }

  // Init — land directly on Today's Daily Challenge by default (or load shared URL challenge)
  populateExplorerControls("NBA");
  populateSetupCategoryDropdown("NBA");
  bindEvents();
  if (!applyUrlChallengeParams()) {
    launchDailyChallenge(state.sport || "NBA", "sniper", false, getTodayString());
  }
  if (!hasSeenRulesModal()) {
    openRulesModal(state.isDaily ? "daily" : "couch");
  }
})();
