import React from 'react';
import { Match, Player, Role } from '../types';
import { formatTime, isFullGroup } from '../services/matchingService';
import TankIcon from './icons/TankIcon';
import HealerIcon from './icons/HealerIcon';
import DpsIcon from './icons/DpsIcon';
import { ROLES, US_TIMEZONES, DAYS_OF_WEEK } from '../constants';

interface SummaryDisplayProps {
  matches: Match[];
  allPlayers: Player[];
  onDeletePlayer: (playerId: string) => void;
  onClearAllPlayers: () => void;
  roleFilters: Set<Role>;
  toggleRoleFilter: (role: Role) => void;
  sortOption: 'groupSize' | 'time' | 'fullGroups';
  setSortOption: (option: 'groupSize' | 'time' | 'fullGroups') => void;
  showAdminControls?: boolean;
  myClientId?: string;
  onEditPlayer?: (p: Player) => void;
  timezoneFilter?: string; // 'all' or IANA id
  setTimezoneFilter?: (tz: string) => void;
  showMatches?: boolean;
  coffeeView?: 'sat' | 'sun' | null;
}

const roleIcons: { [key in Role]: React.ReactNode } = {
  [Role.TANK]: <TankIcon className="w-5 h-5 inline-block text-blue-400" />,
  [Role.HEALER]: <HealerIcon className="w-5 h-5 inline-block text-green-400" />,
  [Role.DPS]: <DpsIcon className="w-5 h-5 inline-block text-red-400" />,
};

const roleTextColors = {
  [Role.TANK]: 'text-blue-400',
  [Role.HEALER]: 'text-green-400',
  [Role.DPS]: 'text-red-400',
}

const roleFilterColors = {
  [Role.TANK]: 'border-blue-500 bg-blue-500/20 hover:bg-blue-500/30',
  [Role.HEALER]: 'border-green-500 bg-green-500/20 hover:bg-green-500/30',
  [Role.DPS]: 'border-red-500 bg-red-500/20 hover:bg-red-500/30',
};

const selectedRoleFilterColors = {
  [Role.TANK]: 'border-blue-400 bg-blue-500/40 ring-2 ring-blue-400',
  [Role.HEALER]: 'border-green-400 bg-green-500/40 ring-2 ring-green-400',
  [Role.DPS]: 'border-red-400 bg-red-500/40 ring-2 ring-red-400',
}

const MatchCard: React.FC<{ match: Match }> = ({ match }) => {
  const roleCounts = match.players.reduce((acc, player) => {
    for (const r of player.roles || []) {
      acc[r] = (acc[r] || 0) + 1;
    }
    return acc;
  }, {} as Record<Role, number>);

  const fullGroup = isFullGroup(match);

  return (
    <div className={`bg-gray-800 rounded-lg shadow-lg border ${fullGroup ? 'border-yellow-500/50' : 'border-gray-700'} overflow-hidden transition-all hover:shadow-yellow-500/20 hover:border-yellow-500/80`}>
      <div className="p-5">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="font-bold text-xl text-white">{match.day}</p>
            <p className="text-yellow-400 font-semibold">{formatTime(match.start)} - {formatTime(match.end)} ET</p>
          </div>
          <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl ${fullGroup ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 text-white'}`}>
            {match.players.length}
          </div>
        </div>
        
        <div className="mb-4">
          <p className="font-semibold text-gray-300 mb-2">Roles Available:</p>
          <div className="flex space-x-4">
            {Object.entries(roleCounts).map(([role, count]) => (
              <div key={role} className="flex items-center space-x-2 text-lg">
                {roleIcons[role as Role]}
                <span className={`font-bold ${roleTextColors[role as Role]}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <p className="font-semibold text-gray-300 mb-2">Players:</p>
          <div className="flex flex-wrap gap-2">
            {match.players.map(player => {
              const primary = (player.roles && player.roles[0]) || Role.DPS;
              return (
                <span key={player.id} className={`py-1 px-3 rounded-full text-sm font-medium bg-gray-700/80 ${roleTextColors[primary]}`}>
                  {player.name}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ matches, allPlayers, onDeletePlayer, onClearAllPlayers, roleFilters, toggleRoleFilter, sortOption, setSortOption, showAdminControls = false, myClientId, onEditPlayer, timezoneFilter = 'all', setTimezoneFilter, showMatches = true, coffeeView = null }) => {
  const tzOptions = US_TIMEZONES;
  const filteredPlayers = timezoneFilter === 'all' ? allPlayers : allPlayers.filter(p => p.timezone === timezoneFilter);
  return (
    <div className="space-y-8">
      {showMatches && (
      <div>
        <h2 className="text-3xl font-bold mb-4 text-yellow-300">Best Times to Group Up</h2>
        
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-400">Filter by Role:</span>
            {ROLES.map(role => (
                 <button
                    key={role}
                    type="button"
                    onClick={() => toggleRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-all duration-200 flex items-center gap-1
                      ${roleFilters.has(role)
                        ? selectedRoleFilterColors[role]
                        : `${roleFilterColors[role]} text-gray-300`
                      }`}
                  >
                    {roleIcons[role as Role]}
                    {role}
                  </button>
            ))}
          </div>
           <div className="flex items-center gap-2">
             <label htmlFor="tz-select" className="font-semibold text-sm text-gray-400">Timezone:</label>
             <select
               id="tz-select"
               value={timezoneFilter}
               onChange={(e) => setTimezoneFilter && setTimezoneFilter(e.target.value)}
               className="bg-gray-900 border border-gray-600 rounded-md py-1.5 px-2 text-white text-sm focus:ring-yellow-500 focus:border-yellow-500"
             >
               <option value="all">All</option>
               {tzOptions.map(z => (
                 <option key={z.id} value={z.id}>{z.label}</option>
               ))}
             </select>
             <label htmlFor="sort-select" className="font-semibold text-sm text-gray-400">Sort by:</label>
             <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="bg-gray-900 border border-gray-600 rounded-md py-1.5 px-2 text-white text-sm focus:ring-yellow-500 focus:border-yellow-500"
            >
                <option value="groupSize">Group Size</option>
                <option value="fullGroups">Full Groups First</option>
                <option value="time">Time</option>
             </select>
           </div>
        </div>

        {matches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((match, index) => (
              <MatchCard key={`${match.day}-${match.start}-${match.players.map(p=>p.id).join('-')}-${index}`} match={match} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 p-8 rounded-lg text-center border border-gray-700">
            <p className="text-gray-400">No overlapping times found with the current filters.</p>
            <p className="text-gray-500 mt-2">Add more players or adjust availability to find matches.</p>
          </div>
        )}
      </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-bold text-yellow-300">All Players ({filteredPlayers.length})</h2>
            <div className="flex items-center gap-2">
              {showAdminControls && (
                <button onClick={onClearAllPlayers} className="text-sm bg-red-800 hover:bg-red-700 text-red-100 font-semibold py-1 px-3 rounded-md transition-colors">
                  {coffeeView === 'sat' ? 'Clear Coffee & Keys Sat' : coffeeView === 'sun' ? 'Clear Coffee & Keys Sun' : 'Clear All'}
                </button>
              )}
            </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          {filteredPlayers.length > 0 ? (
            <ul className="divide-y divide-gray-700">
              {filteredPlayers.map(player => (
                <li key={player.id} className="py-3 flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 flex items-center justify-center">{roleIcons[(player.roles && player.roles[0]) || Role.DPS]}</span>
                    <div>
                      <p className={`font-semibold ${roleTextColors[(player.roles && player.roles[0]) || Role.DPS]}`}>{player.name}</p>
                      {player.discordName && (
                        <p className="text-xs text-blue-300">Discord: {player.discordName}</p>
                      )}
                      <p className="text-xs text-gray-500">{(player.roles||[]).join(', ')}</p>
                      {(player.wowClass || player.flexRole || player.flexClass) && (
                        <p className="text-xs text-gray-400">{player.wowClass ? `Class: ${player.wowClass}` : ''}{player.flexRole ? ` • Flex Role: ${player.flexRole}` : ''}{player.flexClass ? ` • Flex Class: ${player.flexClass}` : ''}</p>
                      )}
                      {player.coffee && (
                        <p className="text-xs text-amber-300">Coffee&Keys: {(player.coffee.attendSat?'Sat ':'')}{(player.coffee.attendSun?'Sun ':'')} {player.coffee.keyTier ? `(Tier ${player.coffee.keyTier})` : ''}</p>
                      )}
                      {player.notes && (
                        <p className="text-xs text-gray-400 italic">"{player.notes}"</p>
                      )}
                      {/* Raw availability display */}
                      <div className="mt-1 text-xs text-gray-400">
                        <span className="mr-1">{player.timezone}:</span>
                        <div>
                          {DAYS_OF_WEEK.filter(day => player.availability[day] && player.availability[day].length)
                            .map(day => (
                              <div key={`${player.id}-${day}`}>
                                <span className="text-gray-500 mr-1">{day}:</span>
                                {(player.availability[day] || []).map((slot, idx) => (
                                  <span key={idx} className="mr-2">
                                    {formatTime(slot.start)} - {formatTime(slot.end)}
                                  </span>
                                ))}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(showAdminControls || (myClientId && player.clientId === myClientId)) && (
                      <>
                        {onEditPlayer && myClientId && player.clientId === myClientId && (
                          <button onClick={() => onEditPlayer(player)} className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-2 rounded-md transition-colors">Edit</button>
                        )}
                        <button onClick={() => onDeletePlayer(player.id)} className="text-gray-500 hover:text-red-400 text-2xl font-bold transition-colors leading-none">&times;</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
             <p className="text-gray-400 text-center py-4">No players have been added yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryDisplay;
