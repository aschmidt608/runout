# Runout — remaining v1 work

- [x] **Discogs authentication (OAuth login instead of manual personal token)**
  Done. Discogs is OAuth 1.0a-only, which needs a Consumer Secret to sign every authenticated request (not just the handshake) — built a small stateless Cloudflare Worker (`discogs-oauth-worker/`) that holds the secret and signs requests on the browser's behalf. Connecting Discogs now fetches the full collection automatically, no local script needed. The manual `fetch_discogs_collection.py` + file-drop path remains as a fallback and is currently the only path with BPM enrichment (not yet reimplemented for the OAuth fetch path).

- [ ] **Spotify support**
  Same OAuth Authorization Code + PKCE pattern already proven out for Tidal (no backend needed). Spotify apps start in "Development Mode," capped at 25 manually-allowlisted users, until approved for extended/public quota.

- [ ] **YouTube Music support**
  Not yet researched — need to check whether YouTube Music/Google's API supports playlist creation via a self-serve OAuth flow the same way Tidal and Spotify do, or whether it has similar restrictions to what we initially assumed (incorrectly) about Tidal.
