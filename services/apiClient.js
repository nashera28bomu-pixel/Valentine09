import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5 min cache — respects free-tier rate limits
const BASE_URL = 'https://api.football-data.org/v4';

async function fdRequest(path) {
  const cached = cache.get(path);
  if (cached) return cached;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY }
  });

  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  cache.set(path, data);
  return data;
}

export async function getMatchesToday() {
  const today = new Date().toISOString().split('T')[0];
  return fdRequest(`/matches?dateFrom=${today}&dateTo=${today}`);
}

export async function getCompetitionMatches(competitionCode, dateFrom, dateTo) {
  return fdRequest(`/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
}

export async function getTeamMatches(teamId, limit = 10) {
  return fdRequest(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);
}

export async function getHeadToHead(matchId, limit = 10) {
  return fdRequest(`/matches/${matchId}/head2head?limit=${limit}`);
}

export async function getStandings(competitionCode) {
  return fdRequest(`/competitions/${competitionCode}/standings`);
}

/**
 * football-data.org does NOT provide corners/cards — that needs API_FOOTBALL_KEY.
 * This wrapper is intentionally separate so you can swap providers without
 * touching the prediction engine or routes.
 */
export async function getMatchStatsApiFootball(fixtureId) {
  if (!process.env.API_FOOTBALL_KEY) {
    return null; // caller should fall back to form-based estimates only
  }
  const cacheKey = `af-stats-${fixtureId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }
  });
  if (!res.ok) return null;
  const data = await res.json();
  cache.set(cacheKey, data);
  return data;
}
