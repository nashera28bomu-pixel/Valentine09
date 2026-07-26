import express from 'express';
import { getMatchesToday, getCompetitionMatches, getStandings } from '../services/apiClient.js';

const router = express.Router();

// GET /api/fixtures/today
router.get('/today', async (req, res) => {
  try {
    const data = await getMatchesToday();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach football-data.org', detail: err.message });
  }
});

// GET /api/fixtures/competition/:code?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/competition/:code', async (req, res) => {
  const { code } = req.params;
  const from = req.query.from || new Date().toISOString().split('T')[0];
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 14);
  const to = req.query.to || toDate.toISOString().split('T')[0];

  try {
    const data = await getCompetitionMatches(code, from, to);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach football-data.org', detail: err.message });
  }
});

// GET /api/fixtures/standings/:code
router.get('/standings/:code', async (req, res) => {
  try {
    const data = await getStandings(req.params.code);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach football-data.org', detail: err.message });
  }
});

export default router;
