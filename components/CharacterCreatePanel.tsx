import React from 'react';
import type { Player, Role } from '../types';
import RoleSelector from './RoleSelector';
import { WOW_CLASSES } from '../constants';

interface Props {
  myPlayers: Player[];
  onCreate: (data: Omit<Player, 'id'|'availability'|'timezone'> & { availability?: any; timezone?: string; isMain?: boolean }) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onJoinCoffee?: () => void;
}

const CharacterCreatePanel: React.FC<Props> = ({ myPlayers, onCreate, onDelete, onJoinCoffee }) => {
  const [name, setName] = React.useState('');
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [wowClass, setWowClass] = React.useState('');
  const [isMain, setIsMain] = React.useState<boolean>(false);
  const hasMain = myPlayers.some(p => p.isMain);

  React.useEffect(() => {
    if (!hasMain) setIsMain(true); // default first to MAIN
  }, [hasMain]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('Enter character name'); return; }
    if (!roles.length) { alert('Select at least one role'); return; }
    if (hasMain && isMain) {
      // Guard: only one main
      const ok = confirm('You already have a MAIN. Promote this as MAIN and demote the existing MAIN?');
      if (!ok) return;
    }
    await Promise.resolve(onCreate({ name, roles, wowClass: wowClass || undefined, availability: {}, isMain } as any));
    setName(''); setRoles([]); setWowClass(''); if (!hasMain) setIsMain(true); else setIsMain(false);
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold text-yellow-300">Create Character</h3>
        <button
          type="button"
          onClick={() => onJoinCoffee && onJoinCoffee()}
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-1.5 px-3 rounded"
        >
          Join Coffee & Keys Event
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Character Name</label>
          <input value={name} onChange={(e)=> setName(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100" placeholder="e.g., Arthas" />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-2">Role(s)</label>
          <RoleSelector selectedRoles={roles} onToggleRole={(r)=> setRoles(prev => prev.includes(r) ? prev.filter(x=>x!==r) : [...prev, r])} />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Class</label>
          <select value={wowClass} onChange={(e)=> setWowClass(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100">
            <option value="">None</option>
            {WOW_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-gray-300">
            <input type="radio" name="mainalt" checked={isMain} onChange={()=> setIsMain(true)} disabled={false} /> Main
          </label>
          <label className="flex items-center gap-2 text-gray-300">
            <input type="radio" name="mainalt" checked={!isMain} onChange={()=> setIsMain(false)} /> Alt
          </label>
          {hasMain && (
            <span className="text-xs text-gray-400">You already have a MAIN.</span>
          )}
        </div>
        <div className="flex justify-end">
          <button type="submit" className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold py-2 px-4 rounded">Add Character</button>
        </div>
      </form>

      <div className="mt-4">
        <div className="text-sm text-gray-400 mb-2">Your Characters</div>
        <ul className="divide-y divide-gray-700">
          {myPlayers.map(p => (
            <li key={p.id} className="py-2 flex items-center justify-between">
              <div>
                <span className="text-gray-100 font-semibold">{p.name}</span>
                {p.isMain ? <span className="ml-2 text-xs bg-emerald-700/40 text-emerald-300 border border-emerald-600 rounded px-1">MAIN</span> : <span className="ml-2 text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-1">ALT</span>}
                {(p.roles||[]).length>0 && <span className="ml-2 text-xs text-gray-400">{(p.roles||[]).join(', ')}</span>}
                {p.wowClass && <span className="ml-2 text-xs text-gray-400">· {p.wowClass}</span>}
              </div>
              <div>
                <button
                  type="button"
                  onClick={async ()=> { if (!onDelete) return; if (!confirm('Delete this character?')) return; await Promise.resolve(onDelete(p.id)); }}
                  className="text-sm bg-red-800 hover:bg-red-700 text-red-100 font-semibold py-1 px-2 rounded"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {myPlayers.length === 0 && (
            <li className="py-2 text-sm text-gray-400">No characters yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default CharacterCreatePanel;
