# Runout Discogs OAuth Worker

Discogs only supports OAuth 1.0a, which requires the Consumer Secret to sign
every authenticated request (not just the initial handshake). That secret
can't safely live in `index.html`'s client-side JS, so this Worker holds it
and does the signing on the browser's behalf -- the resulting access token
lives in the browser's own `localStorage`, same as everything else in Runout.

## Deploy

1. Install [wrangler](https://developers.cloudflare.com/workers/wrangler/) if you don't have it: `npm install -g wrangler`
2. From this directory: `wrangler login` (one-time, opens a browser to authorize the CLI)
3. Set the two secrets (you'll be prompted to paste each one -- they're never written to any file here):
   ```
   wrangler secret put DISCOGS_CONSUMER_KEY
   wrangler secret put DISCOGS_CONSUMER_SECRET
   ```
4. Deploy: `wrangler deploy`
5. Note the URL wrangler prints (looks like `https://runout-discogs-oauth.<your-subdomain>.workers.dev`) -- that's what `index.html` needs to call.

## Automatic deploys

`.github/workflows/deploy-discogs-worker.yml` redeploys this Worker whenever
anything under `discogs-oauth-worker/` changes on `main` (or on demand from the
Actions tab). It needs one repo secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare
API token made from the "Edit Cloudflare Workers" template. Add
`CLOUDFLARE_ACCOUNT_ID` too if the token can see more than one account.
Without the token the workflow just skips. The Worker's own secrets live in
Cloudflare and aren't touched by deploys.

## Endpoints

- `POST /discogs/request-token` `{ callbackUrl }` -> `{ oauth_token, oauth_token_secret }`
- `POST /discogs/access-token` `{ oauth_token, oauth_token_secret, oauth_verifier }` -> `{ oauth_token, oauth_token_secret }` (Discogs doesn't return a username here -- call `/discogs/proxy` with `path: "/oauth/identity"` afterward to get it)
- `POST /discogs/proxy` `{ oauth_token, oauth_token_secret, path, method? }` -> whatever Discogs returns for that path, passed through as-is
- `POST /discogs/public` `{ path }` -> same, but with no user login: signed with the app's own key/secret (Discogs accepts that for database search). GET-only and limited to `/database/search?...` and `/releases/{id}`. Used by `scan.html` so record lookups work for anyone, logged in or not.
