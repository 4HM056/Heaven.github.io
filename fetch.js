const fs = require('fs');
const axios = require('axios');

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

async function fetchLeaderboard(accessToken, limit = 50) {
  // Corrected endpoint for country rankings
  const url = `${API_BASE}/rankings/osu/performance?country=${encodeURIComponent(COUNTRY)}&limit=${limit}`;
  console.log('Fetching from:', url);
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  return resp.data;
}

(async () => {
  try {
    console.log('Fetching token...');
    const t = await token();
    console.log('Token acquired. Fetching leaderboard for country:', COUNTRY);
    const data = await fetchLeaderboard(t, 200);
    
    console.log('API response keys:', Object.keys(data));
    if (data.ranking) console.log('Ranking items:', data.ranking.length);
    
    const out = {
      updated_at: Date.now(),
      country: COUNTRY,
      data
    };
    fs.writeFileSync('leaderboard.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote leaderboard.json');
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.response?.data || err.message || err);
    process.exit(2);
  }
})();
