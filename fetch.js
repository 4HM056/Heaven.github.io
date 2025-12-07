// fetch.js
// Fetch osu! API v2 leaderboard for a country
// Produces leaderboard.json with: 
// { updated_at, country, source, items: [ { username, user_id, pp, play_count, accuracy, ranked_score, avatar_url, profile_url } ] }

const fs = require('fs');
const axios = require('axios');

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const COUNTRY = process.env.OSU_COUNTRY || 'IQ';
const API_BASE = process.env.OSU_API_BASE || 'https://osu.ppy.sh/api/v2';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('OSU_CLIENT_ID and OSU_CLIENT_SECRET must be set.');
  process.exit(1);
}

// Get OAuth token
async function token() {
  const url = 'https://osu.ppy.sh/oauth/token';
  const resp = await axios.post(url, {
    client_id: Number(CLIENT_ID),
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'public'
  }, { headers: {'Content-Type':'application/json'}});
  return resp.data.access_token;
}

// Fetch leaderboard via osu! API
async function fetchLeaderboard(accessToken, limit = 100) {
  const url = `${API_BASE}/rankings/osu/performance?country=${encodeURIComponent(COUNTRY)}&limit=${limit}`;
  console.log('Fetching leaderboard from API...');
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = resp.data.ranking?.items || resp.data.items || [];
  
  // Map to our format
  return data.map((u, idx) => {
    const user = u.user || {};
    const stats = user.statistics || {};
    return {
      username: user.username || 'Unknown',
      user_id: user.id || null,
      pp: u.pp || stats.pp || null,
      play_count: stats.play_count || 0,
      accuracy: stats.hit_accuracy ? Number(stats.hit_accuracy.toFixed(2)) : 0,
      ranked_score: stats.ranked_score || 0,
      global_rank: stats.global_rank || null,
      country_rank: stats.country_rank || null,
      avatar_url: user.avatar_url || '',
      profile_url: user.id ? `https://osu.ppy.sh/users/${user.id}` : '#'
    };
  });
}

(async () => {
  try {
    const t = await token();
    const items = await fetchLeaderboard(t, 100);

    if (!items || items.length === 0) {
      console.error('No data returned from API.');
      process.exit(1);
    }

    const out = {
      updated_at: Date.now(),
      country: COUNTRY,
      source: 'api',
      items
    };

    fs.writeFileSync('leaderboard.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('leaderboard.json written with', items.length, 'items.');
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err.response?.data || err.message || err);
    process.exit(2);
  }
})();
