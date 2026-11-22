// Cloudflare Pages Function: /api/room
// Powers Online Couch Mode multiplayer rooms backed by Cloudflare D1

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS online_rooms (
        room_code TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      )`
    )
    .run();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env || !env.DB) {
      return jsonRes({ error: "D1 database binding 'DB' not configured" }, 503);
    }
    await ensureTable(env.DB);

    const url = new URL(request.url);
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    const knownVersion = Number(url.searchParams.get("v") || "0");

    if (!code) {
      return jsonRes({ error: "Missing room code" }, 400);
    }

    const row = await env.DB.prepare(
      `SELECT room_code, state_json, version, updated_at FROM online_rooms WHERE room_code = ?`
    )
      .bind(code)
      .first();

    if (!row) {
      return jsonRes({ error: "Room not found or expired" }, 404);
    }

    if (knownVersion > 0 && row.version === knownVersion) {
      return jsonRes({ unchanged: true, roomCode: row.room_code, version: row.version });
    }

    return jsonRes({
      roomCode: row.room_code,
      version: row.version,
      state: JSON.parse(row.state_json)
    });
  } catch (err) {
    return jsonRes({ error: err.message || "Failed to fetch room" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env || !env.DB) {
      return jsonRes({ error: "D1 database binding 'DB' not configured" }, 503);
    }
    await ensureTable(env.DB);

    const body = await request.json();
    const { action } = body || {};

    if (action === "create") {
      const { clientId, playerName, config, maxPlayers } = body || {};
      if (!clientId || !config) {
        return jsonRes({ error: "Missing clientId or config" }, 400);
      }

      // Clean up rooms older than 24 hours opportunistically
      const cutoffTs = Date.now() - 24 * 60 * 60 * 1000;
      await env.DB.prepare(`DELETE FROM online_rooms WHERE updated_at < ?`).bind(cutoffTs).run();

      let roomCode = generateRoomCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await env.DB.prepare(
          `SELECT room_code FROM online_rooms WHERE room_code = ?`
        )
          .bind(roomCode)
          .first();
        if (!existing) break;
        roomCode = generateRoomCode();
      }

      const safeName = String(playerName || "Host").trim().slice(0, 18) || "Host";
      const safeMax = Math.max(2, Math.min(4, Number(maxPlayers) || 4));

      const initialState = {
        roomCode,
        hostClientId: String(clientId).slice(0, 64),
        status: "lobby",
        maxPlayers: safeMax,
        config,
        players: [
          {
            id: 0,
            clientId: String(clientId).slice(0, 64),
            name: safeName,
            score: 0,
            lives: config.maxLives || 3,
            busted: false,
            eliminated: false,
            finalRedemptionAvailable: false,
            bestPull: null,
            picks: [],
            sniperShots: []
          }
        ],
        currentTurnIndex: 0,
        guessedNames: [],
        revealedRanks: [],
        pickHistory: [],
        lastBanner: null,
        gameOver: false,
        gameOverReason: "",
        series: {
          gamesPlayed: 0,
          winsByClientId: {},
          pointsByClientId: {}
        }
      };

      await env.DB.prepare(
        `INSERT INTO online_rooms (room_code, state_json, version, updated_at) VALUES (?, ?, 1, ?)`
      )
        .bind(roomCode, JSON.stringify(initialState), Date.now())
        .run();

      return jsonRes({ roomCode, version: 1, state: initialState });
    }

    const code = String(body?.code || "").trim().toUpperCase();
    const clientId = String(body?.clientId || "").slice(0, 64);
    if (!code || !clientId) {
      return jsonRes({ error: "Missing room code or clientId" }, 400);
    }

    const row = await env.DB.prepare(
      `SELECT room_code, state_json, version FROM online_rooms WHERE room_code = ?`
    )
      .bind(code)
      .first();

    if (!row) {
      return jsonRes({ error: "Room not found or expired" }, 404);
    }

    const roomState = JSON.parse(row.state_json);

    if (action === "join") {
      const safeName = String(body?.playerName || "Player").trim().slice(0, 18) || "Player";
      const existingIdx = roomState.players.findIndex((p) => p.clientId === clientId);

      if (existingIdx !== -1) {
        if (roomState.status === "lobby" && safeName) {
          roomState.players[existingIdx].name = safeName;
          const nextVer = row.version + 1;
          await env.DB.prepare(
            `UPDATE online_rooms SET state_json = ?, version = ?, updated_at = ? WHERE room_code = ?`
          )
            .bind(JSON.stringify(roomState), nextVer, Date.now(), code)
            .run();
          return jsonRes({ roomCode: code, version: nextVer, state: roomState });
        }
        return jsonRes({ roomCode: code, version: row.version, state: roomState });
      }

      if (roomState.status !== "lobby") {
        return jsonRes({ error: "This match has already started." }, 409);
      }

      if (roomState.players.length >= (roomState.maxPlayers || 4)) {
        return jsonRes({ error: "This room is already full (max 4 players)." }, 409);
      }

      roomState.players.push({
        id: roomState.players.length,
        clientId,
        name: safeName,
        score: 0,
        lives: roomState.config?.maxLives || 3,
        busted: false,
        eliminated: false,
        finalRedemptionAvailable: false,
        bestPull: null,
        picks: [],
        sniperShots: []
      });

      const nextVer = row.version + 1;
      await env.DB.prepare(
        `UPDATE online_rooms SET state_json = ?, version = ?, updated_at = ? WHERE room_code = ?`
      )
        .bind(JSON.stringify(roomState), nextVer, Date.now(), code)
        .run();

      return jsonRes({ roomCode: code, version: nextVer, state: roomState });
    }

    if (action === "leave") {
      if (roomState.status === "lobby") {
        roomState.players = roomState.players
          .filter((p) => p.clientId !== clientId)
          .map((p, idx) => ({ ...p, id: idx }));
        const nextVer = row.version + 1;
        await env.DB.prepare(
          `UPDATE online_rooms SET state_json = ?, version = ?, updated_at = ? WHERE room_code = ?`
        )
          .bind(JSON.stringify(roomState), nextVer, Date.now(), code)
          .run();
        return jsonRes({ roomCode: code, version: nextVer, state: roomState });
      }
      return jsonRes({ roomCode: code, version: row.version, state: roomState });
    }

    if (action === "start") {
      if (roomState.hostClientId !== clientId) {
        return jsonRes({ error: "Only the room host can start the match." }, 403);
      }
      const maxLives = roomState.config?.maxLives || 3;
      roomState.status = "playing";
      roomState.currentTurnIndex = 0;
      roomState.guessedNames = [];
      roomState.revealedRanks = [];
      roomState.pickHistory = [];
      roomState.lastBanner = null;
      roomState.gameOver = false;
      roomState.gameOverReason = "";
      if (body?.config) {
        roomState.config = body.config;
      }
      roomState.players = roomState.players.map((p, idx) => ({
        id: idx,
        clientId: p.clientId,
        name: p.name,
        score: 0,
        lives: roomState.config?.maxLives || maxLives,
        busted: false,
        eliminated: false,
        finalRedemptionAvailable: false,
        bestPull: null,
        picks: [],
        sniperShots: []
      }));

      const nextVer = row.version + 1;
      await env.DB.prepare(
        `UPDATE online_rooms SET state_json = ?, version = ?, updated_at = ? WHERE room_code = ?`
      )
        .bind(JSON.stringify(roomState), nextVer, Date.now(), code)
        .run();

      return jsonRes({ roomCode: code, version: nextVer, state: roomState });
    }

    if (action === "sync") {
      const { expectedVersion, nextState } = body || {};
      if (!nextState) {
        return jsonRes({ error: "Missing nextState" }, 400);
      }
      if (typeof expectedVersion === "number" && expectedVersion !== row.version) {
        return jsonRes(
          { conflict: true, roomCode: code, version: row.version, state: roomState },
          409
        );
      }

      const activePlayer = roomState.players[roomState.currentTurnIndex];
      const isHost = roomState.hostClientId === clientId;
      const isActiveTurn = activePlayer && activePlayer.clientId === clientId;
      if (!isHost && !isActiveTurn) {
        return jsonRes({ error: "Not your turn!" }, 403);
      }

      const nextVer = row.version + 1;
      await env.DB.prepare(
        `UPDATE online_rooms SET state_json = ?, version = ?, updated_at = ? WHERE room_code = ?`
      )
        .bind(JSON.stringify(nextState), nextVer, Date.now(), code)
        .run();

      return jsonRes({ roomCode: code, version: nextVer, state: nextState });
    }

    return jsonRes({ error: "Unknown room action" }, 400);
  } catch (err) {
    return jsonRes({ error: err.message || "Room request failed" }, 500);
  }
}
