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

- [x] **Filter by media format (7"/45s vs. 12"/LPs, etc.)**
  Done. Confirmed empirically (via real Discogs release payloads) that `formats[].descriptions` already carries exactly this data (e.g. `["7\"", "45 RPM", "Single"]` vs `["12\"", "33 ⅓ RPM"]`) — both `fetch_discogs_collection.py` and the Connect Discogs OAuth path now capture it as `formatDescriptors`. Added a "Media format" chip group (same collapsible pattern as genre/style) and wired it into `applyFilters()` as a hard filter, same style as genre/style. Existing already-fetched collections won't have this field until re-fetched.
