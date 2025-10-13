// Minimal Node.js HTTP server backed by SQLite
const http = require('http');
const { listPlayers, upsertPlayer, deletePlayer, clearPlayers, clearGeneralPlayers, getPlayer, updatePlayer, getBoardSettings, upsertBoardSettings, setCoffeeAssignment, setCoffeeAssignmentsBatch, clearCoffeeAssignments, clearCoffeePlayers } = require('./db.cjs');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
// Storage moved to SQLite via server/db.js

function send(res, status, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
    ...headers,
  });
  res.end(json);
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
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
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/health/db') {
    try {
      const data = await listPlayers('default');
      return send(res, 200, { ok: true, players: Array.isArray(data) ? data.length : 0 });
    } catch (e) {
      console.error('DB health failed:', e);
      return send(res, 500, { ok: false, error: e && e.message ? e.message : 'DB error' });
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
      return send(res, 200, { tables: tables.rows || [], players_info: info.rows || [] });
    } catch (e) {
      console.error('schema debug failed:', e);
      return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  // Admin verify: checks Authorization header only
  if (req.method === 'GET' && pathname === '/admin/verify') {
    if (!isAuthorized(req)) {
      return send(res, 401, { ok: false, error: 'Unauthorized' });
    }
    return send(res, 200, { ok: true });
  }

  // Board settings
  if (pathname === '/board') {
    const board = url.searchParams.get('board') || 'default';
    if (req.method === 'GET') {
      try {
        const data = await getBoardSettings(board);
        return send(res, 200, data);
      } catch (e) {
        return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!isAuthorized(req)) {
        return send(res, 401, { error: 'Unauthorized' });
      }
      try {
        const body = await parseBody(req);
        const next = await upsertBoardSettings(board, { title: typeof body?.title === 'string' ? body.title : null });
        broadcast(board, { type: 'board_updated' });
        return send(res, 200, next);
      } catch (e) {
        console.error('Failed to update board:', e);
        return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
  }

  // Coffee assignments
  if (pathname === '/coffee/assign') {
    if (!isAuthorized(req)) return send(res, 401, { error: 'Unauthorized' });
    if (req.method !== 'PATCH') return notFound(res);
    try {
      const body = await parseBody(req);
      let { id, day, tier, groupIndex } = body || {};
      if (!id || typeof id !== 'string') return send(res, 400, { error: 'Missing id' });
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
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('PATCH /coffee/assign failed:', e);
      return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/coffee/assign-batch') {
    if (!isAuthorized(req)) return send(res, 401, { error: 'Unauthorized' });
    if (req.method !== 'POST') return notFound(res);
    try {
      const board = url.searchParams.get('board') || 'default';
      const body = await parseBody(req);
      let { day, assignments, clearOthers } = body || {};
      day = (day === 'sat' || day === 'sun') ? day : null;
      if (!day || !assignments || !Array.isArray(assignments)) return send(res, 400, { error: 'Missing fields' });
      const cleaned = assignments
        .filter(a => a && typeof a.id === 'string' && (a.tier==='2-5'||a.tier==='6-9'||a.tier==='10+'))
        .map(a => ({ id: a.id, tier: a.tier, groupIndex: Number.parseInt(a.groupIndex, 10) || 1 }));
      await setCoffeeAssignmentsBatch(board, day, cleaned, !!clearOthers);
      broadcast(board, { type: 'coffee_updated' });
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('POST /coffee/assign-batch failed:', e);
      return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/coffee/clear') {
    if (!isAuthorized(req)) return send(res, 401, { error: 'Unauthorized' });
    if (req.method !== 'DELETE') return notFound(res);
    try {
      const board = url.searchParams.get('board') || 'default';
      const day = url.searchParams.get('day');
      if (day !== 'sat' && day !== 'sun') return send(res, 400, { error: 'Invalid day parameter' });
      // Clear both assignments and players for this day
      await clearCoffeePlayers(board, day);
      broadcast(board, { type: 'coffee_cleared', day });
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('DELETE /coffee/clear failed:', e);
      return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
    }
  }

  if (pathname === '/players') {
    const board = url.searchParams.get('board') || 'default';
    if (req.method === 'GET') {
      try {
        const data = await listPlayers(board);
        return send(res, 200, data);
      } catch (e) {
        console.error('Failed to list players:', e);
        return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body || typeof body !== 'object') {
          return send(res, 400, { error: 'Invalid body' });
        }
        const { name, roles, role, availability, notes, timezone, clientId, discordName, coffee, wowClass, flexRole, flexClass } = body;
        // Allow Coffee-only submissions: must include Sat/Sun + keyTier
        const coffeeValid = coffee && (coffee.attendSat || coffee.attendSun) && coffee.keyTier;
        const availabilityValid = availability && typeof availability === 'object';
        if (!name || (!roles && !role) || (!availabilityValid && !coffeeValid)) {
          return send(res, 400, { error: 'Missing required fields' });
        }
        const tz = typeof timezone === 'string' && timezone ? timezone : 'America/New_York';
        const newPlayer = { id: generateId(), name, roles: roles || (role ? [role] : ['DPS']), availability: availability || {}, notes, timezone: tz, board, clientId, discordName, coffee, wowClass, flexRole, flexClass };
        try {
          await upsertPlayer(newPlayer);
        } catch (e) {
          console.error('Failed to upsert player:', e, newPlayer);
          return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
        }
        broadcast(board, { type: 'player_added', id: newPlayer.id });
        // Auto-assign for Coffee if exactly one day selected
        try {
          if (coffeeValid) {
            const days = [];
            if (coffee.attendSat) days.push('sat');
            if (coffee.attendSun) days.push('sun');
            if (days.length === 1) {
              await autoAssignCoffee(board, days[0], newPlayer);
            }
          }
        } catch (e) { console.error('auto-assign on submit failed:', e); }
        return send(res, 201, newPlayer);
      } catch (e) {
        console.error('POST /players failed:', e);
        return send(res, 500, { error: e && e.message ? e.message : 'Internal Error' });
      }
    }
    if (req.method === 'DELETE') {
      if (!isAuthorized(req)) {
        return send(res, 401, { error: 'Unauthorized' });
      }
      // Check if we should clear only general players
      const clearGeneral = url.searchParams.get('general') === 'true';
      if (clearGeneral) {
        // DELETE /players?board=...&general=true -> remove only non-coffee players
        await clearGeneralPlayers(board);
        broadcast(board, { type: 'general_players_cleared' });
        return send(res, 200, { ok: true });
      }
      // DELETE /players[?board=...] -> remove all (optionally limited by board)
      await clearPlayers(board);
      broadcast(board, { type: 'players_cleared' });
      return send(res, 200, { ok: true });
    }
  }

  // DELETE /players/:id
  if (req.method === 'DELETE' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(res);
    const owner = await getPlayer(id);
    if (!owner) return notFound(res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && owner.clientId && clientId === owner.clientId);
    if (!authorized) return send(res, 401, { error: 'Unauthorized' });
    const removed = await deletePlayer(id);
    broadcast(owner.board, { type: 'player_deleted', id });
    return send(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
  }

  // PATCH /players/:id (owner or admin)
  if (req.method === 'PATCH' && pathname.startsWith('/players/')) {
    const id = pathname.split('/')[2];
    if (!id) return notFound(res);
    const current = await getPlayer(id);
    if (!current) return notFound(res);
    const clientId = req.headers['x-client-id'];
    const authorized = isAuthorized(req) || (clientId && current.clientId && clientId === current.clientId);
    if (!authorized) return send(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const patch = {
        id,
        name: body.name ?? current.name,
        roles: Array.isArray(body.roles) ? body.roles : (body.role ? [body.role] : current.roles),
        timezone: body.timezone ?? current.timezone,
        availability: body.availability ?? current.availability,
        notes: body.notes ?? current.notes ?? null,
        discordName: body.discordName ?? current.discordName ?? null,
      };
      const ok = await updatePlayer(patch);
      if (!ok) return send(res, 500, { error: 'Failed to update' });
      broadcast(current.board, { type: 'player_updated', id });
      return send(res, 200, patch);
    } catch (e) {
      return send(res, 400, { error: e.message || 'Bad Request' });
    }
  }

  return notFound(res);
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
    const all = await listPlayers(board);
    const tier = player && player.coffee && player.coffee.keyTier;
    if (!tier) return;
    const sameTier = all.filter(p => p.coffeeAssign && p.coffeeAssign.day === day && p.coffeeAssign.tier === tier);
    const byGroup = new Map(); // index -> { players: Player[] }
    for (const p of sameTier) {
      const idx = p.coffeeAssign.groupIndex || 1;
      if (!byGroup.has(idx)) byGroup.set(idx, { players: [] });
      byGroup.get(idx).players.push(p);
    }
    const summarize = (players) => {
      let hasTank = false, hasHealer = false, dps = 0;
      for (const x of players) {
        const r = Array.isArray(x.roles) && x.roles.length ? x.roles[0] : 'DPS';
        if (r === 'Tank') hasTank = true; else if (r === 'Healer') hasHealer = true; else dps++;
      }
      return { hasTank, hasHealer, dps, size: players.length };
    };
    const myRole = Array.isArray(player.roles) && player.roles.length ? player.roles[0] : 'DPS';
    let choice = null;
    const indices = Array.from(byGroup.keys()).sort((a,b)=>a-b);
    for (const idx of indices) {
      const g = byGroup.get(idx);
      const s = summarize(g.players);
      if (s.size >= 5) continue;
      if (myRole === 'Tank' && !s.hasTank) { choice = idx; break; }
      if (myRole === 'Healer' && !s.hasHealer) { choice = idx; break; }
      if (myRole === 'DPS' && s.dps < 3) { choice = idx; break; }
    }
    if (!choice) {
      choice = indices.length ? (Math.max(...indices) + 1) : 1;
    }
    await setCoffeeAssignment(player.id, day, tier, choice);
    broadcast(board, { type: 'coffee_updated' });
  } catch (e) {
    console.error('autoAssignCoffee failed:', e);
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
