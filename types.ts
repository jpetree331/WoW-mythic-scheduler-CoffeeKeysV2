export enum Role {
  TANK = 'Tank',
  HEALER = 'Healer',
  DPS = 'DPS',
}

export interface TimeSlot {
  start: number; // in minutes from midnight
  end: number;   // in minutes from midnight
}

export type Availability = {
  [day: string]: TimeSlot[];
};

export interface Player {
  id: string;
  name: string;
  roles: Role[];
  timezone: string; // IANA timezone, e.g., 'America/New_York'
  availability: Availability;
  notes?: string;
  discordName?: string; // optional Discord handle for contact
  discordId?: string; // optional: attached Discord user id
  board?: string; // board slug this player belongs to
  clientId?: string; // owner id (local browser)
  isMain?: boolean; // MAIN vs ALT flag
  // Coffee & Keys event signup (optional)
  coffee?: {
    attendSat?: boolean;
    attendSun?: boolean;
    keyTier?: '2-5' | '6-9' | '10+';
  };
  wowClass?: string; // optional: class for admin info only
  flexRole?: Role; // optional: flex role (admin info)
  flexClass?: string; // optional: flex class (admin info)
  coffeeAssign?: {
    day?: 'sat' | 'sun';
    tier?: '2-5' | '6-9' | '10+';
    groupIndex?: number;
  };
}

export interface Match {
  day: string;
  start: number;
  end: number;
  players: Player[];
}
