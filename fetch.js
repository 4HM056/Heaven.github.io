// fetch.js — Official osu! API Version (full stats)
const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const COUNTRY = process.env.OSU_COUNTRY || "IQ";

async function getToken() {
  const res = await axios.post("https://osu.ppy.sh/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "public",
  });
  return res.data.access_token;
}

async function fetchCountryLeaderboard(token) {
  let all = [];
  let cursor = null;

  while (true) {
    const url = "https://osu.ppy.sh/api/v2/rankings/osu/performance";

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { country: COUNTRY, cursor_string: cursor },
    });

    all.push(...res.data.ranking);

    if (!res.data.cursor || !res.data.cursor.pagination || !res.data.cursor.pagination.cursor_string) break;
    cursor = res.data.cursor.pagination.cursor_string;
  }

  return all;
}

(async () => {
  try {
    console.log("Getting OAuth token...");
    const token = await getToken();

    console.log("Fetching leaderboard for country:", COUNTRY);
    const items = await fetchCountryLeaderboard(token);

    const result = {
      updated_at: new Date().toISOString(),
      country: COUNTRY,
      source: "osu API v2",
      total: items.length,
      items: items.map((u) => ({
        username: u.user.username,
        user_id: u.user.id,
        pp: u.pp,
        level: u.user.statistics.level.current,
        accuracy: u.user.statistics.hit_accuracy.toFixed(2),
        play_count: u.user.statistics.play_count,
        ss_count: u.user.statistics.rank_counts?.ss ?? 0,
        top_plays: (u.user.statistics.count_rank_ss || 0) + (u.user.statistics.count_rank_s || 0),
        global_rank: u.global_rank,
        country_rank: u.country_rank,
        avatar_url: u.user.avatar_url,
        profile_url: `https://osu.ppy.sh/users/${u.user.id}`,
      })),
    };

    fs.writeFileSync("leaderboard.json", JSON.stringify(result, null, 2));
    console.log("leaderboard.json updated successfully!");
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err);
    process.exit(1);
  }
})();
