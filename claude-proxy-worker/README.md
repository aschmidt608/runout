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

Adjust the daily cap by editing `DAILY_REQUEST_LIMIT` in `wrangler.toml` (defaults to 50) and redeploying.

## Endpoint

- `POST /demo/generate` `{ password, model, max_tokens, system, messages }` -> whatever Anthropic's Messages API returns, passed through as-is (or `{ error }` with 401 for a wrong password, 429 once the daily cap is hit)
