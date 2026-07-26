import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import fixturesRouter from './routes/fixtures.js';
import analysisRouter from './routes/analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.ALLOWED_ORIGINS === '*' ? '*' : process.env.ALLOWED_ORIGINS?.split(',') }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/fixtures', fixturesRouter);
app.use('/api/analysis', analysisRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Cymor Pitch' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

app.listen(PORT, () => console.log(`Cymor Pitch running on port ${PORT}`));
