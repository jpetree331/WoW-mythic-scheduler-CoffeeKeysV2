import React from 'react';
import type { Player, Role } from '../types';
import RoleSelector from './RoleSelector';
import { updatePlayer, deletePlayer as apiDeletePlayer } from '../services/api';
import { WOW_CLASSES, ROLES } from '../constants';

interface Props {
  players: Player[]; // only current user's players
  onClose: () => void;
  onRefetch: () => Promise<void> | void;
}

const MyCharactersModal: React.FC<Props> = ({ players, onClose, onRefetch }) => {
  const [editing, setEditing] = React.useState<Record<string, { name: string; roles: Role[]; wowClass?: string; flexRole?: Role | ''; flexClass?: string }>>(() => {
    const init: Record<string, { name: string; roles: Role[]; wowClass?: string; flexRole?: Role | ''; flexClass?: string }> = {};
    for (const p of players) init[p.id] = { name: p.name, roles: p.roles || [], wowClass: p.wowClass, flexRole: (p.flexRole || '') as any, flexClass: p.flexClass };
    return init;
  });
  const setField = (id: string, field: 'name'|'roles'|'wowClass'|'flexRole'|'flexClass', value: any) => {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const save = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    try {
      await updatePlayer(id, { name: e.name, roles: e.roles, wowClass: e.wowClass, flexRole: (e.flexRole || undefined) as any, flexClass: e.flexClass });
      await Promise.resolve(onRefetch());
    } catch (err) {
      console.error('update failed', err);
      alert('Failed to update character');
    }
  };

  const makeMain = async (id: string) => {
    try {
      await updatePlayer(id, { isMain: true });
      await Promise.resolve(onRefetch());
    } catch (err) {
      console.error('make main failed', err);
      alert('Failed to set MAIN');
    }
  };

  const hasPlayers = players.length > 0;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-[96vw] max-w-3xl max-h-[85vh] overflow-auto">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-yellow-300">My Characters</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-400">
            Want to add another character?{' '}
            <button
              onClick={() => {
                try { onClose(); } finally {
                  setTimeout(() => {
                    const el = document.getElementById('availability-form');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 50);
                }
              }}
              className="underline text-yellow-300 hover:text-yellow-200"
            >
              Submit availability
            </button>
          </div>
          {!hasPlayers ? (
            <p className="text-gray-400">You have no characters yet. Submit availability to add one.</p>
          ) : (
            players.map(p => (
              <div key={p.id} className="bg-gray-800 border border-gray-700 rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={editing[p.id]?.name || ''}
                        onChange={(e)=> setField(p.id, 'name', e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-100 w-64"
                      />
                      {p.isMain ? (
                        <span className="text-xs bg-emerald-700/40 text-emerald-300 border border-emerald-600 rounded px-1">MAIN</span>
                      ) : (
                        <span className="text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-1">ALT</span>
                      )}
                    </div>
                    <RoleSelector
                      selectedRoles={editing[p.id]?.roles || []}
                      onToggleRole={(role) => {
                        const cur = editing[p.id]?.roles || [];
                        const next = cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role];
                        setField(p.id, 'roles', next);
                      }}
                    />
                    <div className="grid sm:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Class</label>
                        <select
                          value={editing[p.id]?.wowClass || ''}
                          onChange={(e)=> setField(p.id, 'wowClass', e.target.value || undefined)}
                          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        >
                          <option value="">None</option>
                          {WOW_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Flex Role</label>
                        <select
                          value={(editing[p.id]?.flexRole as any) || ''}
                          onChange={(e)=> setField(p.id, 'flexRole', (e.target.value || '') as any)}
                          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        >
                          <option value="">None</option>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Flex Class</label>
                        <select
                          value={editing[p.id]?.flexClass || ''}
                          onChange={(e)=> setField(p.id, 'flexClass', e.target.value || undefined)}
                          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        >
                          <option value="">None</option>
                          {WOW_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!p.isMain && (
                      <button onClick={()=> makeMain(p.id)} className="text-sm bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold py-1 px-3 rounded">Make Main</button>
                    )}
                    <button onClick={()=> save(p.id)} className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded">Save</button>
                    <button
                      onClick={async ()=> {
                        if (!confirm('Delete this character? This cannot be undone.')) return;
                        try { await apiDeletePlayer(p.id); await Promise.resolve(onRefetch()); } catch (e) { console.error('delete failed', e); alert('Failed to delete'); }
                      }}
                      className="text-sm bg-red-800 hover:bg-red-700 text-red-100 font-semibold py-1 px-3 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MyCharactersModal;
