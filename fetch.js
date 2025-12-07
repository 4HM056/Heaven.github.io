const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;
const COUNTRY = process.env.OSU_COUNTRY || 'IQ';
const API_BASE = process.env.OSU_API_BASE || 'https://osu.ppy.sh/api/v2';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('OSU_CLIENT_ID and OSU_CLIENT_SECRET must be set as environment variables.');
  process.exit(1);
}

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

function normalizeApiResponse(data) {
  let arr = [];
  if (!data) return arr;
  if (Array.isArray(data)) arr = data;
  else if (data.ranking && Array.isArray(data.ranking)) arr = data.ranking;
  else if (data.ranking?.items && Array.isArray(data.ranking.items)) arr = data.ranking.items;
  else if (data.items && Array.isArray(data.items)) arr = data.items;

  return arr.map((it, idx) => {
    const u = it.user || {};
    return {
      username: u.username || 'Unknown',
      user_id: u.id,
      avatar_url: u.avatar_url,
      profile_url: `https://osu.ppy.sh/users/${u.id}`,
      pp: it.pp || u.statistics?.pp || 0,
      accuracy: u.statistics?.hit_accuracy || 0,
      play_count: u.statistics?.play_count || 0,
      ranked_score: u.statistics?.ranked_score || 0,
      global_rank: u.statistics?.global_rank || (it.rank || idx+1),
      country_rank: u.statistics?.country_rank || null
    };
  });
}

(async () => {
  try {
    const t = await token();

    const urls = [
      `${API_BASE}/rankings/osu/performance?country=${COUNTRY}&limit=200`
    ];

    let items = [];
    for (const url of urls) {
      try {
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${t}` }});
        const normalized = normalizeApiResponse(res.data);
        if (normalized.length > 0) {
          items = normalized;
          break;
        }
      } catch (err) {
        console.warn('API failed:', err.response?.status || err.message);
      }
    }

    if (items.length === 0) {
      console.error('No items fetched from API.');
      process.exit(1);
    }

    const out = {
      updated_at: Date.now(),
      country: COUNTRY,
      source: 'api',
      items
    };

    fs.writeFileSync('leaderboard.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote leaderboard.json with', items.length, 'items');
    process.exit(0);

  } catch (err) {
    console.error('Fetch failed:', err.response?.data || err.message || err);
    process.exit(2);
  }
})();
