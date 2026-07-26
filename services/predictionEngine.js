/**
 * Cymor Pitch — Prediction Engine
 * A transparent, tunable weighted-scoring model (not black-box ML).
 * All weights live at the top so they can be adjusted as real results
 * come in and you learn what actually correlates with outcomes.
 */

const WEIGHTS = {
  recentForm: 0.45,   // last 5-10 matches, weighted more than H2H
  h2h: 0.25,           // last 10 head-to-head meetings
  homeAway: 0.20,      // home/away specific split performance
  competitionType: 0.10 // league vs friendly reliability dampener
};

// Friendlies get a confidence penalty — smaller sample, weaker motivation signal
const COMPETITION_CONFIDENCE = {
  league: 1.0,
  cup: 0.9,
  friendly: 0.6
};

function safeAvg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * formData / h2hData shape expected:
 * {
 *   matches: [{ result: 'W'|'D'|'L', goalsFor, goalsAgainst, corners, yellowCards, redCards, venue: 'home'|'away' }]
 * }
 */
function formScore(matches) {
  if (!matches || matches.length === 0) return { points: 0, gf: 0, ga: 0, sample: 0 };
  const pts = matches.reduce((sum, m) => sum + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0);
  const maxPts = matches.length * 3;
  return {
    points: pts / maxPts, // 0-1 normalized
    gf: safeAvg(matches.map(m => m.goalsFor)),
    ga: safeAvg(matches.map(m => m.goalsAgainst)),
    corners: safeAvg(matches.map(m => m.corners || 0)),
    yellows: safeAvg(matches.map(m => m.yellowCards || 0)),
    reds: safeAvg(matches.map(m => m.redCards || 0)),
    sample: matches.length
  };
}

function h2hScore(h2hMatches, teamId) {
  if (!h2hMatches || h2hMatches.length === 0) return { winRate: 0.5, avgGoalsFor: 1.2, avgGoalsAgainst: 1.2, sample: 0 };
  let wins = 0, draws = 0;
  const gf = [], ga = [];
  h2hMatches.forEach(m => {
    if (m.result === 'W') wins++;
    if (m.result === 'D') draws++;
    gf.push(m.goalsFor);
    ga.push(m.goalsAgainst);
  });
  return {
    winRate: (wins + draws * 0.5) / h2hMatches.length,
    avgGoalsFor: safeAvg(gf),
    avgGoalsAgainst: safeAvg(ga),
    sample: h2hMatches.length
  };
}

/**
 * Main entry point.
 * @param {Object} input
 * @param {Object} input.home - { form: {matches:[]}, h2h: {matches:[]}, homeSplit: {matches:[]} }
 * @param {Object} input.away - same shape, but h2h/awaySplit from away team's perspective
 * @param {'league'|'cup'|'friendly'} input.competitionType
 */
export function predictMatch({ home, away, competitionType = 'league' }) {
  const homeForm = formScore(home.form?.matches);
  const awayForm = formScore(away.form?.matches);
  const homeH2H = h2hScore(home.h2h?.matches);
  const awayH2H = h2hScore(away.h2h?.matches);
  const homeSplit = formScore(home.homeSplit?.matches); // home team playing at home
  const awaySplit = formScore(away.awaySplit?.matches);  // away team playing away

  // Composite strength score per side (0-1 scale)
  const homeStrength =
    homeForm.points * WEIGHTS.recentForm +
    homeH2H.winRate * WEIGHTS.h2h +
    homeSplit.points * WEIGHTS.homeAway;

  const awayStrength =
    awayForm.points * WEIGHTS.recentForm +
    (1 - awayH2H.winRate) * WEIGHTS.h2h + // invert since h2h winRate was from home perspective use own calc instead
    awaySplit.points * WEIGHTS.homeAway;

  const total = homeStrength + awayStrength || 1;
  let winProb = homeStrength / total;
  let loseProb = awayStrength / total;

  // Draw probability: higher when strengths are close together
  const gap = Math.abs(winProb - loseProb);
  const drawProb = Math.max(0.15, 0.35 - gap * 0.5);

  // Renormalize all three to sum to 1
  const rawSum = winProb + loseProb + drawProb;
  const result = {
    homeWin: +((winProb / rawSum) * 100).toFixed(1),
    draw: +((drawProb / rawSum) * 100).toFixed(1),
    awayWin: +((loseProb / rawSum) * 100).toFixed(1)
  };

  // Expected goals — blend of own scoring form and opponent's conceding form
  const homeXG = +(((homeForm.gf + awayForm.ga) / 2) * 1.05).toFixed(2); // small home boost
  const awayXG = +(((awayForm.gf + homeForm.ga) / 2) * 0.95).toFixed(2);

  // Corners & cards — blended averages from both teams' recent matches
  const totalCorners = +((homeForm.corners + awayForm.corners) / 2 * 2).toFixed(1);
  const totalYellows = +((homeForm.yellows + awayForm.yellows)).toFixed(1);
  const totalReds = +((homeForm.reds + awayForm.reds)).toFixed(2);

  // BTTS — probability both teams score, from xG using simple Poisson-ish heuristic
  const bttsProb = +((1 - Math.exp(-homeXG)) * (1 - Math.exp(-awayXG)) * 100).toFixed(1);

  // Correct score grid — top 3 most likely scorelines via Poisson distribution
  const correctScores = topScorelines(homeXG, awayXG, 3);

  // Confidence — driven by sample size available and competition type
  const sampleFactor = Math.min(1, (homeForm.sample + awayForm.sample) / 16);
  const confidence = +((sampleFactor * 0.7 + 0.3) * COMPETITION_CONFIDENCE[competitionType] * 100).toFixed(0);

  return {
    matchResult: result,
    expectedGoals: { home: homeXG, away: awayXG, total: +(homeXG + awayXG).toFixed(2) },
    corners: { total: totalCorners, homeShare: +(totalCorners * 0.55).toFixed(1), awayShare: +(totalCorners * 0.45).toFixed(1) },
    cards: { yellows: totalYellows, reds: totalReds },
    btts: bttsProb,
    correctScores,
    confidence,
    dataQuality: {
      homeFormSample: homeForm.sample,
      awayFormSample: awayForm.sample,
      h2hSample: home.h2h?.matches?.length || 0,
      competitionType
    }
  };
}

function poissonP(lambda, k) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}
function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }

function topScorelines(homeXG, awayXG, count = 3) {
  const scores = [];
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const p = poissonP(homeXG, h) * poissonP(awayXG, a);
      scores.push({ score: `${h}-${a}`, probability: +(p * 100).toFixed(1) });
    }
  }
  return scores.sort((a, b) => b.probability - a.probability).slice(0, count);
}
