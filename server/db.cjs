// Turso/libSQL async client with migration runner
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let clientPromise = null; // Promise resolved to a connected libSQL client

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const { createClient } = await import('@libsql/client');
    const urlRaw = process.env.DATABASE_URL || process.env.LIBSQL_DB_URL || '';
    const tokenRaw = process.env.DATABASE_AUTH_TOKEN || process.env.LIBSQL_DB_AUTH_TOKEN || '';
    const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
    const authToken = typeof tokenRaw === 'string' ? tokenRaw.trim() : undefined;
    if (!url) {
      throw new Error('DATABASE_URL is required for Turso/libSQL.');
    }
    // Basic sanity check to help users spot malformed URLs
    const validScheme = url.startsWith('libsql://') || url.startsWith('https://') || url.startsWith('http://');
    if (!validScheme) {
      throw new Error(`DATABASE_URL has invalid scheme. Expected libsql:// or https://, got: ${url.split('://')[0] || url}`);
    }
    const client = createClient({ url, authToken });
    // By default, skip SQL file migrations when using Turso. We instead ensure schema idempotently.
    // If you want to run the SQL files explicitly, set ENABLE_SQL_MIGRATIONS=1
    if (process.env.ENABLE_SQL_MIGRATIONS === '1') {
      await runMigrations(client);
    }
    await ensureSchema(client);
    return client;
  })();
  return clientPromise;
}

async function runMigrations(client) {
  await client.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)');
  const appliedRows = await client.execute('SELECT version FROM schema_migrations');
  const applied = new Set((appliedRows.rows || []).map(r => r.version || r[0]));
  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const version = file.split('_')[0].replace('.sql', '');
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    let ok = true;
    try { await client.execute('BEGIN'); } catch {}
    for (const s of statements) {
      try {
        await client.execute(s);
      } catch (e) {
        ok = false;
        console.warn(`[migrations] ${file} statement failed: ${e && e.message ? e.message : e}`);
        break;
      }
    }
    if (ok) {
      await client.execute({ sql: 'INSERT INTO schema_migrations (version) VALUES (?)', args: [version] });
      try { await client.execute('COMMIT'); } catch {}
    } else {
      try { await client.execute('ROLLBACK'); } catch {}
      // do not mark as applied; keep going to allow ensureSchema() to repair
    }
  }
}

async function ensureSchema(client) {
  // Create base table if missing
  await client.execute(`CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    timezone TEXT,
    availability TEXT,
    notes TEXT,
    created_at INTEGER
  )`);
  // Detect existing columns
  let cols = [];
  try {
    const info = await client.execute('PRAGMA table_info(players)');
    cols = (info.rows || []).map(r => (r.name ?? r[1] ?? '').toString());
  } catch (e) {
    // best-effort; continue with adds which will fail if exist
  }
  const has = (c) => cols.includes(c);
  // Add missing columns idempotently
  if (!has('roles')) { try { await client.execute('ALTER TABLE players ADD COLUMN roles TEXT'); } catch {} }
  if (!has('board')) { try { await client.execute("ALTER TABLE players ADD COLUMN board TEXT NOT NULL DEFAULT 'default'"); } catch {} }
  if (!has('client_id')) { try { await client.execute('ALTER TABLE players ADD COLUMN client_id TEXT'); } catch {} }
  if (!has('discord_name')) { try { await client.execute('ALTER TABLE players ADD COLUMN discord_name TEXT'); } catch {} }
  if (!has('role')) { try { await client.execute('ALTER TABLE players ADD COLUMN role TEXT'); } catch {} }
  if (!has('timezone')) { try { await client.execute('ALTER TABLE players ADD COLUMN timezone TEXT'); } catch {} }
  if (!has('availability')) { try { await client.execute('ALTER TABLE players ADD COLUMN availability TEXT'); } catch {} }
  if (!has('notes')) { try { await client.execute('ALTER TABLE players ADD COLUMN notes TEXT'); } catch {} }
  if (!has('created_at')) { try { await client.execute('ALTER TABLE players ADD COLUMN created_at INTEGER'); } catch {} }
  if (!has('coffee')) { try { await client.execute('ALTER TABLE players ADD COLUMN coffee TEXT'); } catch {} }
  if (!has('wow_class')) { try { await client.execute('ALTER TABLE players ADD COLUMN wow_class TEXT'); } catch {} }
  if (!has('flex_role')) { try { await client.execute('ALTER TABLE players ADD COLUMN flex_role TEXT'); } catch {} }
  if (!has('flex_class')) { try { await client.execute('ALTER TABLE players ADD COLUMN flex_class TEXT'); } catch {} }

  // Ensure indexes
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_players_board ON players(board)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_players_board_client ON players(board, client_id)'); } catch {}

  // Boards table for title
  await client.execute('CREATE TABLE IF NOT EXISTS boards (board TEXT PRIMARY KEY, title TEXT)');
  // Coffee assignments table (separate from players for portability)
  await client.execute('CREATE TABLE IF NOT EXISTS coffee_assignments (player_id TEXT PRIMARY KEY, board TEXT, day TEXT, tier TEXT, group_index INTEGER)');
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_coffee_board_day ON coffee_assignments(board, day)'); } catch {}
}

async function setCoffeeAssignment(id, day, tier, groupIndex) {
  const client = await getClient();
  await ensureSchema(client);
  if (!day || !tier || groupIndex == null) {
    await client.execute({ sql: `DELETE FROM coffee_assignments WHERE player_id = ?`, args: [id] });
    return true;
  }
  await client.execute({
    sql: `INSERT INTO coffee_assignments (player_id, board, day, tier, group_index)
          VALUES (?, (SELECT board FROM players WHERE id = ?), ?, ?, ?)
          ON CONFLICT(player_id) DO UPDATE SET board = excluded.board, day = excluded.day, tier = excluded.tier, group_index = excluded.group_index`,
    args: [id, id, day, tier, groupIndex],
  });
  return true;
}

async function setCoffeeAssignmentsBatch(board, day, assignments, clearOthers) {
  const client = await getClient();
  await ensureSchema(client);
  if (clearOthers) {
    await client.execute({ sql: `DELETE FROM coffee_assignments WHERE board = ? AND day = ?`, args: [board, day] });
  }
  for (const a of assignments) {
    await client.execute({
      sql: `INSERT INTO coffee_assignments (player_id, board, day, tier, group_index)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET board = excluded.board, day = excluded.day, tier = excluded.tier, group_index = excluded.group_index`,
      args: [a.id, board, day, a.tier, a.groupIndex],
    });
  }
  return true;
}

function safeJsonParse(value, fallback) {
  try {
    if (value == null) return fallback;
    if (typeof value === 'string' && value.trim().length === 0) return fallback;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_) {
    return fallback;
  }
}

function rowToPlayer(r) {
  const id = r.id ?? r[0];
  if (id === undefined) return null;
  const get = (k, idx) => (r[k] !== undefined ? r[k] : r[idx]);
  return {
    id,
    name: get('name', 1),
    roles: safeJsonParse(get('roles', 3), undefined) || [ (get('role', 2) || 'DPS') ],
    timezone: get('timezone', 4) || 'America/New_York',
    availability: safeJsonParse(get('availability', 5), {}),
    notes: get('notes', 6) || undefined,
    discordName: get('discord_name', 8) || undefined,
    board: get('board', 10) || 'default',
    clientId: get('client_id', 11) || undefined,
    coffee: safeJsonParse(get('coffee', 12), undefined),
    wowClass: get('wow_class', 13) || undefined,
    flexRole: get('flex_role', 14) || undefined,
    flexClass: get('flex_class', 15) || undefined,
    coffeeAssign: {
      day: get('coffee_group_day', 16) || undefined,
      tier: get('coffee_group_tier', 17) || undefined,
      groupIndex: get('coffee_group_index', 18) ?? undefined,
    },
  };
}

async function listPlayers(board) {
  const client = await getClient();
  const sql = `SELECT p.*, ca.day as coffee_group_day, ca.tier as coffee_group_tier, ca.group_index as coffee_group_index
               FROM players p LEFT JOIN coffee_assignments ca ON ca.player_id = p.id
               WHERE p.board = ? ORDER BY p.created_at ASC`;
  try {
    const res = await client.execute({ sql, args: [board] });
    const rows = res.rows || [];
    return rows.map(rowToPlayer).filter(Boolean);
  } catch (e) {
    try { await ensureSchema(client); } catch {}
    const res2 = await client.execute({ sql, args: [board] });
    const rows2 = res2.rows || [];
    return rows2.map(rowToPlayer).filter(Boolean);
  }
}

async function upsertPlayer(p) {
  const client = await getClient();
  const roleSingle = Array.isArray(p.roles) && p.roles.length ? p.roles[0] : (p.role || 'DPS');
  const rolesJson = JSON.stringify(Array.isArray(p.roles) ? p.roles : (p.role ? [p.role] : ['DPS']));
  const doInsert = async () => client.execute({
    sql: `INSERT INTO players (id, name, role, roles, timezone, availability, notes, discord_name, created_at, board, client_id, coffee, wow_class, flex_role, flex_class)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      p.id,
      p.name,
      roleSingle,
      rolesJson,
      p.timezone,
      JSON.stringify(p.availability),
      p.notes || null,
      p.discordName || null,
      Date.now(),
      p.board || 'default',
      p.clientId || null,
      p.coffee ? JSON.stringify(p.coffee) : null,
      p.wowClass || null,
      p.flexRole || null,
      p.flexClass || null,
    ],
  });
  try { await doInsert(); } catch (e) { try { await ensureSchema(client); } catch {} await doInsert(); }
}

async function deletePlayer(id) {
  const client = await getClient();
  const res = await client.execute({ sql: 'DELETE FROM players WHERE id = ?', args: [id] });
  // libsql returns changes count in res.rowsAffected (in some clients) or nothing; try to detect
  const changes = res.rowsAffected ?? (res.affectedRows ?? 0);
  return (typeof changes === 'number') ? changes > 0 : true;
}

async function clearPlayers(board) {
  const client = await getClient();
  if (board) {
    await client.execute({ sql: 'DELETE FROM players WHERE board = ?', args: [board] });
  } else {
    await client.execute('DELETE FROM players');
  }
}

async function getPlayer(id) {
  const client = await getClient();
  try {
    const res = await client.execute({ sql: `SELECT * FROM players WHERE id = ?`, args: [id] });
    const row = (res.rows || [])[0];
    if (!row) return null;
    return rowToPlayer(row);
  } catch (e) {
    try { await ensureSchema(client); } catch {}
    const res2 = await client.execute({ sql: `SELECT * FROM players WHERE id = ?`, args: [id] });
    const row2 = (res2.rows || [])[0];
    if (!row2) return null;
    return rowToPlayer(row2);
  }
}

async function updatePlayer(p) {
  const client = await getClient();
  const roleSingle = Array.isArray(p.roles) && p.roles.length ? p.roles[0] : 'DPS';
  const rolesJson = JSON.stringify(Array.isArray(p.roles) ? p.roles : ['DPS']);
  let res;
  try {
    res = await client.execute({
      sql: `UPDATE players
            SET name = ?, role = ?, roles = ?, timezone = ?, availability = ?, notes = ?, discord_name = ?, coffee = ?, wow_class = ?, flex_role = ?, flex_class = ?
            WHERE id = ?`,
      args: [
        p.name,
        roleSingle,
        rolesJson,
        p.timezone,
        JSON.stringify(p.availability),
        p.notes || null,
        p.discordName || null,
        p.coffee ? JSON.stringify(p.coffee) : null,
        p.wowClass || null,
        p.flexRole || null,
        p.flexClass || null,
        p.id,
      ],
    });
  } catch (e) {
    try { await ensureSchema(client); } catch {}
    res = await client.execute({
      sql: `UPDATE players
            SET name = ?, role = ?, roles = ?, timezone = ?, availability = ?, notes = ?, discord_name = ?, coffee = ?, wow_class = ?, flex_role = ?, flex_class = ?
            WHERE id = ?`,
      args: [
        p.name,
        roleSingle,
        rolesJson,
        p.timezone,
        JSON.stringify(p.availability),
        p.notes || null,
        p.discordName || null,
        p.coffee ? JSON.stringify(p.coffee) : null,
        p.wowClass || null,
        p.flexRole || null,
        p.flexClass || null,
        p.id,
      ],
    });
  }
  const changes = res.rowsAffected ?? (res.affectedRows ?? 0);
  return (typeof changes === 'number') ? changes > 0 : true;
}

async function getBoardSettings(board) {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT board, title FROM boards WHERE board = ? LIMIT 1',
    args: [board],
  });
  const row = (res.rows || [])[0];
  if (!row) return { board, title: null };
  return { board: row.board ?? row[0], title: (row.title ?? row[1]) || null };
}

async function upsertBoardSettings(board, data) {
  const client = await getClient();
  const title = data.title ?? null;
  await client.execute({
    sql: 'INSERT INTO boards (board, title) VALUES (?, ?) ON CONFLICT(board) DO UPDATE SET title = excluded.title',
    args: [board, title],
  });
  return { board, title };
}

async function clearCoffeeAssignments(board, day) {
  const client = await getClient();
  await ensureSchema(client);
  await client.execute({
    sql: `DELETE FROM coffee_assignments WHERE board = ? AND day = ?`,
    args: [board, day],
  });
  return true;
}

async function clearCoffeePlayers(board, day) {
  const client = await getClient();
  await ensureSchema(client);
  // Clear assignments for this day
  await client.execute({
    sql: `DELETE FROM coffee_assignments WHERE board = ? AND day = ?`,
    args: [board, day],
  });
  // Delete players who signed up for this specific day
  const players = await listPlayers(board);
  for (const p of players) {
    const signedUpForDay = day === 'sat' ? (p.coffee && p.coffee.attendSat) : (p.coffee && p.coffee.attendSun);
    if (signedUpForDay) {
      // Only delete if they ONLY signed up for this day (not both days)
      const otherDay = day === 'sat' ? (p.coffee && p.coffee.attendSun) : (p.coffee && p.coffee.attendSat);
      if (!otherDay) {
        await client.execute({ sql: 'DELETE FROM players WHERE id = ?', args: [p.id] });
      } else {
        // If they signed up for both days, just remove this day from their signup
        const updatedCoffee = { ...p.coffee };
        if (day === 'sat') updatedCoffee.attendSat = false;
        else updatedCoffee.attendSun = false;
        await client.execute({
          sql: 'UPDATE players SET coffee = ? WHERE id = ?',
          args: [JSON.stringify(updatedCoffee), p.id],
        });
      }
    }
  }
  return true;
}

async function clearGeneralPlayers(board) {
  const client = await getClient();
  // Clear only players who don't have Coffee & Keys data OR have empty coffee data
  // Keep players who have coffee signup data (attendSat or attendSun)
  const players = await listPlayers(board);
  for (const p of players) {
    const hasCoffee = p.coffee && (p.coffee.attendSat || p.coffee.attendSun);
    if (!hasCoffee) {
      await client.execute({ sql: 'DELETE FROM players WHERE id = ?', args: [p.id] });
    }
  }
}

module.exports = {
  listPlayers,
  upsertPlayer,
  deletePlayer,
  clearPlayers,
  clearGeneralPlayers,
  getPlayer,
  updatePlayer,
  getBoardSettings,
  upsertBoardSettings,
  setCoffeeAssignment,
  setCoffeeAssignmentsBatch,
  clearCoffeeAssignments,
  clearCoffeePlayers,
};
