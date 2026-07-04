# Runout — remaining v1 work

- [x] **Discogs authentication (OAuth login instead of manual personal token)**
  Done. Discogs is OAuth 1.0a-only, which needs a Consumer Secret to sign every authenticated request (not just the handshake) — built a small stateless Cloudflare Worker (`discogs-oauth-worker/`) that holds the secret and signs requests on the browser's behalf. Connecting Discogs now fetches the full collection automatically, no local script needed. The manual `fetch_discogs_collection.py` + file-drop path remains as a fallback. The two collection-source panels are now merged into a single tabbed panel (Connect Discogs / Load manually) instead of both always showing, to cut down on page length.

- [ ] **Spotify support**
  Same OAuth Authorization Code + PKCE pattern already proven out for Tidal (no backend needed). Spotify apps start in "Development Mode," capped at 25 manually-allowlisted users, until approved for extended/public quota.

- [ ] **YouTube Music support**
  Not yet researched — need to check whether YouTube Music/Google's API supports playlist creation via a self-serve OAuth flow the same way Tidal and Spotify do, or whether it has similar restrictions to what we initially assumed (incorrectly) about Tidal.

- [x] **Truncate/collapse the genre and style chip lists**
  Done. Both chip groups cap at 16 visible entries with a "Show N more" / "Show less" toggle; already-selected chips stay visible even when collapsed so an active filter never silently vanishes.

- [x] **BPM enrichment for the Connect Discogs path** — code done, live end-to-end verification still pending
  GetSongBPM's API sends permissive CORS headers, so the lookup runs directly from the browser (no Worker changes needed) — added an optional GetSongBPM key field to the Connect Discogs pane, same rate-limited lookup pacing as the local script. Both collection sources now support BPM enrichment equally in code, but we couldn't confirm a real successful lookup live: GetSongBPM appears to be having a service outage (main site 503s with "capacity problems," and even documented example queries return "no result" with a freshly-activated, confirmed-valid key). Worth retrying the actual search once their service recovers — no reason to think the code itself is wrong, just unverified end-to-end.

- [x] **DSP account refresh — resolved, not buildable as originally scoped**
  Confirmed: Discogs' OAuth 1.0a tokens never expire (valid until manually revoked), so there's nothing to refresh there — the footer copy was just wrong and has been corrected. Tidal's token exchange genuinely returns no `refresh_token` (confirmed empirically) for a real registered third-party PKCE app, unlike unofficial libraries (e.g. `tidalapi`) that appear to borrow different/native client credentials — so there's no refresh token to silently renew with, and reconnecting after Tidal's ~4hr expiry requires the full interactive login same as a manual reconnect. If this becomes annoying in practice, the next idea would be a smoother one-click reconnect prompt rather than actual silent refresh, since silent refresh isn't available.

- [ ] **Filter by media format (7"/45s vs. 12"/LPs, etc.)**
  Let a set be limited to just singles, just LPs, etc. Real scope gap: Discogs' `basic_information.formats` array has both a `name` (almost always just "Vinyl" for a vinyl collection) and a `descriptions` array (e.g. `["LP", "Album"]` or `["7\"", "45 RPM", "Single"]`) — the actual useful signal for this filter is `descriptions`, but neither `fetch_discogs_collection.py` nor the Connect Discogs OAuth fetch path capture it today (only `name` is kept). Needs: (1) both collection-fetch paths updated to also store format descriptors per release, (2) a filter UI (chips or a dropdown, sourced from the distinct descriptors across the loaded collection), (3) `applyFilters()` updated to filter on it. Existing already-fetched collections (local JSON files, or previously-loaded Discogs sessions) won't have this field until re-fetched.
