# Runout Claude Proxy Worker

Holds the account owner's Anthropic API key as a server-side secret so it
never ships to the browser -- used by `demo.html`, a variant of Runout meant
for friends to try without needing their own Anthropic API key. Requests
must include a shared password (not a strong security boundary -- just a
light gate) and are capped at a daily count so a friend can't run up an
unbounded bill on the owner's account.

## Deploy

1. Install [wrangler](https://developers.cloudflare.com/workers/wrangler/) if you don't have it: `npm install -g wrangler`
2. From this directory: `wrangler login` (one-time, opens a browser to authorize the CLI)
3. Create the KV namespace used for the daily request counter:
   ```
   wrangler kv namespace create RUNOUT_DEMO_KV
   ```
   This prints an `id` -- paste it into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.
4. Set the two secrets (you'll be prompted to paste each one -- they're never written to any file here):
   ```
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put DEMO_PASSWORD
   ```
5. Deploy: `wrangler deploy`
6. Note the URL wrangler prints (looks like `https://runout-claude-proxy.<your-subdomain>.workers.dev`) -- that's what `demo.html` needs to call.

Adjust the daily caps with the plain-text variables `DAILY_REQUEST_LIMIT` (set-prep generations, default 50) and `SCAN_DAILY_LIMIT` (record scans, default 100) in the Cloudflare dashboard (Worker > Settings > Variables). No redeploy needed.

## Automatic deploys

`.github/workflows/deploy-claude-worker.yml` redeploys this Worker whenever anything under `claude-proxy-worker/` changes on `main` (or on demand from the Actions tab), using the same `CLOUDFLARE_API_TOKEN` repo secret as the Discogs Worker. It reads the KV namespace id from the live Worker's settings, so the placeholder in `wrangler.toml` never needs filling in. Secrets and dashboard variables are kept.

## Endpoint

- `POST /demo/scan` `{ password, system, schema, images, text }` -> Anthropic's response for a record-photo identification (used by `scan.html` when a friend signs in with the password). Model, effort and output size are fixed in the Worker, the answer is forced into the page's JSON schema, and at most 4 photos are accepted. Has its own daily cap, `SCAN_DAILY_LIMIT` (default 100), and its own usage records (`scan-usage:` keys), separate from `/demo/generate`.
- `POST /demo/generate` `{ password, model, max_tokens, system, messages }` -> whatever Anthropic's Messages API returns, passed through as-is (or `{ error }` with 401 for a wrong password, 429 once the daily cap is hit)
