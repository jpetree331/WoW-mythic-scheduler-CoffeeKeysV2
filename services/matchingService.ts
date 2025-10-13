import { Player, Match, Role } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { DateTime } from 'luxon';

const SLOT_DURATION = 30; // 30 minutes

// Helper to get a unique key for a set of players
const getPlayerGroupKey = (players: Player[]): string => {
  return players.map(p => p.id).sort().join(',');
};

// Convert a player's local availability slot for a given day into ET day/minute segments
const toETSegments = (day: string, start: number, end: number, fromTZ: string): { day: string; start: number; end: number }[] => {
  const dayIndex = DAYS_OF_WEEK.indexOf(day); // 0..6
  if (dayIndex < 0) return [];
  // Find Monday 00:00 in player's TZ for reference week
  const now = DateTime.now().setZone(fromTZ);
  const weekday = now.weekday; // 1=Mon..7=Sun
  const monday = now.startOf('day').minus({ days: weekday - 1 });
  const localStart = monday.plus({ days: dayIndex, minutes: start });
  const localEnd = monday.plus({ days: dayIndex, minutes: end });
  const etStart = localStart.setZone('America/New_York');
  const etEnd = localEnd.setZone('America/New_York');

  const segments: { day: string; start: number; end: number }[] = [];
  const pushSeg = (dtStart: DateTime, dtEnd: DateTime) => {
    const wd = dtStart.weekday; // 1..7
    const dayStr = DAYS_OF_WEEK[wd - 1];
    segments.push({ day: dayStr, start: dtStart.hour * 60 + dtStart.minute, end: dtEnd.hour * 60 + dtEnd.minute });
  };

  if (etStart.startOf('day').toISO() === etEnd.startOf('day').toISO()) {
    pushSeg(etStart, etEnd);
  } else {
    // Split across day boundary in ET
    const endOfDay = etStart.endOf('day');
    pushSeg(etStart, endOfDay);
    const startOfNext = etEnd.startOf('day');
    pushSeg(startOfNext, etEnd);
  }
  return segments;
};

export const findOverlaps = (players: Player[]): Match[] => {
  if (players.length < 2) {
    return [];
  }

  const weeklySlots: { [day: string]: { [minute: number]: Player[] } } = {};

  // Initialize weekly slots
  for (const day of DAYS_OF_WEEK) {
    weeklySlots[day] = {};
    for (let minute = 0; minute < 24 * 60; minute += SLOT_DURATION) {
      weeklySlots[day][minute] = [];
    }
  }

  // Populate slots with available players, converting each player's timezone to ET
  for (const player of players) {
    const tz = player.timezone || 'America/New_York';
    for (const day in player.availability) {
      const slots = player.availability[day] || [];
      for (const s of slots) {
        const segs = toETSegments(day, s.start, s.end, tz);
        for (const seg of segs) {
          if (!weeklySlots[seg.day]) continue;
          for (let minute = seg.start; minute < seg.end; minute += SLOT_DURATION) {
            if (weeklySlots[seg.day][minute]) {
              weeklySlots[seg.day][minute].push(player);
            }
          }
        }
      }
    }
  }

  const matches: Match[] = [];

  // Consolidate consecutive slots with the same group of players
  for (const day of DAYS_OF_WEEK) {
    let currentMatch: Match | null = null;

    const sortedMinutes = Object.keys(weeklySlots[day]).map(Number).sort((a, b) => a - b);

    for (const minute of sortedMinutes) {
      const currentPlayers = weeklySlots[day][minute];
      if (currentPlayers.length < 2) {
        if (currentMatch) {
          matches.push(currentMatch);
          currentMatch = null;
        }
        continue;
      }

      const currentPlayerKey = getPlayerGroupKey(currentPlayers);

      if (currentMatch) {
        const currentMatchKey = getPlayerGroupKey(currentMatch.players);
        if (currentPlayerKey === currentMatchKey) {
          // Extend current match
          currentMatch.end = minute + SLOT_DURATION;
        } else {
          // End current match and start a new one
          matches.push(currentMatch);
          currentMatch = {
            day,
            start: minute,
            end: minute + SLOT_DURATION,
            players: currentPlayers,
          };
        }
      } else {
        // Start a new match
        currentMatch = {
          day,
          start: minute,
          end: minute + SLOT_DURATION,
          players: currentPlayers,
        };
      }
    }

    if (currentMatch) {
      matches.push(currentMatch);
    }
  }

  return matches;
};

export const formatTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    const minute = m === 0 ? '00' : '30';
    return `${hour}:${minute} ${period}`;
};

// Determine if we can assign roles (1 tank, 1 healer, 3 dps) from flexible players
export const isFullGroup = (match: Match): boolean => {
  const players = match.players;
  // Backtracking assignment
  const need = [Role.TANK, Role.HEALER, Role.DPS, Role.DPS, Role.DPS];
  const used = new Array(players.length).fill(false);
  function dfs(i: number): boolean {
    if (i === need.length) return true;
    const role = need[i];
    for (let p = 0; p < players.length; p++) {
      if (used[p]) continue;
      const can = (players[p].roles || []).includes(role);
      if (!can) continue;
      used[p] = true;
      if (dfs(i + 1)) return true;
      used[p] = false;
    }
    return false;
  }
  return dfs(0);
};
