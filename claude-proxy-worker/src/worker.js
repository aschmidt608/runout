/**
 * Claude API proxy for Runout's friends-demo page.
 *
 * Holds the account owner's Anthropic API key as a server-side secret so it
 * never ships to the browser. Requests must include a shared demo password
 * (not a strong security boundary -- just a light gate so the link can't be
 * used by anyone who stumbles on it), and are capped at a daily count via
 * Workers KV so a friend can't run up an unbounded bill.
 *
 * Also proxies GetSongBPM lookups the same way, so demo users don't need
 * their own GetSongBPM key either (lower stakes than the Anthropic key --
 * a free lookup service with no billing exposure -- so no daily cap here).
 *
 * Also tracks real token usage (from Anthropic's own response) per day in
 * KV, so the account owner can see actual aggregate demo spend on the
 * usage dashboard (dashboard.html) rather than guessing.
 *
 * Endpoints:
 *   POST /demo/verify       { password } -> { ok: true } or 401, no
 *                           Anthropic call and no effect on the daily
 *                           count -- just lets the page confirm the
 *                           password immediately.
 *   POST /demo/generate     { password, model, max_tokens, system, messages }
 *                           -> whatever Anthropic's Messages API returns
 *   POST /demo/scan         { password, system, schema, images, text }
 *                           -> whatever Anthropic's Messages API returns.
 *                           For scan.html (record photo -> identification).
 *                           Model, effort and output size are fixed here, the
 *                           answer is forced into the page's JSON schema, and
 *                           only a few photos are accepted -- so the password
 *                           can't be used to run arbitrary requests on the key.
 *                           Separate daily cap (SCAN_DAILY_LIMIT, default 100)
 *                           and separate usage records from /demo/generate.
 *   POST /demo/bpm          { password, artist, title } -> { bpm: number|null }
 *   POST /demo/usage-stats  { password } -> { days: [{date, inputTokens,
 *                           outputTokens, generations}, ...] }
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const GETSONGBPM_SEARCH_URL = 'https://api.getsong.co/search/';

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

const SCAN_MODEL = 'claude-opus-5-5';
const SCAN_MAX_PHOTOS = 4;
const SCAN_MAX_PHOTO_CHARS = 3_000_000; // base64 chars; the page sends ~1568px JPEGs, well under this
const SCAN_MAX_SYSTEM_CHARS = 10_000;

async function checkAndIncrementDailyCount(kv, limit, prefix = 'count') {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${prefix}:${today}`;
  const current = parseInt(await kv.get(key), 10) || 0;
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: 172800 });
  return true;
}

async function recordUsage(kv, usage, prefix = 'usage') {
  if (!usage) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${prefix}:${today}`;
  const current = JSON.parse((await kv.get(key)) || '{"inputTokens":0,"outputTokens":0,"generations":0}');
  current.inputTokens += usage.input_tokens || 0;
  current.outputTokens += usage.output_tokens || 0;
  current.generations += 1;
  await kv.put(key, JSON.stringify(current), { expirationTtl: 60 * 60 * 24 * 400 });
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
        try {
          const parsed = JSON.parse(text);
          await recordUsage(env.RUNOUT_DEMO_KV, parsed.usage);
        } catch (e) {}
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      } catch (e) {
        return json({ error: e.message || 'Internal error' }, 500, origin);
      }
    }

    if (url.pathname === '/demo/scan' && request.method === 'POST') {
      try {
        const { password, system, schema, images, text } = await request.json();

        if (!password || password !== env.DEMO_PASSWORD) {
          return json({ error: 'Wrong password.' }, 401, origin);
        }
        if (typeof system !== 'string' || !system || system.length > SCAN_MAX_SYSTEM_CHARS) {
          return json({ error: 'system prompt missing or too long' }, 400, origin);
        }
        if (!schema || typeof schema !== 'object') {
          return json({ error: 'schema required' }, 400, origin);
        }
        if (!Array.isArray(images) || !images.length || images.length > SCAN_MAX_PHOTOS
            || images.some(i => typeof i !== 'string' || !i || i.length > SCAN_MAX_PHOTO_CHARS)) {
          return json({ error: `send 1-${SCAN_MAX_PHOTOS} JPEG photos` }, 400, origin);
        }

        const limit = parseInt(env.SCAN_DAILY_LIMIT, 10) || 100;
        const allowed = await checkAndIncrementDailyCount(env.RUNOUT_DEMO_KV, limit, 'scan-count');
        if (!allowed) {
          return json({ error: `Scanning has hit its daily limit of ${limit} -- try again tomorrow.` }, 429, origin);
        }

        const content = images.map(data => ({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data }
        }));
        content.push({ type: 'text', text: String(text || 'Identify this record.').slice(0, 500) });

        const res = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            // If the primary model declines, the API re-runs on a fallback
            // model in the same request instead of just stopping.
            'anthropic-beta': 'server-side-fallback-2026-07-01'
          },
          body: JSON.stringify({
            model: SCAN_MODEL,
            max_tokens: 16000,
            fallbacks: 'default',
            system,
            output_config: { effort: 'low', format: { type: 'json_schema', schema } },
            messages: [{ role: 'user', content }]
          })
        });
        const body = await res.text();
        try {
          await recordUsage(env.RUNOUT_DEMO_KV, JSON.parse(body).usage, 'scan-usage');
        } catch (e) {}
        return new Response(body, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      } catch (e) {
        return json({ error: e.message || 'Internal error' }, 500, origin);
      }
    }

    if (url.pathname === '/demo/bpm' && request.method === 'POST') {
      try {
        const { password, artist, title } = await request.json();
        if (!password || password !== env.DEMO_PASSWORD) {
          return json({ error: 'Wrong password.' }, 401, origin);
        }
        if (!artist || !title) {
          return json({ error: 'artist and title required' }, 400, origin);
        }

        const lookup = `song:${title} artist:${artist}`;
        const bpmUrl = `${GETSONGBPM_SEARCH_URL}?api_key=${encodeURIComponent(env.GETSONGBPM_API_KEY)}&type=both&lookup=${encodeURIComponent(lookup)}`;
        const res = await fetch(bpmUrl);
        if (!res.ok) return json({ bpm: null }, 200, origin);
        const data = await res.json();
        const tempo = data?.search?.[0]?.tempo;
        const bpm = Math.round(parseFloat(tempo));
        return json({ bpm: Number.isFinite(bpm) ? bpm : null }, 200, origin);
      } catch (e) {
        return json({ bpm: null }, 200, origin);
      }
    }

    if (url.pathname === '/demo/usage-stats' && request.method === 'POST') {
      try {
        const { password } = await request.json();
        if (!password || password !== env.DEMO_PASSWORD) {
          return json({ error: 'Wrong password.' }, 401, origin);
        }

        const list = await env.RUNOUT_DEMO_KV.list({ prefix: 'usage:' });
        const days = [];
        for (const k of list.keys) {
          const val = await env.RUNOUT_DEMO_KV.get(k.name);
          if (!val) continue;
          const parsed = JSON.parse(val);
          days.push({ date: k.name.slice('usage:'.length), ...parsed });
        }
        days.sort((a, b) => a.date.localeCompare(b.date));
        return json({ days }, 200, origin);
      } catch (e) {
        return json({ error: e.message || 'Internal error' }, 500, origin);
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  }
};
