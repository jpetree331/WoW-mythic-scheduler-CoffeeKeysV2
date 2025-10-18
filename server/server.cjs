// Minimal Node.js HTTP server backed by SQLite
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');
const { listPlayers, upsertPlayer, deletePlayer, clearPlayers, clearGeneralPlayers, getPlayer, updatePlayer, getBoardSettings, upsertBoardSettings, setCoffeeAssignment, setCoffeeAssignmentsBatch, clearCoffeeAssignments, clearCoffeePlayers, claimPlayersByClientId, listPlayersByDiscord, setMainForDiscord } = require('./db.cjs');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
// Storage moved to SQLite via server/db.js

function corsHeaders(req) {
  const origin = (req && req.headers && req.headers.origin) ? req.headers.origin : '*';
  const allowOrigin = origin === undefined ? '*' : origin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id, Cookie',
  };
}

function send(req, res, status, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
    ...headers,
  });
  res.end(json);
}

function notFound(req, res) {
  send(req, res, 404, { error: 'Not found' });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        // 1MB limit
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function generateId() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  );
}

// Admin token for destructive actions. Defaults to a preset if not provided via env.
// Default set per request to: OASISWOWCK
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'OASISWOWCK';

function isAuthorized(req) {
  if (!ADMIN_TOKEN) return true; // if no token set, allow all (development)
  const auth = req.headers['authorization'];
  if (!auth || !auth.toString().startsWith('Bearer ')) return false;
  const token = auth.toString().slice('Bearer '.length);
  return token === ADMIN_TOKEN;
}

const server = http.createServer(async (req, res) => {
  // Basic CORS preflight support
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders(req),
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Server-Sent Events for live updates
  if (req.method === 'GET' && pathname === '/events') {
    const board = url.searchParams.get('board') || 'default';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    // send initial comment to establish stream
    res.write(': connected\n\n');
    addClient(board, res);
    req.on('close', () => removeClient(board, res));
    return; // keep connection open
  }

  // Routes
  if (req.method === 'GET' && pathname === '/health') {
    return send(req, res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/health/db') {
    try {
      const data = await listPlayers('default');
      return send(req, res, 200, { ok: true, players: Array.isArray(data) ? data.length : 0 });
    } catch (e) {
      console.error('DB health failed:', e);
      return send(req, res, 500, { ok: false, error: e && e.message ? e.message : 'DB error' });
    }
  }

  // Debug schema endpoint (optional): inspect DB tables/columns
  if (req.method === 'GET' && pathname === '/debug/schema') {
    try {
      const { getClient } = require('./db.cjs.__internal');
      // fallback if not exposed
    } catch (_) {}
    try {
      const { createClient } = await import('@libsql/client');
      const url = process.env.DATABASE_URL || process.env.LIBSQL_DB_URL;
      const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.LIBSQL_DB_AUTH_TOKEN;
      const client = createClient({ url, authToken });
      const tables = await client.execute("SELECT name, sql FROM sqlite_master WHERE type='table'");
      const info = await client.execute('PRAGMA table_info(players)');
      return send(req, res, 200, { tables: tables.rows || [], players_info: info.rows || [] });
    } catch (e) {
      console.error('schema debug failed:', e);
      return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  // Admin verify: checks Authorization header only
  if (req.method === 'GET' && pathname === '/admin/verify') {
    if (!isAuthorized(req)) {
      return send(req, res, 401, { ok: false, error: 'Unauthorized' });
    }
    return send(req, res, 200, { ok: true });
  }

  // --- Discord OAuth ----
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.VITE_DISCORD_CLIENT_ID;
  const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
  const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
  const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'mff_session';

  function base64url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function signJwt(payload, ttlSeconds = 60 * 60 * 24 * 30) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { iat: now, exp: now + ttlSeconds, ...payload };
    const h = base64url(JSON.stringify(header));
    const b = base64url(JSON.stringify(body));
    const data = `${h}.${b}`;
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${data}.${sig}`;
  }
  function verifyJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [h, b, s] = parts;
      const data = `${h}.${b}`;
      const expect = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      if (expect !== s) return null;
      const body = JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
      if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
      return body;
    } catch { return null; }
  }
  function parseCookies(req) {
    const header = req.headers['cookie'];
    const out = {};
    if (!header) return out;
    String(header).split(';').forEach(part => {
      const idx = part.indexOf('=');
      if (idx > -1) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        out[k] = decodeURIComponent(v);
      }
    });
    return out;
  }
  function getSession(req) {
    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const payload = verifyJwt(token);
    return payload || null;
  }
  function setSessionCookie(req, res, payload) {
    const token = signJwt(payload);
    const isProd = process.env.NODE_ENV === 'production';
    const parts = [ `${COOKIE_NAME}=${encodeURIComponent(token)}` ];
    parts.push('Path=/');
    parts.push(`Max-Age=${60*60*24*30}`);
    parts.push('HttpOnly');
    if (isProd) {
      // Cross-site production deployments require SameSite=None; Secure
      parts.push('SameSite=None');
      parts.push('Secure');
    } else {
      // Local dev over http: avoid the SameSite=None; Secure requirement so cookie isn't rejected
      parts.push('SameSite=Lax');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
  }
  function clearSessionCookie(req, res) {
    const isProd = process.env.NODE_ENV === 'production';
    let header = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly;`;
    header += isProd ? ' SameSite=None; Secure' : ' SameSite=Lax';
    res.setHeader('Set-Cookie', header);
  }

  async function discordTokenExchange(code) {
    return await new Promise((resolve, reject) => {
      const data = querystring.stringify({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      });
      const reqOpts = {
        method: 'POST',
        hostname: 'discord.com',
        path: '/api/oauth2/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      };
      const r = https.request(reqOpts, (resp) => {
        let body = '';
        resp.on('data', (c) => body += c);
        resp.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.write(data);
      r.end();
    });
  }
  async function discordFetchMe(accessToken) {
    return await new Promise((resolve, reject) => {
      const reqOpts = {
        method: 'GET',
        hostname: 'discord.com',
        path: '/api/users/@me',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      };
      const r = https.request(reqOpts, (resp) => {
        let body = '';
        resp.on('data', (c) => body += c);
        resp.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      });
      r.on('error', reject);
      r.end();
    });
  }

  if (req.method === 'GET' && pathname === '/auth/discord/login') {
    if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
      return send(req, res, 500, { error: 'Discord OAuth not configured' });
    }
    const redirect = url.searchParams.get('redirect') || `${url.protocol}//${url.host}`;
    const state = Buffer.from(JSON.stringify({ r: redirect })).toString('base64');
    const authUrl = new URL('https://discord.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'identify');
    authUrl.searchParams.set('state', state);
    res.writeHead(302, { ...corsHeaders(req), Location: authUrl.toString() });
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/auth/discord/callback') {
    try {
      const code = url.searchParams.get('code');
      const stateRaw = url.searchParams.get('state');
      let redirectTo = '/';
      if (stateRaw) {
        try { const s = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf8')); if (s && s.r) redirectTo = s.r; } catch {}
      }
      if (!code) return send(req, res, 400, { error: 'Missing code' });
      const token = await discordTokenExchange(code);
      if (!token || !token.access_token) return send(req, res, 400, { error: 'Token exchange failed' });
      const me = await discordFetchMe(token.access_token);
      if (!me || !me.id) return send(req, res, 400, { error: 'Failed to fetch user' });
      const display = me.global_name || me.username || `discord:${me.id}`;
      setSessionCookie(req, res, { sub: String(me.id), username: me.username || null, global_name: me.global_name || null, avatar: me.avatar || null, discriminator: me.discriminator || null, display });
      // Redirect back to frontend
      res.writeHead(302, { ...corsHeaders(req), Location: redirectTo });
      return res.end();
    } catch (e) {
      console.error('discord callback failed:', e);
      return send(req, res, 500, { error: 'OAuth callback error' });
    }
  }

  if (req.method === 'GET' && pathname === '/me') {
    const sess = getSession(req);
    if (!sess) return send(req, res, 200, { user: null });
    return send(req, res, 200, { user: { id: sess.sub, username: sess.username, global_name: sess.global_name, avatar: sess.avatar, display: sess.display } });
  }

  if (req.method === 'POST' && pathname === '/auth/logout') {
    clearSessionCookie(req, res);
    return send(req, res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/auth/claim') {
    const sess = getSession(req);
    if (!sess) return send(req, res, 401, { error: 'Unauthorized' });
    const clientId = req.headers['x-client-id'] && String(req.headers['x-client-id']);
    if (!clientId) return send(req, res, 400, { error: 'Missing X-Client-Id' });
    try {
      const result = await claimPlayersByClientId(clientId, String(sess.sub), sess.global_name || sess.username || null);
      return send(req, res, 200, { ok: true, updated: result.updated });
    } catch (e) {
      console.error('claim failed:', e);
      return send(req, res, 500, { error: 'Internal Error' });
    }
  }

  // Board settings
  if (pathname === '/board') {
    const board = url.searchParams.get('board') || 'default';
    if (req.method === 'GET') {
      try {
        const data = await getBoardSettings(board);
        return send(req, res, 200, data);
      } catch (e) {
        return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!isAuthorized(req)) {
        return send(req, res, 401, { error: 'Unauthorized' });
      }
      try {
        const body = await parseBody(req);
        const next = await upsertBoardSettings(board, { title: typeof body?.title === 'string' ? body.title : null });
        broadcast(board, { type: 'board_updated' });
        return send(req, res, 200, next);
      } catch (e) {
        console.error('Failed to update board:', e);
        return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
  }

  // Coffee assignments
  if (pathname === '/coffee/assign') {
    if (!isAuthorized(req)) return send(req, res, 401, { error: 'Unauthorized' });
    if (req.method !== 'PATCH') return notFound(req, res);
    try {
      const body = await parseBody(req);
      let { id, day, tier, groupIndex } = body || {};
      if (!id || typeof id !== 'string') return send(req, res, 400, { error: 'Missing id' });
      // Normalize inputs
      day = (day === 'sat' || day === 'sun') ? day : null;
      tier = (tier === '2-5' || tier === '6-9' || tier === '10+') ? tier : (day ? null : null);
      if (groupIndex !== null && groupIndex !== undefined) {
        const n = parseInt(groupIndex, 10);
        groupIndex = Number.isFinite(n) ? n : null;
      }
      await setCoffeeAssignment(id, day, tier, groupIndex);
      const player = await getPlayer(id);
      if (player) broadcast(player.board || 'default', { type: 'player_updated', id });
      return send(req, res, 200, { ok: true });
    } catch (e) {
      console.error('PATCH /coffee/assign failed:', e);
      return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/coffee/assign-batch') {
    if (!isAuthorized(req)) return send(req, res, 401, { error: 'Unauthorized' });
    if (req.method !== 'POST') return notFound(req, res);
    try {
      const board = url.searchParams.get('board') || 'default';
      const body = await parseBody(req);
      let { day, assignments, clearOthers } = body || {};
      day = (day === 'sat' || day === 'sun') ? day : null;
      if (!day || !assignments || !Array.isArray(assignments)) return send(req, res, 400, { error: 'Missing fields' });
      const cleaned = assignments
        .filter(a => a && typeof a.id === 'string' && (a.tier==='2-5'||a.tier==='6-9'||a.tier==='10+'))
        .map(a => ({ id: a.id, tier: a.tier, groupIndex: Number.parseInt(a.groupIndex, 10) || 1 }));
      await setCoffeeAssignmentsBatch(board, day, cleaned, !!clearOthers);
      broadcast(board, { type: 'coffee_updated' });
      return send(req, res, 200, { ok: true });
    } catch (e) {
      console.error('POST /coffee/assign-batch failed:', e);
      return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/coffee/clear') {
    if (!isAuthorized(req)) return send(req, res, 401, { error: 'Unauthorized' });
    if (req.method !== 'DELETE') return notFound(req, res);
    try {
      const board = url.searchParams.get('board') || 'default';
      const day = url.searchParams.get('day');
      if (day !== 'sat' && day !== 'sun') return send(req, res, 400, { error: 'Invalid day parameter' });
      // New behavior: clear only Coffee & Keys group assignments, keep player/character data intact
      await clearCoffeePlayers(board, day);
      broadcast(board, { type: 'coffee_cleared', day });
      return send(req, res, 200, { ok: true });
    } catch (e) {
      console.error('DELETE /coffee/clear failed:', e);
      return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/players') {
    const board = url.searchParams.get('board') || 'default';
    if (req.method === 'GET') {
      try {
        const data = await listPlayers(board);
        return send(req, res, 200, data);
      } catch (e) {
        console.error('Failed to list players:', e);
        return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') {
          return send(req, res, 400, { error: 'Invalid body' });
        }
        const { name, roles, role, availability, notes, timezone, clientId, discordName, coffee, wowClass, flexRole, flexClass, isMain } = body;
        const sess = getSession(req);
        if (!sess || !sess.sub) {
          return send(req, res, 401, { error: 'Discord login required' });
        }
        // Allow Coffee-only submissions: must include Sat/Sun + keyTier
        const coffeeValid = coffee && (coffee.attendSat || coffee.attendSun) && coffee.keyTier;
        const availabilityValid = availability && typeof availability === 'object';
        if (!name || (!roles && !role) || (!availabilityValid && !coffeeValid)) {
          return send(req, res, 400, { error: 'Missing required fields' });
        }
        const tz = typeof timezone === 'string' && timezone ? timezone : 'America/New_York';
        // Determine main/alt status
        let finalIsMain = undefined;
        try {
          const existingMine = await listPlayersByDiscord(board, String(sess.sub));
          if (existingMine.length === 0) {
            finalIsMain = true;
          } else if (isMain === true) {
            finalIsMain = true;
          } else if (isMain === false) {
            finalIsMain = false;
          } else {
            finalIsMain = false;
          }
        } catch (_) {
          finalIsMain = isMain === true;
        }
        const newPlayer = { id: generateId(), name, roles: roles || (role ? [role] : ['DPS']), availability: availability || {}, notes, timezone: tz, board, clientId, discordName: (sess && sess.display) || discordName, coffee, wowClass, flexRole, flexClass, discordId: String(sess.sub), isMain: !!finalIsMain };
        try {
          await upsertPlayer(newPlayer);
          if (finalIsMain) {
            try { await setMainForDiscord(board, String(sess.sub), newPlayer.id); } catch (e) { console.warn('setMainForDiscord failed:', e && e.message ? e.message : e); }
          }
        } catch (e) {
          console.error('Failed to upsert player:', e, newPlayer);
          return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
        }
        broadcast(board, { type: 'player_added', id: newPlayer.id });
        // Auto-assign for Coffee: assign for each selected day
        try {
          if (coffeeValid) {
            const days = [];
            if (coffee.attendSat) days.push('sat');
            if (coffee.attendSun) days.push('sun');
            for (const d of days) {
              await autoAssignCoffee(board, d, newPlayer);
            }
          }
        } catch (e) { console.error('auto-assign on submit failed:', e); }
        return send(req, res, 201, newPlayer);
      } catch (e) {
        console.error('POST /players failed:', e);
        return send(req, res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'DELETE') {
      if (!isAuthorized(req)) {
        return send(req, res, 401, { error: 'Unauthorized' });
      }
      // Check if we should clear only general players
      const clearGeneral = url.searchParams.get('general') === 'true';
      if (clearGeneral) {
        // DELETE /players?board=...&general=true -> remove only non-coffee players
        await clearGeneralPlayers(board);
        broadcast(board, { type: 'general_players_cleared' });
        return send(req, res, 200, { ok: true });
      }
      // DELETE /players[?board=...] -> remove all (optionally limited by board)
      await clearPlayers(board);
      broadcast(board, { type: 'players_cleared' });
      return send(req, res, 200, { ok: true });
    }
  }

  // DELETE /players/:id
  if (req.method === 'DELETE' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(req, res);
    const owner = await getPlayer(id);
    if (!owner) return notFound(req, res);
    const clientId = req.headers['x-client-id'];
    const sess = getSession(req);
    const authorized = isAuthorized(req) || (clientId && owner.clientId && clientId === owner.clientId) || (sess && owner.discordId && String(owner.discordId) === String(sess.sub));
    if (!authorized) return send(req, res, 401, { error: 'Unauthorized' });
    const removed = await deletePlayer(id);
    broadcast(owner.board, { type: 'player_deleted', id });
    return send(req, res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
  }

  // PATCH /players/:id (owner or admin)
  if (req.method === 'PATCH' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(req, res);
    const current = await getPlayer(id);
    if (!current) return notFound(req, res);
    const clientId = req.headers['x-client-id'];
    const sess = getSession(req);
    const authorized = isAuthorized(req) || (clientId && current.clientId && clientId === current.clientId) || (sess && current.discordId && String(current.discordId) === String(sess.sub));
    if (!authorized) return send(req, res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const patch = {
        id,
        name: body?.name ?? current.name,
        roles: Array.isArray(body?.roles) ? body.roles : (body?.role ? [body.role] : current.roles),
        timezone: body?.timezone ?? current.timezone,
        availability: (body && body.hasOwnProperty('availability')) ? body.availability : current.availability,
        notes: body?.notes ?? current.notes ?? null,
        discordName: body?.discordName ?? current.discordName ?? null,
        coffee: (body && body.hasOwnProperty('coffee')) ? body.coffee : current.coffee,
        wowClass: (body && body.hasOwnProperty('wowClass')) ? body.wowClass : current.wowClass,
        flexRole: (body && body.hasOwnProperty('flexRole')) ? body.flexRole : current.flexRole,
        flexClass: (body && body.hasOwnProperty('flexClass')) ? body.flexClass : current.flexClass,
        discordId: (sess && sess.sub) ? String(sess.sub) : current.discordId,
        isMain: (body && body.hasOwnProperty('isMain')) ? !!body.isMain : undefined,
      };
      const ok = await updatePlayer(patch);
      if (!ok) return send(req, res, 500, { error: 'Failed to update' });
      // Auto-assign for Coffee & Keys if provided on update (assign for each selected day)
      try {
        if (body && body.coffee && (body.coffee.attendSat || body.coffee.attendSun) && body.coffee.keyTier) {
          const days = [];
          if (body.coffee.attendSat) days.push('sat');
          if (body.coffee.attendSun) days.push('sun');
          const updatedPlayer = { ...current, ...patch };
          for (const d of days) {
            await autoAssignCoffee(current.board || 'default', d, updatedPlayer);
          }
        }
      } catch (e) { console.warn('auto-assign on PATCH failed:', e && e.message ? e.message : e); }
      // If user asked to make this MAIN, enforce demotion of others for same owner
      if (body && body.isMain === true) {
        try {
          const ownerDiscord = (current && current.discordId) ? String(current.discordId) : (sess && sess.sub ? String(sess.sub) : null);
          if (ownerDiscord) await setMainForDiscord(current.board || 'default', ownerDiscord, id);
        } catch (e) { console.warn('setMainForDiscord (PATCH) failed:', e && e.message ? e.message : e); }
      }
      broadcast(current.board, { type: 'player_updated', id });
      return send(req, res, 200, patch);
    } catch (e) {
      return send(req, res, 400, { error: e.message || 'Bad Request' });
    }
  }

  return notFound(req, res);
});

// --- SSE client management ---
const clientsByBoard = new Map(); // board -> Set<res>

function addClient(board, res) {
  if (!clientsByBoard.has(board)) clientsByBoard.set(board, new Set());
  clientsByBoard.get(board).add(res);
}

function removeClient(board, res) {
  const set = clientsByBoard.get(board);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientsByBoard.delete(board);
}

function broadcast(board, payload) {
  const set = clientsByBoard.get(board);
  if (!set) return;
  const data = `event: players\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch (_) {}
  }
}

function broadcastAll(payload) {
  for (const [board] of clientsByBoard) {
    broadcast(board, payload);
  }
}

// --- Coffee auto-assignment helper ---
async function autoAssignCoffee(board, day, player) {
  try {
    console.log(`[autoAssignCoffee] Starting auto-assignment for player ${player.name} (${player.id}) on ${day}`);
    const all = await listPlayers(board);
    const tier = player && player.coffee && player.coffee.keyTier;
    if (!tier) {
      console.log(`[autoAssignCoffee] No tier found for player ${player.name}`);
      return;
    }
    console.log(`[autoAssignCoffee] Player ${player.name} tier: ${tier}, roles:`, player.roles);
    
    const sameTier = all.filter(p => p.coffeeAssign && p.coffeeAssign.day === day && p.coffeeAssign.tier === tier);
    console.log(`[autoAssignCoffee] Found ${sameTier.length} players in same tier ${tier} for ${day}`);
    
    const byGroup = new Map(); // index -> { players: Player[] }
    for (const p of sameTier) {
      const idx = p.coffeeAssign.groupIndex || 1;
      if (!byGroup.has(idx)) byGroup.set(idx, { players: [] });
      byGroup.get(idx).players.push(p);
    }
    
    const summarize = (players) => {
      let hasTank = false, hasHealer = false, dps = 0;
      for (const x of players) {
        const roles = Array.isArray(x.roles) && x.roles.length ? x.roles : ['DPS'];
        // Check if player can tank or heal (not just their primary role)
        const canTank = roles.includes('Tank');
        const canHeal = roles.includes('Healer');
        if (canTank) hasTank = true; 
        else if (canHeal) hasHealer = true; 
        else dps++;
      }
      return { hasTank, hasHealer, dps, size: players.length };
    };
    
    const myRoles = Array.isArray(player.roles) && player.roles.length ? player.roles : ['DPS'];
    const canTank = myRoles.includes('Tank');
    const canHeal = myRoles.includes('Healer');
    console.log(`[autoAssignCoffee] Player ${player.name} can tank: ${canTank}, can heal: ${canHeal}, roles:`, myRoles);
    
    let choice = null;
    const indices = Array.from(byGroup.keys()).sort((a,b)=>a-b);
    console.log(`[autoAssignCoffee] Available group indices:`, indices);
    
    for (const idx of indices) {
      const g = byGroup.get(idx);
      const s = summarize(g.players);
      console.log(`[autoAssignCoffee] Group ${idx}: hasTank=${s.hasTank}, hasHealer=${s.hasHealer}, dps=${s.dps}, size=${s.size}`);
      
      if (s.size >= 5) continue;
      if (canTank && !s.hasTank) { choice = idx; break; }
      if (canHeal && !s.hasHealer) { choice = idx; break; }
      if (s.dps < 3) { choice = idx; break; }
    }
    
    if (!choice) {
      choice = indices.length ? (Math.max(...indices) + 1) : 1;
    }
    
    console.log(`[autoAssignCoffee] Assigning player ${player.name} to group ${choice}`);
    await setCoffeeAssignment(player.id, day, tier, choice);
    broadcast(board, { type: 'coffee_updated' });
  } catch (e) {
    console.error('autoAssignCoffee failed:', e);
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
