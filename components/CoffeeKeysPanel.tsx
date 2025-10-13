import React, { useMemo } from 'react';
import { Player, Role } from '../types';
import { autoGroup, filterCoffeeAttendees, KeyTier } from '../services/coffeeGrouping';
import { assignCoffee, assignCoffeeBatch } from '../services/api';

interface Props {
  allPlayers: Player[];
  day: 'sat' | 'sun';
}

const tiers: KeyTier[] = ['2-5', '6-9', '10+'];

function roleColor(p: Player): string {
  const primary = (p.roles && p.roles[0]) || Role.DPS;
  if (primary === Role.TANK) return 'text-blue-400';
  if (primary === Role.HEALER) return 'text-green-400';
  return 'text-red-400';
}

const CoffeeKeysPanel: React.FC<Props> = ({ allPlayers, day }) => {
  const attendees = filterCoffeeAttendees(allPlayers, day);
  const anyAssigned = attendees.some(p => p.coffeeAssign && p.coffeeAssign.day === day && p.coffeeAssign.groupIndex != null);

  const assignedGroups = useMemo(() => {
    const byTier: Record<KeyTier, { [idx: number]: Player[] }> = { '2-5': {}, '6-9': {}, '10+': {} } as any;
    const unassigned: Player[] = [];
    for (const p of attendees) {
      const ca = p.coffeeAssign;
      if (ca && ca.day === day && ca.tier && ca.groupIndex != null) {
        const t = ca.tier as KeyTier;
        byTier[t][ca.groupIndex] = byTier[t][ca.groupIndex] || [];
        byTier[t][ca.groupIndex].push(p);
      } else {
        unassigned.push(p);
      }
    }
    return { byTier, unassigned };
  }, [attendees, day]);

  const autoResults = tiers.map(t => autoGroup(attendees, t));

  const groupCounts: Record<KeyTier, number> = useMemo(() => {
    const counts: Record<KeyTier, number> = { '2-5': 0, '6-9': 0, '10+': 0 } as any;
    if (anyAssigned) {
      (['2-5', '6-9', '10+'] as KeyTier[]).forEach(t => {
        const map = assignedGroups.byTier[t];
        counts[t] = map ? Object.keys(map).length : 0;
      });
    } else {
      autoResults.forEach(r => { counts[r.tier] = r.groups.length; });
    }
    return counts;
  }, [anyAssigned, assignedGroups, autoResults]);

  const title = day === 'sat' ? 'Coffee & Keys - Saturday' : 'Coffee & Keys - Sunday';

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
      <h2 className="text-2xl font-bold text-yellow-300 mb-3">{title}</h2>
      {attendees.length === 0 ? (
        <p className="text-gray-400">No signups yet for this day.</p>
      ) : (
        <div className="space-y-6">
          {!anyAssigned && (
            <div className="flex justify-end">
              <button
                className="text-sm bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold py-1 px-3 rounded-md"
                onClick={async () => {
                  const batch: { id: string, tier: KeyTier, groupIndex: number }[] = [];
                  for (const r of autoResults) {
                    r.groups.forEach((g, gi) => {
                      g.players.forEach(p => batch.push({ id: p.id, tier: r.tier, groupIndex: gi + 1 }));
                    });
                  }
                  try {
                    await assignCoffeeBatch(day, batch, true);
                    // Refresh the page to show the assignments
                    window.location.reload();
                  } catch (e) {
                    console.error('Auto-assign failed:', e);
                    alert('Failed to apply auto-assign');
                  }
                }}
              >Apply Auto-Assign</button>
            </div>
          )}

          {tiers.map((t) => {
            const groups: { index: number, players: Player[] }[] = [];
            if (anyAssigned) {
              const map = assignedGroups.byTier[t];
              const indices = Object.keys(map).map(n => parseInt(n, 10)).sort((a, b) => a - b);
              for (const idx of indices) groups.push({ index: idx, players: map[idx] });
            } else {
              const ar = autoResults.find(x => x.tier === t)!;
              ar.groups.forEach((g, gi) => groups.push({ index: gi + 1, players: g.players }));
            }
            const maxIndex = groups.length;
            const unassigned = anyAssigned ? assignedGroups.unassigned.filter(p => (p.coffee?.keyTier === t)) : autoResults.find(x => x.tier === t)!.unassigned;

            return (
              <div key={t}>
                <h3 className="text-xl font-semibold text-gray-200 mb-2">Tier {t}</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {groups.map((g, gi) => (
                    <div key={gi} className="p-3 bg-gray-700/50 rounded border border-gray-600">
                      <div className="text-gray-300 font-semibold mb-1">Group {g.index}</div>
                      <ul className="text-gray-200 list-disc list-inside space-y-1">
                        {g.players.map(p => (
                          <li key={p.id}>
                            <span className={roleColor(p)}>{p.name}</span>
                            <span> — {(p.roles || []).join(', ')}{p.wowClass ? ` (${p.wowClass})` : ''}</span>
                            <select
                              className="ml-2 text-xs bg-gray-800 border border-gray-600 rounded px-1 py-0.5"
                              defaultValue=""
                              onChange={async (e) => {
                                const val = e.target.value;
                                if (val === 'unassign') { await assignCoffee({ id: p.id, day: null }); return; }
                                const [tierSel, grp] = val.split(':');
                                const idx = grp === 'new' ? ((groupCounts[tierSel as KeyTier] || 0) + 1) : parseInt(grp, 10);
                                await assignCoffee({ id: p.id, day, tier: tierSel as KeyTier, groupIndex: idx });
                              }}
                            >
                              <option value="" disabled>↓</option>
                              {(['2-5', '6-9', '10+'] as KeyTier[]).map(tt => (
                                <optgroup key={tt} label={`Tier ${tt}`}>
                                  {Array.from({ length: Math.max(1, groupCounts[tt] || 0) }).map((_, i) => (
                                    <option key={`${tt}-${i + 1}`} value={`${tt}:${i + 1}`}>Group {i + 1}</option>
                                  ))}
                                  <option value={`${tt}:new`}>New Group</option>
                                </optgroup>
                              ))}
                              <option value="unassign">Unassign</option>
                            </select>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="mt-2">
                  <div className="text-sm text-gray-400 mb-1">Unassigned (Tier {t}):</div>
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map(p => (
                      <span key={p.id} className="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded">
                        <span className={roleColor(p)}>{p.name}</span>
                        <select
                          className="ml-2 text-xs bg-gray-800 border border-gray-600 rounded px-1 py-0.5"
                          defaultValue=""
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const [tierSel, grp] = val.split(':');
                            const idx = grp === 'new' ? ((groupCounts[tierSel as KeyTier] || 0) + 1) : parseInt(grp, 10);
                            await assignCoffee({ id: p.id, day, tier: tierSel as KeyTier, groupIndex: idx });
                          }}
                        >
                          <option value="" disabled>↓</option>
                          {(['2-5', '6-9', '10+'] as KeyTier[]).map(tt => (
                            <optgroup key={tt} label={`Tier ${tt}`}>
                              {Array.from({ length: Math.max(1, groupCounts[tt] || 0) }).map((_, i) => (
                                <option key={`${tt}-${i + 1}`} value={`${tt}:${i + 1}`}>Group {i + 1}</option>
                              ))}
                              <option value={`${tt}:new`}>New Group</option>
                            </optgroup>
                          ))}
                        </select>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CoffeeKeysPanel;
