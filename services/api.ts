import type { Player } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8787';

function getBoard(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('board') || 'default';
  } catch {
    return 'default';
  }
}

export async function fetchPlayers(): Promise<Player[]> {
  const board = getBoard();
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`);
  if (!res.ok) throw new Error(`Failed to fetch players: ${res.status}`);
  return res.json();
}

export interface BoardSettings { board: string; title: string | null }

export async function fetchBoardSettings(): Promise<BoardSettings> {
  const board = getBoard();
  const res = await fetch(`${API_BASE}/board?board=${encodeURIComponent(board)}`);
  if (!res.ok) throw new Error(`Failed to fetch board: ${res.status}`);
  return res.json();
}

export async function updateBoardSettings(data: Partial<{ title: string | null }>): Promise<BoardSettings> {
  const board = getBoard();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/board?board=${encodeURIComponent(board)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update board: ${res.status}`);
  return res.json();
}

export async function assignCoffee(payload: { id: string, day: 'sat'|'sun'|null, tier?: '2-5'|'6-9'|'10+'|null, groupIndex?: number|null }): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/coffee/assign`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to assign: ${res.status}`);
}

export async function assignCoffeeBatch(day: 'sat'|'sun', assignments: { id: string, tier: '2-5'|'6-9'|'10+', groupIndex: number }[], clearOthers = true): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  const board = getBoard();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/coffee/assign-batch?board=${encodeURIComponent(board)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ day, assignments, clearOthers }),
  });
  if (!res.ok) throw new Error(`Failed to batch assign: ${res.status}`);
}

export async function createPlayer(input: Omit<Player, 'id'>): Promise<Player> {
  const board = getBoard();
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, board, clientId: getClientId() }),
  });
  if (!res.ok) throw new Error(`Failed to create player: ${res.status}`);
  return res.json();
}

export async function deletePlayer(id: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['X-Client-Id'] = getClientId();
  const res = await fetch(`${API_BASE}/players/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete player: ${res.status}`);
}

export async function clearPlayers(): Promise<void> {
  const board = getBoard();
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Failed to clear players: ${res.status}`);
}

export async function clearGeneralPlayers(): Promise<void> {
  const board = getBoard();
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/players?board=${encodeURIComponent(board)}&general=true`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Failed to clear general players: ${res.status}`);
}

export async function clearCoffeePlayers(day: 'sat' | 'sun'): Promise<void> {
  const board = getBoard();
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/coffee/clear?board=${encodeURIComponent(board)}&day=${day}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Failed to clear coffee players: ${res.status}`);
}

export function setAdminToken(token: string) {
  try { localStorage.setItem('mff_admin_token', token); } catch {}
}

export function getAdminToken(): string | null {
  try { return localStorage.getItem('mff_admin_token'); } catch { return null; }
}

export function clearAdminToken(): void {
  try { localStorage.removeItem('mff_admin_token'); } catch {}
}

export async function verifyAdminToken(): Promise<boolean> {
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}/admin/verify`, { headers });
    return res.ok;
  } catch {
    return false;
  }
}

export function subscribeToUpdates(onMessage: () => void): () => void {
  const board = getBoard();
  const es = new EventSource(`${API_BASE}/events?board=${encodeURIComponent(board)}`);
  es.addEventListener('players', () => {
    onMessage();
  });
  es.onerror = () => {
    // basic backoff: close; caller may resubscribe on next focus/load
    try { es.close(); } catch {}
  };
  return () => {
    try { es.close(); } catch {}
  };
}

export function getClientId(): string {
  try {
    const k = 'mff_client_id';
    let id = localStorage.getItem(k);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export async function updatePlayer(id: string, data: Partial<Omit<Player, 'id'>>): Promise<Player> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() };
  const token = getAdminToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/players/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update player: ${res.status}`);
  return res.json();
}
