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

- [x] **DSP account refresh — resolved, not buildable as originally scoped**
  Confirmed: Discogs' OAuth 1.0a tokens never expire (valid until manually revoked), so there's nothing to refresh there — the footer copy was just wrong and has been corrected. Tidal's token exchange genuinely returns no `refresh_token` (confirmed empirically) for a real registered third-party PKCE app, unlike unofficial libraries (e.g. `tidalapi`) that appear to borrow different/native client credentials — so there's no refresh token to silently renew with, and reconnecting after Tidal's ~4hr expiry requires the full interactive login same as a manual reconnect. If this becomes annoying in practice, the next idea would be a smoother one-click reconnect prompt rather than actual silent refresh, since silent refresh isn't available.
