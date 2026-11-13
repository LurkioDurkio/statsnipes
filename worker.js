// Cloudflare Worker with Assets Entrypoint
// Handles /api/score and /api/distro, and serves static assets for all other routes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. POST /api/score
    if (url.pathname === "/api/score" && request.method === "POST") {
      try {
        if (!env || !env.DB) {
          return new Response(JSON.stringify({ error: "D1 database binding 'DB' not configured" }), {
            status: 503,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const body = await request.json();
        const { date, sport, submode, score, targetGoal, busted, clientId } = body || {};

        if (!date || !sport || !submode || typeof score !== "number") {
          return new Response(JSON.stringify({ error: "Missing required score fields" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const validSports = ["NBA", "NFL", "MLB"];
        const validModes = ["sniper", "target"];
        if (!validSports.includes(sport) || !validModes.includes(submode)) {
          return new Response(JSON.stringify({ error: "Invalid sport or submode" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const safeScore = Math.max(0, Math.min(1000000, Math.round(score)));
        const safeTarget = targetGoal ? Math.max(1, Math.min(1000000, Math.round(targetGoal))) : null;
        const safeBusted = busted ? 1 : 0;
        const safeClientId = (clientId && typeof clientId === "string")
          ? clientId.slice(0, 64)
          : "anon_" + Math.random().toString(36).slice(2, 10);

        const stmt = env.DB.prepare(
          `INSERT OR IGNORE INTO daily_scores (date, sport, submode, score, target_goal, busted, client_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        await stmt.bind(date, sport, submode, safeScore, safeTarget, safeBusted, safeClientId).run();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Failed to record score" }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 2. GET /api/distro
    if (url.pathname === "/api/distro") {
      try {
        if (!env || !env.DB) {
          return new Response(JSON.stringify({ error: "D1 database binding 'DB' not configured", live: false }), {
            status: 503,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        const sport = (url.searchParams.get("sport") || "NBA").toUpperCase();
        const submode = (url.searchParams.get("submode") || "sniper").toLowerCase();
        const userScoreParam = url.searchParams.get("userScore");
        const userScore = userScoreParam !== null && userScoreParam !== "" ? Number(userScoreParam) : null;
        const isBusted = url.searchParams.get("busted") === "1" || url.searchParams.get("busted") === "true";

        let result = null;
        if (submode === "sniper") {
          const q = await env.DB.prepare(`
            SELECT 
              COUNT(*) AS total,
              AVG(score) AS avgScore,
              COUNT(CASE WHEN score < 100 THEN 1 END) AS c0,
              COUNT(CASE WHEN score >= 100 AND score < 200 THEN 1 END) AS c1,
              COUNT(CASE WHEN score >= 200 AND score < 300 THEN 1 END) AS c2,
              COUNT(CASE WHEN score >= 300 AND score < 400 THEN 1 END) AS c3,
              COUNT(CASE WHEN score >= 400 AND score < 450 THEN 1 END) AS c4,
              COUNT(CASE WHEN score >= 450 THEN 1 END) AS c5
            FROM daily_scores
            WHERE date = ? AND sport = ? AND submode = 'sniper'
          `).bind(date, sport).first();

          const total = (q && q.total) || 0;
          let percentile = null;

          if (total > 0 && userScore !== null) {
            const belowQ = await env.DB.prepare(`
              SELECT COUNT(*) AS below
              FROM daily_scores
              WHERE date = ? AND sport = ? AND submode = 'sniper' AND score < ?
            `).bind(date, sport, userScore).first();

            const below = (belowQ && belowQ.below) || 0;
            percentile = Math.max(1, Math.min(99, Math.round((below / total) * 100)));
          }

          result = {
            live: true,
            date,
            sport,
            submode,
            totalPlayers: total,
            avgScore: q && q.avgScore ? Math.round(q.avgScore) : null,
            counts: [q?.c0 || 0, q?.c1 || 0, q?.c2 || 0, q?.c3 || 0, q?.c4 || 0, q?.c5 || 0],
            percentile
          };
        } else {
          // Target Stat mode
          const q = await env.DB.prepare(`
            SELECT 
              COUNT(*) AS total,
              AVG(CASE WHEN busted = 0 AND target_goal > 0 THEN (score * 100.0 / target_goal) END) AS avgAcc,
              COUNT(CASE WHEN busted = 1 THEN 1 END) AS c0,
              COUNT(CASE WHEN busted = 0 AND target_goal > 0 AND (score * 1.0 / target_goal) < 0.60 THEN 1 END) AS c1,
              COUNT(CASE WHEN busted = 0 AND target_goal > 0 AND (score * 1.0 / target_goal) >= 0.60 AND (score * 1.0 / target_goal) < 0.80 THEN 1 END) AS c2,
              COUNT(CASE WHEN busted = 0 AND target_goal > 0 AND (score * 1.0 / target_goal) >= 0.80 AND (score * 1.0 / target_goal) < 0.90 THEN 1 END) AS c3,
              COUNT(CASE WHEN busted = 0 AND target_goal > 0 AND (score * 1.0 / target_goal) >= 0.90 AND (score * 1.0 / target_goal) < 0.96 THEN 1 END) AS c4,
              COUNT(CASE WHEN busted = 0 AND target_goal > 0 AND (score * 1.0 / target_goal) >= 0.96 THEN 1 END) AS c5
            FROM daily_scores
            WHERE date = ? AND sport = ? AND submode = 'target'
          `).bind(date, sport).first();

          const total = (q && q.total) || 0;
          let percentile = null;

          if (total > 0 && userScore !== null) {
            if (isBusted) {
              percentile = null;
            } else {
              const belowQ = await env.DB.prepare(`
                SELECT COUNT(*) AS below
                FROM daily_scores
                WHERE date = ? AND sport = ? AND submode = 'target' 
                  AND (busted = 1 OR (busted = 0 AND score < ?))
              `).bind(date, sport, userScore).first();

              const below = (belowQ && belowQ.below) || 0;
              percentile = Math.max(1, Math.min(99, Math.round((below / total) * 100)));
            }
          }

          result = {
            live: true,
            date,
            sport,
            submode,
            totalPlayers: total,
            avgAccuracy: q && q.avgAcc ? Number(q.avgAcc.toFixed(1)) : null,
            counts: [q?.c0 || 0, q?.c1 || 0, q?.c2 || 0, q?.c3 || 0, q?.c4 || 0, q?.c5 || 0],
            percentile
          };
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=15, stale-while-revalidate=45",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Failed to fetch distribution", live: false }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 3. Fallback: Serve static assets
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
