const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const COUNTRY = process.env.OSU_COUNTRY || "IQ";
const LIMIT = 50; // top 50 users

// Get OAuth token
async function getToken() {
  const res = await axios.post("https://osu.ppy.sh/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "public",
  });
  return res.data.access_token;
}

// Fetch country leaderboard (PP ranking)
async function fetchCountryLeaderboard(token) {
  const url = "https://osu.ppy.sh/api/v2/rankings/osu/performance";
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: { country: COUNTRY, limit: LIMIT },
  });
  return res.data.ranking || [];
}

// Fetch full user statistics for one user
async function fetchUserStats(token, user_id) {
  try {
    const res = await axios.get(`https://osu.ppy.sh/api/v2/users/${user_id}/osu`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    console.warn(`Failed to fetch stats for user ${user_id}:`, err.response?.status || err.message);
    return null;
  }
}

(async () => {
  try {
    console.log("Getting OAuth token...");
    const token = await getToken();

    console.log(`Fetching top ${LIMIT} leaderboard for country: ${COUNTRY}`);
    const ranking = await fetchCountryLeaderboard(token);

    // Fetch full stats for each user
    const items = [];
    for (let i = 0; i < ranking.length; i++) {
      const u = ranking[i];
      if (!u.user?.id) continue;

      const stats = await fetchUserStats(token, u.user.id);
      if (!stats) continue;

      items.push({
        username: stats.username || "Unknown",
        user_id: stats.id || 0,
        pp: u.pp || 0,
        accuracy: stats.statistics?.hit_accuracy?.toFixed(2) || "0.00",
        play_count: stats.statistics?.play_count || 0,
        ss_count: stats.statistics?.rank_counts?.ss || 0,
        top_plays: (stats.statistics?.count_rank_ss || 0) + (stats.statistics?.count_rank_s || 0),
        global_rank: stats.statistics?.global_rank || 0,
        country_rank: stats.statistics?.country_rank || 0,
        avatar_url: stats.avatar_url || "",
        profile_url: `https://osu.ppy.sh/users/${stats.id}`,
      });

      console.log(`Fetched stats for ${stats.username} (${i + 1}/${ranking.length})`);
    }

    const result = {
      updated_at: new Date().toISOString(),
      country: COUNTRY,
      source: "osu API v2",
      total: items.length,
      items,
    };

    fs.writeFileSync("leaderboard.json", JSON.stringify(result, null, 2));
    console.log("leaderboard.json updated successfully!");
  } catch (err) {
    console.error("Error:", err.response?.data || err.message || err);
    process.exit(1);
  }
})();
