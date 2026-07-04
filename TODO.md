# Runout — remaining v1 work

- [x] **Discogs authentication (OAuth login instead of manual personal token)**
  Done. Discogs is OAuth 1.0a-only, which needs a Consumer Secret to sign every authenticated request (not just the handshake) — built a small stateless Cloudflare Worker (`discogs-oauth-worker/`) that holds the secret and signs requests on the browser's behalf. Connecting Discogs now fetches the full collection automatically, no local script needed. The manual `fetch_discogs_collection.py` + file-drop path remains as a fallback and is currently the only path with BPM enrichment (not yet reimplemented for the OAuth fetch path).

- [ ] **Spotify support**
  Same OAuth Authorization Code + PKCE pattern already proven out for Tidal (no backend needed). Spotify apps start in "Development Mode," capped at 25 manually-allowlisted users, until approved for extended/public quota.

- [ ] **YouTube Music support**
  Not yet researched — need to check whether YouTube Music/Google's API supports playlist creation via a self-serve OAuth flow the same way Tidal and Spotify do, or whether it has similar restrictions to what we initially assumed (incorrectly) about Tidal.

- [ ] **Truncate/collapse the genre and style chip lists**
  With a real collection loaded, these can run long (dozens of styles). Needs a "show more" affordance or a collapsed-by-default state rather than dumping every chip on screen.

- [ ] **BPM enrichment for the Connect Discogs path**
  The local script's optional GetSongBPM lookup isn't reimplemented for the OAuth auto-fetch path yet, so collections loaded via Connect Discogs never have BPM data. Would mean porting that lookup into either the Worker or client-side JS, called during `fetchDiscogsCollection()`.

- [ ] **DSP account refresh (Tidal/Discogs sessions expire and currently require manually reconnecting)**
  Tidal's token lasts ~4 hours with no refresh_token in the response we get today; Discogs' OAuth 1.0a access tokens don't expire the same way OAuth 2.0 ones do but haven't been checked for their actual behavior over time. Scope to confirm: does this mean implementing OAuth 2.0 refresh-token flow for Tidal (silently get a new access token before the old one expires), and/or something else for Discogs specifically? Worth clarifying exact scope before starting.
