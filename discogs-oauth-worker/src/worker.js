/**
 * Discogs OAuth 1.0a signing proxy for Runout.
 *
 * Discogs only supports OAuth 1.0a, which requires the Consumer Secret to
 * sign every authenticated request (not just the initial handshake) -- so
 * unlike Tidal/Spotify's OAuth 2.0 + PKCE, there's no way to do this purely
 * client-side. This Worker holds the Consumer Secret and does the signing;
 * everything else (the resulting access token/secret) lives in the
 * browser's own localStorage, same as the rest of Runout.
 *
 * Endpoints:
 *   POST /discogs/request-token  { callbackUrl } -> { oauth_token, oauth_token_secret }
 *   POST /discogs/access-token   { oauth_token, oauth_token_secret, oauth_verifier }
 *                                -> { oauth_token, oauth_token_secret }
 *                                (no username here -- call /discogs/proxy with
 *                                path "/oauth/identity" afterward to get it)
 *   POST /discogs/proxy          { oauth_token, oauth_token_secret, path, method? }
 *                                -> whatever Discogs returns, passed through as-is
 */

const DISCOGS_API = 'https://api.discogs.com';
const USER_AGENT = 'Runout/1.0 +personal-use-worker';

function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function generateNonce(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha1(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildOAuthHeader({ method, url, consumerKey, consumerSecret, token, tokenSecret, extraParams = {} }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token } : {}),
    ...extraParams
  };

  const urlObj = new URL(url);
  const queryParams = {};
  for (const [k, v] of urlObj.searchParams.entries()) queryParams[k] = v;
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  const allParams = { ...queryParams, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), percentEncode(baseUrl), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || '')}`;
  const signature = await hmacSha1(signingKey, baseString);

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return 'OAuth ' + Object.keys(headerParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');
}

function parseFormBody(text) {
  const params = {};
  for (const pair of text.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return params;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === '/discogs/request-token' && request.method === 'POST') {
        const { callbackUrl } = await request.json();
        if (!callbackUrl) return json({ error: 'callbackUrl required' }, 400, origin);

        const requestUrl = `${DISCOGS_API}/oauth/request_token`;
        const authHeader = await buildOAuthHeader({
          method: 'GET',
          url: requestUrl,
          consumerKey: env.DISCOGS_CONSUMER_KEY,
          consumerSecret: env.DISCOGS_CONSUMER_SECRET,
          extraParams: { oauth_callback: callbackUrl }
        });

        const res = await fetch(requestUrl, { headers: { Authorization: authHeader, 'User-Agent': USER_AGENT } });
        const text = await res.text();
        if (!res.ok) return json({ error: `Discogs returned ${res.status}: ${text}` }, 502, origin);
        const parsed = parseFormBody(text);
        return json({ oauth_token: parsed.oauth_token, oauth_token_secret: parsed.oauth_token_secret }, 200, origin);
      }

      if (url.pathname === '/discogs/access-token' && request.method === 'POST') {
        const { oauth_token, oauth_token_secret, oauth_verifier } = await request.json();
        if (!oauth_token || !oauth_token_secret || !oauth_verifier) {
          return json({ error: 'oauth_token, oauth_token_secret, oauth_verifier required' }, 400, origin);
        }

        const requestUrl = `${DISCOGS_API}/oauth/access_token`;
        const authHeader = await buildOAuthHeader({
          method: 'POST',
          url: requestUrl,
          consumerKey: env.DISCOGS_CONSUMER_KEY,
          consumerSecret: env.DISCOGS_CONSUMER_SECRET,
          token: oauth_token,
          tokenSecret: oauth_token_secret,
          extraParams: { oauth_verifier }
        });

        const res = await fetch(requestUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'User-Agent': USER_AGENT }
        });
        const text = await res.text();
        if (!res.ok) return json({ error: `Discogs returned ${res.status}: ${text}` }, 502, origin);
        const parsed = parseFormBody(text);
        return json({
          oauth_token: parsed.oauth_token,
          oauth_token_secret: parsed.oauth_token_secret
        }, 200, origin);
      }

      if (url.pathname === '/discogs/proxy' && request.method === 'POST') {
        const { oauth_token, oauth_token_secret, path, method } = await request.json();
        if (!oauth_token || !oauth_token_secret || !path) {
          return json({ error: 'oauth_token, oauth_token_secret, path required' }, 400, origin);
        }
        if (!path.startsWith('/')) return json({ error: 'path must start with /' }, 400, origin);

        const httpMethod = method || 'GET';
        const requestUrl = `${DISCOGS_API}${path}`;
        const authHeader = await buildOAuthHeader({
          method: httpMethod,
          url: requestUrl,
          consumerKey: env.DISCOGS_CONSUMER_KEY,
          consumerSecret: env.DISCOGS_CONSUMER_SECRET,
          token: oauth_token,
          tokenSecret: oauth_token_secret
        });

        const res = await fetch(requestUrl, {
          method: httpMethod,
          headers: { Authorization: authHeader, 'User-Agent': USER_AGENT, Accept: 'application/json' }
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
        });
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: e.message || 'Internal error' }, 500, origin);
    }
  }
};
