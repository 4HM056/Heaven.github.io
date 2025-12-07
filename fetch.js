// fetch.js — official osu! API, extended stats
const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const COUNTRY = process.env.OSU_COUNTRY || "IQ";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("OSU_CLIENT_ID and OSU_CLIENT_SECRET must be set as environment variables.");
  process.exit(1);
}

async function getToken() {
  const res = await axios.post("https://osu.ppy.sh/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "public",
  });
  return res.data.access_token;
}

async function fetchLeaderboard(token) {
  let items = [];
  let url = "https://osu.ppy.sh/api/v2/rankings/osu/performance";
  let cursor = null;

  while (true) {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { country: COUNTRY, cursor_string: cursor },
    });

    items.push(...res.data.ranking);

    if (!res.data.cursor || !res.data.cursor_string) break;
    cursor = res.data.cursor_string;
  }

  return items;
}

(async () => {
  try {
    console.log("Getting OAuth token...");
    const token = await getToken();

    console.log("Fetching leaderboard...");
    const rawItems = await fetchLeaderboard(token);

    const items = rawItems.map((u) => ({
      username: u.user.username,
      user_id: u.user.id,
      pp: u.pp,
      level: u.user.statistics.level.current,
      accuracy: parseFloat(u.user.statistics.hit_accuracy.toFixed(2)),
      play_count: u.user.statistics.play_count,
      ranked_score: u.user.statistics.ranked_score,
      ss_count: u.user.statistics.rank_counts?.ss ?? 0,
      top_plays: u.user.statistics.count_rank_ss + u.user.statistics.count_rank_s,
      global_rank: u.global_rank,
      country_rank: u.country_rank,
      avatar_url: u.user.avatar_url,
      profile_url: `https://osu.ppy.sh/users/${u.user.id}`,
    }));

    const out = {
      updated_at: new Date().toISOString(),
      country: COUNTRY,
      source: "osu API v2",
      total: items.length,
      items,
    };

    fs.writeFileSync("leaderboard.json", JSON.stringify(out, null, 2));
    console.log("leaderboard.json updated successfully!");
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err);
    process.exit(1);
  }
})();
