# Runout — remaining v1 work

- [ ] **Discogs authentication (OAuth login instead of manual personal token)**
  Currently users generate their own Discogs personal access token and run `fetch_discogs_collection.py` locally. Discogs uses OAuth 1.0a, which needs a Consumer Secret that can't safely live in client-side JS — real "log in with Discogs" needs a small backend to broker the handshake (reopens the "no backend for v1" tradeoff). Other services clearly do this, so it's possible — worth revisiting how they structure it.

- [ ] **Spotify support**
  Same OAuth Authorization Code + PKCE pattern already proven out for Tidal (no backend needed). Spotify apps start in "Development Mode," capped at 25 manually-allowlisted users, until approved for extended/public quota.

- [ ] **YouTube Music support**
  Not yet researched — need to check whether YouTube Music/Google's API supports playlist creation via a self-serve OAuth flow the same way Tidal and Spotify do, or whether it has similar restrictions to what we initially assumed (incorrectly) about Tidal.
