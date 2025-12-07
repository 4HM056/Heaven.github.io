// fetch.js
// Tries osu! API v2, falls back to scraping the public rankings pages.
// Produces leaderboard.json with shape:
// { updated_at: 1234567890, country: 'IQ', source: 'api'|'scrape', items: [ { username, rank, pp } ] }

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
  // try to find ranking array in a few places
  let arr = [];
  if (!data) return arr;
  if (Array.isArray(data)) arr = data;
  else if (data.ranking && Array.isArray(data.ranking)) arr = data.ranking;
  else if (data.ranking && data.ranking.items && Array.isArray(data.ranking.items)) arr = data.ranking.items;
  else if (data.items && Array.isArray(data.items)) arr = data.items;

  // transform into {username, rank, pp}
  return arr.map((it, idx) => {
    const username = (it.user && (it.user.username || it.user.display_name)) || it.username || it.user_name || 'Unknown';
    const rank = it.rank || it.pp_rank || (it.user && it.user.pp_rank) || (idx + 1);
    const pp = it.pp || it.performance || (it.user && it.user.statistics && it.user.statistics.pp) || null;
    return { username, rank, pp };
  });
}

async function fetchViaApi(accessToken, limit = 200) {
  // Try a few API shapes (some installations differ)
  const candidates = [
    `${API_BASE}/rankings/osu/performance?country=${encodeURIComponent(COUNTRY)}&limit=${limit}`,
    `${API_BASE}/rankings/osu/country?country=${encodeURIComponent(COUNTRY)}&type=performance&limit=${limit}`,
    `${API_BASE}/rankings/osu/global/performance?country=${encodeURIComponent(COUNTRY)}&limit=${limit}`
  ];

  for (const url of candidates) {
    try {
      console.log('Trying API URL:', url);
      const resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` }});
      const normalized = normalizeApiResponse(resp.data);
      if (normalized && normalized.length > 0) {
        return { source: 'api', items: normalized };
      } else {
        console.log('API returned no usable items for url:', url);
      }
    } catch (err) {
      console.warn('API call failed for', url, err.response ? err.response.status : err.message);
    }
  }
  return null;
}

function dedupeKeepFirst(arr) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const key = (it.username || '').toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

async function fetchByScrape(pages = [1,2]) {
  // Scrape the public web ranking pages which match the URLs you provided.
  // Parse multiple selectors to be robust and return a normalized items array.
  let results = [];

  for (const p of pages) {
    const url = `https://osu.ppy.sh/rankings/osu/global/performance?country=${encodeURIComponent(COUNTRY)}&filter=all&page=${p}`;
    console.log('Scraping', url);
    try {
      const resp = await axios.get(url, { headers: { 'User-Agent': 'github-actions' }});
      const $ = cheerio.load(resp.data);

      // Attempt multiple heuristics to extract rows:
      // 1) table rows
      $('table tr').each((i, el) => {
        const $row = $(el);
        // rank likely in first td, username in anchor to /users/
        const rankText = $row.find('td').first().text().trim();
        const userAnchor = $row.find('a[href^="/users/"]').first();
        if (userAnchor && userAnchor.length) {
          const username = userAnchor.text().trim() || 'Unknown';
          // try to find pp or performance in row
          let pp = null;
          const ppText = $row.find('td').last().text().trim();
          if (ppText && /\d/.test(ppText)) pp = ppText.replace(/\s+/g,' ');
          const rank = rankText ? rankText.replace(/\D/g,'') : null;
          results.push({ username, rank: rank ? Number(rank) : null, pp });
        }
      });

      // 2) ranking list items (site uses divs in some layouts)
      $('.ranking__row, .ranking__list-item, .ranking-row, .ranking-item').each((i, el) => {
        const $el = $(el);
        // find anchor to user
        const userAnchor = $el.find('a[href^="/users/"]').first();
        if (!userAnchor || !userAnchor.length) return;
        const username = userAnchor.text().trim() || 'Unknown';
        // rank might be in an element with class 'rank' or similar
        let rank = null;
        const rankText = $el.find('.rank, .ranking__position, .position, .ranking-position').first().text().trim();
        if (rankText) rank = rankText.replace(/\D/g,'');
        // performance/pp maybe in .performance or .pp
        let pp = $el.find('.pp, .performance, .score').first().text().trim();
        if (pp && !/\d/.test(pp)) pp = null;
        results.push({ username, rank: rank ? Number(rank) : null, pp });
      });

      // 3) generic anchors to /users/ (collect surrounding context)
      $('a[href^="/users/"]').each((i, el) => {
        const $a = $(el);
        const username = $a.text().trim();
        if (!username) return;
        // look for nearest ancestor row or list-item to get rank/pp
        const $row = $a.closest('tr, .ranking__row, .ranking__list-item, .ranking-item, li');
        let rank = null;
        let pp = null;
        if ($row && $row.length) {
          const rankText = $row.find('.rank, .ranking__position, .position, td').first().text().trim();
          if (rankText) rank = rankText.replace(/\D/g,'');
          const ppText = $row.find('.pp, .performance, .score, td').last().text().trim();
          if (ppText && /\d/.test(ppText)) pp = ppText.replace(/\s+/g,' ');
        }
        results.push({ username, rank: rank ? Number(rank) : null, pp });
      });

    } catch (err) {
      console.warn('Scrape failed for', url, err.response ? err.response.status : err.message);
    }
  }

  // Clean up: dedupe, sort by rank if available
  const cleaned = dedupeKeepFirst(results)
    .map(it => ({ username: it.username, rank: (it.rank ? Number(it.rank) : null), pp: it.pp || null }))
    .filter(it => it.username && it.username.toLowerCase() !== 'unknown');

  const sorted = cleaned.sort((a,b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    return 0;
  });

  return { source: 'scrape', items: sorted };
}

(async () => {
  try {
    console.log('Getting token...');
    const t = await token();

    // Try API first
    const apiResult = await fetchViaApi(t, 200);
    if (apiResult && apiResult.items && apiResult.items.length > 0) {
      console.log('Using API result with', apiResult.items.length, 'items');
      const out = { updated_at: Date.now(), country: COUNTRY, source: 'api', items: apiResult.items };
      fs.writeFileSync('leaderboard.json', JSON.stringify(out, null, 2), 'utf8');
      console.log('Wrote leaderboard.json (api)');
      process.exit(0);
    }

    // Fallback scrape
    console.log('API returned no usable data, falling back to scrape...');
    const scrape = await fetchByScrape([1,2]);
    console.log('Scrape produced', scrape.items.length, 'unique items');
    const out = { updated_at: Date.now(), country: COUNTRY, source: 'scrape', items: scrape.items };
    fs.writeFileSync('leaderboard.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote leaderboard.json (scrape)');
    process.exit(0);

  } catch (err) {
    console.error('Failed overall:', err.response?.data || err.message || err);
    process.exit(2);
  }
})();
