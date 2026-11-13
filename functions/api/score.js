// Cloudflare Pages Function: /api/score
// Records live player daily score submissions to Cloudflare D1

export async function onRequestPost({ request, env }) {
  try {
    if (!env || !env.DB) {
      return new Response(JSON.stringify({ error: "D1 database binding 'DB' not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const { date, sport, submode, score, targetGoal, busted, clientId } = body || {};

    if (!date || !sport || !submode || typeof score !== "number") {
      return new Response(JSON.stringify({ error: "Missing required score fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const validSports = ["NBA", "NFL", "MLB"];
    const validModes = ["sniper", "target"];
    if (!validSports.includes(sport) || !validModes.includes(submode)) {
      return new Response(JSON.stringify({ error: "Invalid sport or submode" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const safeScore = Math.max(0, Math.min(1000000, Math.round(score)));
    const safeTarget = targetGoal ? Math.max(1, Math.min(1000000, Math.round(targetGoal))) : null;
    const safeBusted = busted ? 1 : 0;
    const safeClientId = (clientId && typeof clientId === "string")
      ? clientId.slice(0, 64)
      : "anon_" + Math.random().toString(36).slice(2, 10);

    // INSERT OR IGNORE locks in the user's official first attempt of the day per client token
    const stmt = env.DB.prepare(
      `INSERT OR IGNORE INTO daily_scores (date, sport, submode, score, target_goal, busted, client_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    await stmt.bind(date, sport, submode, safeScore, safeTarget, safeBusted, safeClientId).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to record score" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
