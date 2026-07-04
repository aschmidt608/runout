# Runout Discogs OAuth Worker

Discogs only supports OAuth 1.0a, which requires the Consumer Secret to sign
every authenticated request (not just the initial handshake). That secret
can't safely live in `runout.html`'s client-side JS, so this Worker holds it
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
5. Note the URL wrangler prints (looks like `https://runout-discogs-oauth.<your-subdomain>.workers.dev`) -- that's what `runout.html` needs to call.

## Endpoints

- `POST /discogs/request-token` `{ callbackUrl }` -> `{ oauth_token, oauth_token_secret }`
- `POST /discogs/access-token` `{ oauth_token, oauth_token_secret, oauth_verifier }` -> `{ oauth_token, oauth_token_secret, username }`
- `POST /discogs/proxy` `{ oauth_token, oauth_token_secret, path, method? }` -> whatever Discogs returns for that path, passed through as-is
