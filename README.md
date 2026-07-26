# Cymor Pitch

Deep football match analysis and prediction platform. Covers pre-season friendlies through full league seasons, with predictions for match result, expected goals, corners, cards, BTTS, and correct scores — each with a confidence rating.

## Stack

- Frontend: vanilla HTML/CSS/JS (flat under `/public`, no build step)
- Backend: Node.js + Express
- Database: MongoDB Atlas (prediction caching + accuracy tracking)
- Hosting: Render

## Project structure

```
cymor-pitch/
├── server.js                 → Express entry point
├── routes/
│   ├── fixtures.js           → upcoming matches, standings
│   └── analysis.js           → builds the deep-analysis prediction for a fixture
├── services/
│   ├── apiClient.js          → football-data.org wrapper (+ API-Football stats hook)
│   └── predictionEngine.js   → the weighted scoring model — all logic lives here
├── models/
│   └── Prediction.js         → Mongoose schema, also used for the accuracy tracker
├── public/
│   ├── index.html            → kickoff-loader + landing + dashboard (single page)
│   ├── css/style.css
│   └── js/
│       ├── loader.js         → ball-loading animation timing
│       └── app.js            → view routing, fetches, rendering
├── .env.example
└── package.json
```

## API keys you need

### 1. `MONGODB_URI` — required
Your MongoDB Atlas connection string. Same setup pattern as your other projects (Cymor Course Checker, Rumion Novel Hub, etc).
- Atlas dashboard → Database → Connect → Drivers → copy the connection string
- Format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/cymorpitch?retryWrites=true&w=majority`

### 2. `FOOTBALL_DATA_API_KEY` — required (primary data source)
Free tier from **football-data.org**.
- Sign up at https://www.football-data.org/client/register
- Free tier gives you: fixtures, results, standings, head-to-head, team match history for major competitions (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, and more)
- Rate limit: 10 requests/minute on free tier — the app caches responses for 5 minutes (`services/apiClient.js`) to stay under this
- **Limitation: does NOT provide corners or cards data.** Without key #3 below, corners/cards predictions fall back to 0 and won't be meaningful — you'll want key #3 for the full "deep analysis" feature set you asked for.

### 3. `API_FOOTBALL_KEY` — strongly recommended
Free tier from **API-Football** (api-football.com, also available via RapidAPI).
- Sign up at https://www.api-football.com or via RapidAPI's API-Football page
- This is what actually supplies corners, cards, and (on paid tiers) more advanced stats and referee data
- Free tier is limited to 100 requests/day — plan your caching accordingly as the site grows
- If this key is missing, `getMatchStatsApiFootball()` in `services/apiClient.js` returns `null` and the app just uses form-based estimates for corners/cards instead of live stats

### Where to put them
Copy `.env.example` to `.env` and fill in real values. Never commit `.env` — add it to `.gitignore`.

On Render: set these under your service's **Environment** tab instead of uploading a `.env` file.

## Running locally / on Render

```bash
npm install
npm start
```

Render setup: Node web service, build command `npm install`, start command `npm start`, add the environment variables above.

## How predictions work

All logic lives in `services/predictionEngine.js` and is intentionally transparent (not a black-box model) so you can tune weights as real results come in:

- **Recent form** (last 5–10 matches): weighted 45% — biggest factor
- **Head-to-head** (last 10 meetings): weighted 25%
- **Home/away split** performance: weighted 20%
- **Competition type** (league/cup/friendly): weighted 10%, also dampens the confidence score since friendlies have smaller, noisier samples

Expected goals use a blend of each team's scoring form and the opponent's conceding form. Correct scores are generated from a Poisson distribution over the xG values. BTTS uses a Poisson-derived probability. Corners and cards are currently form-based estimates — wire in `getMatchStatsApiFootball()` for live stats once you have the API-Football key.

## What's not built yet (next steps)

- **Referee tendency data** — API-Football exposes some of this on paid tiers; worth revisiting once traffic justifies the cost
- **Injuries/suspensions** — no reliable free source found yet; flagged as a manual data-entry option if you want it sooner
- **Accuracy tracker cron job** — `models/Prediction.js` has the `actualResult` fields ready, but you'll need a scheduled job (node-cron is already a dependency) to fetch final scores and settle predictions automatically
- **WhatsApp/Telegram push alerts** for favorited teams — not scaffolded, but your existing Baileys/Telegraf experience makes this a straightforward add-on later
- Friendlies fixture source: football-data.org's friendly coverage is inconsistent — may need a second source or manual entry during pre-season windows
