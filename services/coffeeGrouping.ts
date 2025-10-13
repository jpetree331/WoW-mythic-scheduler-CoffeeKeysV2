import { Player, Role } from '../types';

export type KeyTier = '2-5' | '6-9' | '10+';

export interface CoffeeGroup {
  id: string;
  tier: KeyTier;
  players: Player[]; // up to 5
}

export interface CoffeeGroupingResult {
  tier: KeyTier;
  groups: CoffeeGroup[];
  unassigned: Player[];
}

export function autoGroup(players: Player[], tier: KeyTier): CoffeeGroupingResult {
  const eligible = players.filter(p => p.coffee?.keyTier === tier);
  const tanks = eligible.filter(p => (p.roles||[]).includes(Role.TANK));
  const healers = eligible.filter(p => (p.roles||[]).includes(Role.HEALER));
  const dps = eligible.filter(p => (p.roles||[]).includes(Role.DPS));

  const groups: CoffeeGroup[] = [];
  let idx = 0;
  while (tanks.length > 0 && healers.length > 0 && dps.length >= 3) {
    const g: Player[] = [];
    g.push(tanks.shift()!);
    g.push(healers.shift()!);
    g.push(dps.shift()!);
    g.push(dps.shift()!);
    g.push(dps.shift()!);
    groups.push({ id: `${tier}-${idx++}`, tier, players: g });
  }
  const used = new Set(groups.flatMap(g => g.players.map(p => p.id)));
  const unassigned = eligible.filter(p => !used.has(p.id));
  return { tier, groups, unassigned };
}

export function filterCoffeeAttendees(all: Player[], day: 'sat'|'sun'): Player[] {
  return all.filter(p => {
    const c = p.coffee;
    if (!c) return false;
    return day === 'sat' ? !!c.attendSat : !!c.attendSun;
  });
}

