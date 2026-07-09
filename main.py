"""
Cymor Movie Hub — moviebox-api wrapper
---------------------------------------
A thin FastAPI service wrapping github.com/Simatwa/moviebox-api (v1) so
Cymor Movie Hub's Node/Express backend can talk to it over plain HTTP.

Endpoints:
  GET  /health
  GET  /search?query=&type=movie|series&page=&per_page=
  GET  /movie/details?page_url=
  GET  /movie/files?page_url=
  GET  /movie/stream?page_url=&quality=&language=
  GET  /series/details?page_url=
  GET  /series/files?page_url=&season=&episode=
  GET  /series/stream?page_url=&season=&episode=&quality=&language=
  GET  /proxy?url=<encoded moviebox cdn url>   (streams bytes, supports Range)

Deploy on Render as a Python web service:
  Build command: pip install -r requirements.txt
  Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
"""

import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from moviebox_api.v1 import (
    DownloadableMovieFilesDetail,
    DownloadableTVSeriesFilesDetail,
    MovieDetails,
    Search,
    Session,
    SubjectType,
    TVSeriesDetails,
)

app = FastAPI(title="Cymor Movie Hub — Moviebox Wrapper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel domain(s) once live
    allow_methods=["*"],
    allow_headers=["*"],
)

# The moviebox CDN checks that requests "come from" its own site. When we
# proxy video/subtitle bytes through this backend, we set these headers
# ourselves so the frontend never needs to worry about it.
MOVIEBOX_ORIGIN = os.environ.get("MOVIEBOX_ORIGIN", "https://h5.aoneroom.com")
PROXY_HEADERS = {
    "Referer": MOVIEBOX_ORIGIN + "/",
    "Origin": MOVIEBOX_ORIGIN,
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    ),
}


def new_session() -> Session:
    """Fresh moviebox-api session per request. Simple and safe for a
    low-traffic personal API; swap for a shared session later if needed."""
    return Session()


def model_json(model):
    """Serialize a moviebox-api pydantic model to plain JSON-safe dict."""
    return model.model_dump(mode="json")


def build_proxy_url(request: Request, target_url: str) -> str:
    base = str(request.base_url).rstrip("/")
    from urllib.parse import quote

    return f"{base}/proxy?url={quote(target_url, safe='')}"


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- search --
@app.get("/search")
async def search(
    query: str = Query(..., description="Search term, e.g. 'Avatar'"),
    type: str = Query("movie", pattern="^(movie|series)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
):
    subject_type = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SERIES
    session = new_session()
    try:
        s = Search(session, query=query, subject_type=subject_type, page=page, per_page=per_page)
        results = await s.get_content()  # already a plain dict
        return results
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox search failed: {exc}")


# ------------------------------------------------------------ movie: meta --
@app.get("/movie/details")
async def movie_details(page_url: str = Query(..., description="target_item.page_url from /search")):
    session = new_session()
    try:
        md = MovieDetails(page_url, session=session)
        details = await md.get_content_model()
        return model_json(details)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox movie details failed: {exc}")


@app.get("/movie/files")
async def movie_files(page_url: str = Query(...)):
    session = new_session()
    try:
        md = MovieDetails(page_url, session=session)
        details_model = await md.get_content_model()
        files = DownloadableMovieFilesDetail(session, details_model)
        detail = await files.get_content_model()
        return model_json(detail)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox movie files failed: {exc}")


@app.get("/movie/stream")
async def movie_stream(
    request: Request,
    page_url: str = Query(...),
    quality: Optional[str] = Query(None, description="e.g. 1080p, 720p, 480p"),
    language: Optional[str] = Query("English", description="subtitle language"),
):
    session = new_session()
    try:
        md = MovieDetails(page_url, session=session)
        details_model = await md.get_content_model()
        files = DownloadableMovieFilesDetail(session, details_model)
        detail = await files.get_content_model()

        video = None
        if quality:
            video = next((v for v in detail.downloads if getattr(v, "quality", None) == quality), None)
        if video is None:
            video = detail.best_media_file

        subtitle = None
        try:
            subtitle = next(
                (c for c in detail.captions if getattr(c, "lanName", None) == language or getattr(c, "language", None) == language),
                None,
            ) or detail.english_subtitle_file
        except Exception:
            subtitle = None

        if video is None:
            raise HTTPException(status_code=404, detail="No playable video file found")

        video_url = getattr(video, "url", None)
        subtitle_url = getattr(subtitle, "url", None) if subtitle else None

        return {
            "title": getattr(details_model, "title", None) or getattr(details_model, "name", None),
            "quality": getattr(video, "quality", None),
            "stream_url": build_proxy_url(request, video_url) if video_url else None,
            "direct_url": video_url,
            "subtitle_url": build_proxy_url(request, subtitle_url) if subtitle_url else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox movie stream failed: {exc}")


# ------------------------------------------------------------ series: meta --
@app.get("/series/details")
async def series_details(page_url: str = Query(...)):
    session = new_session()
    try:
        td = TVSeriesDetails(page_url, session=session)
        details = await td.get_content_model()
        return model_json(details)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox series details failed: {exc}")


@app.get("/series/files")
async def series_files(
    page_url: str = Query(...),
    season: int = Query(..., ge=1),
    episode: int = Query(..., ge=1),
):
    session = new_session()
    try:
        td = TVSeriesDetails(page_url, session=session)
        details_model = await td.get_content_model()
        files = DownloadableTVSeriesFilesDetail(session, details_model)
        detail = await files.get_content_model(season=season, episode=episode)
        return model_json(detail)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox series files failed: {exc}")


@app.get("/series/stream")
async def series_stream(
    request: Request,
    page_url: str = Query(...),
    season: int = Query(..., ge=1),
    episode: int = Query(..., ge=1),
    quality: Optional[str] = Query(None),
    language: Optional[str] = Query("English"),
):
    session = new_session()
    try:
        td = TVSeriesDetails(page_url, session=session)
        details_model = await td.get_content_model()
        files = DownloadableTVSeriesFilesDetail(session, details_model)
        detail = await files.get_content_model(season=season, episode=episode)

        video = None
        if quality:
            video = next((v for v in detail.downloads if getattr(v, "quality", None) == quality), None)
        if video is None:
            video = detail.best_media_file

        subtitle = None
        try:
            subtitle = next(
                (c for c in detail.captions if getattr(c, "lanName", None) == language or getattr(c, "language", None) == language),
                None,
            ) or detail.english_subtitle_file
        except Exception:
            subtitle = None

        if video is None:
            raise HTTPException(status_code=404, detail="No playable video file found for this episode")

        video_url = getattr(video, "url", None)
        subtitle_url = getattr(subtitle, "url", None) if subtitle else None

        return {
            "title": getattr(details_model, "title", None) or getattr(details_model, "name", None),
            "season": season,
            "episode": episode,
            "quality": getattr(video, "quality", None),
            "stream_url": build_proxy_url(request, video_url) if video_url else None,
            "direct_url": video_url,
            "subtitle_url": build_proxy_url(request, subtitle_url) if subtitle_url else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"moviebox series stream failed: {exc}")


# ------------------------------------------------------------------ proxy --
@app.get("/proxy")
async def proxy(request: Request, url: str = Query(..., description="Direct moviebox CDN URL to stream")):
    """Streams video/subtitle bytes through this backend with the headers
    moviebox's CDN expects, and forwards Range requests so <video> seeking
    works correctly."""
    range_header = request.headers.get("range")
    headers = dict(PROXY_HEADERS)
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    try:
        upstream_req = client.build_request("GET", url, headers=headers)
        upstream_resp = await client.send(upstream_req, stream=True)
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"upstream fetch failed: {exc}")

    if upstream_resp.status_code >= 400:
        await upstream_resp.aclose()
        await client.aclose()
        raise HTTPException(status_code=upstream_resp.status_code, detail="upstream returned an error")

    passthrough_headers = {}
    for h in ("content-type", "content-length", "content-range", "accept-ranges"):
        if h in upstream_resp.headers:
            passthrough_headers[h] = upstream_resp.headers[h]
    passthrough_headers.setdefault("accept-ranges", "bytes")

    async def body_iterator():
        try:
            async for chunk in upstream_resp.aiter_bytes(chunk_size=64 * 1024):
                yield chunk
        finally:
            await upstream_resp.aclose()
            await client.aclose()

    return StreamingResponse(
        body_iterator(),
        status_code=upstream_resp.status_code,
        headers=passthrough_headers,
        media_type=passthrough_headers.get("content-type", "application/octet-stream"),
    )
