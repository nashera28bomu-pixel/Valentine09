# Cymor Movie Hub — Moviebox Wrapper

A FastAPI service wrapping [`moviebox-api`](https://github.com/Simatwa/moviebox-api)
(docs: https://moviebox-api-docs.netlify.app/) so your Node/Express Movie Hub
backend can call it over plain HTTP instead of shelling out to Python.

Only **3 files** — deploys clean from GitHub mobile, no `src/` folder to flatten.

## Deploy on Render

1. Push these 3 files (`main.py`, `requirements.txt`, `render.yaml`) to a new GitHub repo.
2. On Render: **New → Blueprint** → connect the repo. It reads `render.yaml` automatically.
   - Or manually: **New → Web Service**, runtime **Python 3**, build command
     `pip install -r requirements.txt`, start command
     `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Wait for deploy, then hit `https://<your-service>.onrender.com/health` → `{"status":"ok"}`.

## How Cymor Movie Hub (Node) should call it

**1. Search**
```
GET /search?query=Avatar&type=movie&page=1
```
Returns raw moviebox search JSON. Grab `items[0].page_url` for the next steps.

**2. Get details (optional, for title/poster/cast page)**
```
GET /movie/details?page_url=/detail/avatar-WLDIi21IUBa?id=8906247916759695608
GET /series/details?page_url=...
```

**3. Get a playable stream (this is the one your player uses)**
```
GET /movie/stream?page_url=...&quality=1080p
GET /series/stream?page_url=...&season=1&episode=1&quality=720p
```
Response:
```json
{
  "title": "Avatar",
  "quality": "1080p",
  "stream_url": "https://<your-service>.onrender.com/proxy?url=...",
  "direct_url": "https://raw-cdn-url...",
  "subtitle_url": "https://<your-service>.onrender.com/proxy?url=..."
}
```
Point your `<video>` tag's `src` at **`stream_url`** (not `direct_url`) — it's
proxied through this backend with the Referer/Origin headers moviebox's CDN
expects, and it forwards Range requests so seeking works.

## Why the `/proxy` route exists

You already hit this wall with the walterwhite-69 fork: moviebox's CDN
rejects requests without the right Referer/Origin, and browsers won't fake
those for cross-origin `<video src>`. Rather than dealing with that in the
frontend, `/proxy` fetches the file server-side with the correct headers and
streams the bytes straight through — the frontend just sees a normal MP4 URL
on your own domain.

## Notes / things to verify after deploy

- The library expects Python ≥3.10ish (matches `.python-version` in the
  upstream repo) — `render.yaml` pins 3.11.9, adjust if Render complains.
- `MOVIEBOX_ORIGIN` env var controls the Referer/Origin sent by `/proxy`.
  If moviebox rotates hosts, the upstream repo also supports
  `MOVIEBOX_API_HOST` / `MOVIEBOX_API_HOST_V2` env vars for mirror hosts —
  add those on Render if `h5.aoneroom.com` stops resolving
  (`moviebox v1 mirror-hosts` lists current mirrors).
- CORS is wide open (`*`) for now — tighten `allow_origins` in `main.py` to
  your actual Vercel domain once Cymor Movie Hub's URL is fixed.
- Field names like `.lanName` for subtitle language on the caption model are
  my best read of the docs — if `/movie/stream` errors picking a subtitle by
  `language`, drop the `language` param and it'll just use
  `english_subtitle_file`; check the raw shape via `/movie/files` first.
