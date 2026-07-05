/**
 * Claude API proxy for Runout's friends-demo page.
 *
 * Holds the account owner's Anthropic API key as a server-side secret so it
 * never ships to the browser. Requests must include a shared demo password
 * (not a strong security boundary -- just a light gate so the link can't be
 * used by anyone who stumbles on it), and are capped at a daily count via
 * Workers KV so a friend can't run up an unbounded bill.
 *
 * Endpoints:
 *   POST /demo/verify    { password } -> { ok: true } or 401, no Anthropic
 *                        call and no effect on the daily count -- just lets
 *                        the page confirm the password immediately.
 *   POST /demo/generate  { password, model, max_tokens, system, messages }
 *                        -> whatever Anthropic's Messages API returns
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

async function checkAndIncrementDailyCount(kv, limit) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `count:${today}`;
  const current = parseInt(await kv.get(key), 10) || 0;
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: 172800 });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (url.pathname === '/demo/verify' && request.method === 'POST') {
      try {
        const { password } = await request.json();
        if (!password || password !== env.DEMO_PASSWORD) {
          return json({ error: 'Wrong password.' }, 401, origin);
        }
        return json({ ok: true }, 200, origin);
      } catch (e) {
        return json({ error: e.message || 'Internal error' }, 500, origin);
      }
    }

    if (url.pathname === '/demo/generate' && request.method === 'POST') {
      try {
        const { password, model, max_tokens, system, messages } = await request.json();

        if (!password || password !== env.DEMO_PASSWORD) {
          return json({ error: 'Wrong password.' }, 401, origin);
        }
        if (!model || !messages) {
          return json({ error: 'model and messages required' }, 400, origin);
        }

        const limit = parseInt(env.DAILY_REQUEST_LIMIT, 10) || 50;
        const allowed = await checkAndIncrementDailyCount(env.RUNOUT_DEMO_KV, limit);
        if (!allowed) {
          return json({ error: `Demo has hit its daily limit of ${limit} generations -- try again tomorrow.` }, 429, origin);
        }

        const res = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({ model, max_tokens, system, messages })
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      } catch (e) {
        return json({ error: e.message || 'Internal error' }, 500, origin);
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  }
};
