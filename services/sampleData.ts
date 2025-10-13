import { Player, Role } from '../types';

export const SAMPLE_PLAYERS: Player[] = [
  {
    id: 'sample-1',
    name: 'Aela (Tank)',
    roles: [Role.TANK],
    timezone: 'America/New_York',
    availability: {
      Monday: [{ start: 1140, end: 1320 }], // 7:00pm-10:00pm ET
      Wednesday: [{ start: 1140, end: 1320 }],
      Friday: [{ start: 1200, end: 1380 }], // 8:00pm-11:00pm ET
    },
    notes: 'Prot Warrior',
    board: 'default',
    clientId: 'sample',
  },
  {
    id: 'sample-2',
    name: 'Brin (Healer)',
    roles: [Role.HEALER],
    timezone: 'America/Chicago',
    availability: {
      Monday: [{ start: 1140, end: 1320 }],
      Wednesday: [{ start: 1140, end: 1320 }],
      Friday: [{ start: 1200, end: 1380 }],
    },
    notes: 'Resto Shaman',
    board: 'default',
    clientId: 'sample',
  },
  {
    id: 'sample-3',
    name: 'Callan (DPS)',
    roles: [Role.DPS],
    timezone: 'America/New_York',
    availability: {
      Monday: [{ start: 1170, end: 1350 }], // 7:30pm-10:30pm ET
      Wednesday: [{ start: 1140, end: 1320 }],
    },
    notes: 'Havoc DH',
    board: 'default',
    clientId: 'sample',
  },
  {
    id: 'sample-4',
    name: 'Dara (DPS)',
    roles: [Role.DPS],
    timezone: 'America/Los_Angeles',
    availability: {
      Monday: [{ start: 1140, end: 1320 }],
      Friday: [{ start: 1200, end: 1380 }],
    },
    notes: 'BM Hunter',
    board: 'default',
    clientId: 'sample',
  },
  {
    id: 'sample-5',
    name: 'Eryn (Flex)',
    roles: [Role.HEALER, Role.DPS],
    timezone: 'America/New_York',
    availability: {
      Wednesday: [{ start: 1140, end: 1320 }],
      Thursday: [{ start: 1140, end: 1320 }],
    },
    notes: 'Prevoker / Augvoker',
    board: 'default',
    clientId: 'sample',
  },
  {
    id: 'sample-6',
    name: 'Fenn (DPS)',
    roles: [Role.DPS],
    timezone: 'America/New_York',
    availability: {
      Friday: [{ start: 1200, end: 1380 }],
      Saturday: [{ start: 780, end: 1020 }], // 1:00pm-5:00pm ET
    },
    notes: 'Mage',
    board: 'default',
    clientId: 'sample',
  },
];

