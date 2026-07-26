import express from 'express';
import { getTeamMatches, getHeadToHead } from '../services/apiClient.js';
import { predictMatch } from '../services/predictionEngine.js';
import Prediction from '../models/Prediction.js';

const router = express.Router();

// Convert football-data.org raw match objects into the engine's expected shape
function toFormMatches(rawMatches, teamId) {
  return rawMatches.map(m => {
    const isHome = m.homeTeam.id === teamId;
    const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    let result = 'D';
    if (gf > ga) result = 'W';
    if (gf < ga) result = 'L';
    return {
      result, goalsFor: gf ?? 0, goalsAgainst: ga ?? 0,
      venue: isHome ? 'home' : 'away',
      // corners/cards left at 0 unless API-Football stats are wired in — see README
      corners: 0, yellowCards: 0, redCards: 0
    };
  });
}

// GET /api/analysis/:matchId?homeTeamId=X&awayTeamId=Y&competitionType=league
router.get('/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const { homeTeamId, awayTeamId, competitionType = 'league' } = req.query;

  if (!homeTeamId || !awayTeamId) {
    return res.status(400).json({ error: 'homeTeamId and awayTeamId query params are required' });
  }

  try {
    // Check cache first — avoid recomputing/refetching for the same match same day
    const cached = await Prediction.findOne({ matchId }).sort({ createdAt: -1 });
    if (cached && (Date.now() - cached.createdAt.getTime()) < 1000 * 60 * 60) {
      return res.json(cached.prediction);
    }

    const [homeMatchesRaw, awayMatchesRaw, h2hRaw] = await Promise.all([
      getTeamMatches(homeTeamId, 10),
      getTeamMatches(awayTeamId, 10),
      getHeadToHead(matchId, 10)
    ]);

    const homeForm = toFormMatches(homeMatchesRaw.matches || [], Number(homeTeamId));
    const awayForm = toFormMatches(awayMatchesRaw.matches || [], Number(awayTeamId));
    const homeSplit = homeForm.filter(m => m.venue === 'home');
    const awaySplit = awayForm.filter(m => m.venue === 'away');
    const h2hForHome = toFormMatches(h2hRaw.matches || [], Number(homeTeamId));

    const prediction = predictMatch({
      home: { form: { matches: homeForm }, h2h: { matches: h2hForHome }, homeSplit: { matches: homeSplit } },
      away: { form: { matches: awayForm }, h2h: { matches: [] }, awaySplit: { matches: awaySplit } },
      competitionType
    });

    // Cache it
    await Prediction.create({
      matchId,
      competitionType,
      prediction,
    });

    res.json(prediction);
  } catch (err) {
    res.status(502).json({ error: 'Could not build analysis', detail: err.message });
  }
});

export default router;
