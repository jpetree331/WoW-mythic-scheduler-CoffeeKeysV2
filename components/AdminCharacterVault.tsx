import React from 'react';
import type { Player } from '../types';

interface Props {
  players: Player[];
  onClose: () => void;
}

const AdminCharacterVault: React.FC<Props> = ({ players, onClose }) => {
  // Group by discordId/display
  const groups = React.useMemo(() => {
    const map = new Map<string, { owner: string; list: Player[] }>();
    for (const p of players) {
      const key = (p.discordId || 'unknown') + '::' + (p.discordName || '');
      const ownerLabel = p.discordName ? `${p.discordName}` : (p.discordId ? `Discord ${p.discordId}` : 'Unknown');
      if (!map.has(key)) map.set(key, { owner: ownerLabel, list: [] });
      map.get(key)!.list.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.owner.localeCompare(b.owner));
  }, [players]);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-[90vw] max-w-4xl max-h-[85vh] overflow-auto">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-yellow-300">Character Vault</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {groups.length === 0 ? (
            <p className="text-gray-400">No characters submitted.</p>
          ) : groups.map((g, idx) => (
            <div key={idx} className="bg-gray-800 border border-gray-700 rounded p-3">
              <div className="text-sm text-gray-400 mb-2">Owner: <span className="text-gray-200">{g.owner}</span></div>
              <ul className="divide-y divide-gray-700">
                {g.list.map(p => (
                  <li key={p.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-100">
                        {p.name} {p.isMain ? <span className="ml-2 text-xs bg-emerald-700/40 text-emerald-300 border border-emerald-600 rounded px-1">MAIN</span> : <span className="ml-2 text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-1">ALT</span>}
                      </div>
                      <div className="text-xs text-gray-400">Roles: {(p.roles||[]).join(', ')}{p.wowClass ? ` · Class: ${p.wowClass}` : ''}</div>
                      {p.coffee && (p.coffee.attendSat || p.coffee.attendSun) && (
                        <div className="text-xs text-amber-300">Coffee&Keys: {(p.coffee.attendSat?'Sat ':'')}{(p.coffee.attendSun?'Sun ':'')} {p.coffee.keyTier ? `(Tier ${p.coffee.keyTier})` : ''}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{p.timezone}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminCharacterVault;

