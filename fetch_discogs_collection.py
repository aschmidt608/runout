#!/usr/bin/env python3
"""
Pulls your full Discogs collection (with genre/style/year data that Discogs'
own CSV export leaves out) into a single JSON file for Runout.

Usage:
    python fetch_discogs_collection.py YOUR_USERNAME YOUR_TOKEN [GETSONGBPM_API_KEY]

Get a Discogs token at: https://www.discogs.com/settings/developers
("Generate new token" -- no OAuth app registration needed.)

The GetSongBPM API key is optional. Without it, releases are written with
"bpm": null and the app falls back to today's advisory-hint behavior. With
it, get a free key at https://getsongbpm.com/api and each release is
looked up by artist/title -- coverage will be partial, especially for
obscure or vinyl-only pressings that aren't in GetSongBPM's database.

Requires only the Python standard library -- nothing to install.
Writes discogs_collection.json in the current directory.
"""

import re
import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse

PER_PAGE = 100
USER_AGENT = "Runout/1.0 +personal-use-script"
BPM_SEARCH_URL = "https://api.getsong.co/search/"
BPM_REQUEST_DELAY = 0.6  # be polite; GetSongBPM doesn't publish a rate limit


def fetch_page(username, token, page):
    url = (
        f"https://api.discogs.com/users/{urllib.parse.quote(username)}"
        f"/collection/folders/0/releases"
        f"?token={urllib.parse.quote(token)}&per_page={PER_PAGE}&page={page}&sort=artist"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            sys.exit("Discogs rejected the token. Check it's valid and hasn't been revoked.")
        if e.code == 404:
            sys.exit("Username not found, or the collection isn't visible to this token.")
        sys.exit(f"Discogs returned HTTP {e.code}: {e.reason}")


def fetch_bpm(artist, title, bpm_key):
    """Best-effort BPM lookup via GetSongBPM. Returns an int or None -- any
    failure (no match, bad response, network error) is treated as "unknown"
    rather than aborting the run."""
    lookup = f"song:{title} artist:{artist}"
    url = (
        f"{BPM_SEARCH_URL}?api_key={urllib.parse.quote(bpm_key)}"
        f"&type=song&lookup={urllib.parse.quote(lookup)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        tempo = data.get("search", [{}])[0].get("tempo")
        return int(round(float(tempo)))
    except Exception:
        return None


def main():
    if len(sys.argv) not in (3, 4):
        sys.exit("Usage: python fetch_discogs_collection.py YOUR_USERNAME YOUR_TOKEN [GETSONGBPM_API_KEY]")

    username, token = sys.argv[1], sys.argv[2]
    bpm_key = sys.argv[3] if len(sys.argv) == 4 else None

    print(f"Fetching collection for '{username}'...")
    first = fetch_page(username, token, 1)
    pages = first.get("pagination", {}).get("pages", 1)
    all_releases = list(first.get("releases", []))

    for page in range(2, pages + 1):
        print(f"  page {page} of {pages}...")
        time.sleep(1.1)  # stay comfortably under Discogs' 60 req/min authenticated limit
        data = fetch_page(username, token, page)
        all_releases.extend(data.get("releases", []))

    releases = []
    for r in all_releases:
        bi = r.get("basic_information", {})
        artists = bi.get("artists", [])
        # Discogs disambiguates same-named artists with a trailing " (2)" etc. -- strip it.
        artist_name = ", ".join(
            re.sub(r"\s*\(\d+\)$", "", a["name"]) for a in artists
        ) or "Unknown Artist"

        releases.append({
            "id": r.get("id"),
            "artist": artist_name,
            "title": bi.get("title", "Untitled"),
            "year": bi.get("year") or None,
            "genres": bi.get("genres", []),
            "styles": bi.get("styles", []),
            "labels": [l.get("name") for l in bi.get("labels", [])],
            "format": ", ".join(f.get("name", "") for f in bi.get("formats", [])),
            "resourceUrl": f"https://www.discogs.com/release/{bi.get('id', r.get('id'))}",
            "bpm": None,
        })

    if bpm_key:
        print(f"Looking up BPM for {len(releases)} releases via GetSongBPM (best-effort, coverage will be partial)...")
        found = 0
        for i, rel in enumerate(releases, 1):
            rel["bpm"] = fetch_bpm(rel["artist"], rel["title"], bpm_key)
            if rel["bpm"] is not None:
                found += 1
            if i % 10 == 0 or i == len(releases):
                print(f"  bpm lookup {i}/{len(releases)}... ({found} matched so far)")
            time.sleep(BPM_REQUEST_DELAY)
        print(f"BPM matched for {found} of {len(releases)} releases.")

    out = {
        "username": username,
        "syncedAt": int(time.time() * 1000),
        "releases": releases,
    }

    with open("discogs_collection.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=None)

    print(f"Done. {len(releases)} releases written to discogs_collection.json")
    print("Drop that file into Runout's collection loader.")


if __name__ == "__main__":
    main()
