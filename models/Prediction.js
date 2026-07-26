import mongoose from 'mongoose';

const predictionSchema = new mongoose.Schema({
  matchId: { type: String, required: true, index: true },
  competition: String,
  competitionType: { type: String, enum: ['league', 'cup', 'friendly'], default: 'league' },
  homeTeam: { name: String, id: String },
  awayTeam: { name: String, id: String },
  kickoff: Date,

  prediction: {
    matchResult: { homeWin: Number, draw: Number, awayWin: Number },
    expectedGoals: { home: Number, away: Number, total: Number },
    corners: { total: Number, homeShare: Number, awayShare: Number },
    cards: { yellows: Number, reds: Number },
    btts: Number,
    correctScores: [{ score: String, probability: Number }],
    confidence: Number
  },

  // Filled in after the match finishes, for the public accuracy tracker
  actualResult: {
    homeGoals: Number,
    awayGoals: Number,
    corners: Number,
    yellowCards: Number,
    redCards: Number,
    settled: { type: Boolean, default: false }
  },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Prediction', predictionSchema);
