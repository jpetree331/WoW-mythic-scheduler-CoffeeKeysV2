import React from 'react';
import type { Player } from '../types';
import { updatePlayer } from '../services/api';

interface Props {
  players: Player[]; // only the user's characters
  onClose: () => void;
}

const CoffeeJoinModal: React.FC<Props> = ({ players, onClose }) => {
  const [daySat, setDaySat] = React.useState<boolean>(false);
  const [daySun, setDaySun] = React.useState<boolean>(false);
  const [tier, setTier] = React.useState<'2-5'|'6-9'|'10+'|''>('');
  const [selectedId, setSelectedId] = React.useState<string>(players[0]?.id || '');
  const submit = async () => {
    if (!selectedId || (!daySat && !daySun) || !tier) {
      alert('Please select a character, day, and key level.');
      return;
    }
    try {
      await updatePlayer(selectedId, { coffee: { attendSat: daySat, attendSun: daySun, keyTier: tier as any } });
      onClose();
      // best-effort refresh
      window.location.reload();
    } catch (e) {
      console.error('coffee join failed', e);
      alert('Failed to update Coffee & Keys preference');
    }
  };
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-[90vw] max-w-lg">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-yellow-300">Join Coffee & Keys</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Character</label>
            <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100">
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.isMain ? '(MAIN)' : '(ALT)'} · {(p.roles||[])[0] || ''} {p.wowClass ? `· ${p.wowClass}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={daySat} onChange={e=>setDaySat(e.target.checked)} /> Saturday</label>
            <label className="flex items-center gap-2 text-gray-300"><input type="checkbox" checked={daySun} onChange={e=>setDaySun(e.target.checked)} /> Sunday</label>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Preferred key level</label>
            <div className="flex gap-2 flex-wrap">
              {(['2-5','6-9','10+'] as const).map(t => (
                <button key={t} type="button" onClick={()=>setTier(t)} className={`text-sm py-1 px-2 rounded-md border ${tier===t? 'bg-yellow-500 text-gray-900 border-yellow-400' : 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">Cancel</button>
            <button onClick={submit} className="px-3 py-2 rounded bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoffeeJoinModal;

