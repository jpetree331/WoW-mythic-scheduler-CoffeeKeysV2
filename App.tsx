import React, { useState, useEffect, useMemo } from 'react';
import { Player, Match, Role } from './types';
import AvailabilityForm from './components/AvailabilityForm';
import SummaryDisplay from './components/SummaryDisplay';
import { findOverlaps, isFullGroup } from './services/matchingService';
import { fetchPlayers, createPlayer, deletePlayer as apiDeletePlayer, clearPlayers as apiClearPlayers, clearGeneralPlayers as apiClearGeneralPlayers, clearCoffeePlayers, setAdminToken, subscribeToUpdates, getAdminToken, clearAdminToken, updatePlayer as apiUpdatePlayer, getClientId, fetchBoardSettings, updateBoardSettings, verifyAdminToken, fetchMe, getDiscordLoginUrl, logout as apiLogout, claimMyEntries } from './services/api';
import CoffeeKeysPanel from './components/CoffeeKeysPanel';
import AdminCharacterVault from './components/AdminCharacterVault';
import CoffeeJoinModal from './components/CoffeeJoinModal';
import MyCharactersModal from './components/MyCharactersModal';
import { SAMPLE_PLAYERS } from './services/sampleData';
import { filterCoffeeAttendees } from './services/coffeeGrouping';

// Admin UI visibility: only the project owner's browser (by clientId) sees the Set Admin Token button.
const ADMIN_CLIENT_ID = (import.meta as any).env?.VITE_ADMIN_CLIENT_ID as string | undefined;


const App: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [roleFilters, setRoleFilters] = useState<Set<Role>>(new Set());
  const [sortOption, setSortOption] = useState<'groupSize' | 'time' | 'fullGroups'>('groupSize');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [timezoneFilter, setTimezoneFilter] = useState<string>('all');
  const [boardTitle, setBoardTitle] = useState<string>('Coffee & Keys M+');
  const [showSamples, setShowSamples] = useState<boolean>(() => {
    try { return localStorage.getItem('mff_show_samples') === '1'; } catch { return false; }
  });
  const displayPlayers = useMemo(() => (isAdmin && showSamples) ? [...players, ...SAMPLE_PLAYERS] : players, [players, isAdmin, showSamples]);
  const [coffeeView, setCoffeeView] = useState<null | 'sat' | 'sun'>(null);
  const [me, setMe] = useState<{ id: string; display?: string|null } | null>(null);
  const [showVault, setShowVault] = useState(false);
  const [showCoffeeJoin, setShowCoffeeJoin] = useState(false);
  const [showMyChars, setShowMyChars] = useState(false);
  const hasAvailability = (p: Player) => {
    try { return Object.values(p.availability||{}).some((arr:any)=> Array.isArray(arr) && arr.length>0); } catch { return false; }
  };
  const generalPlayers = useMemo(()=> displayPlayers.filter(hasAvailability), [displayPlayers]);
  const coffeeDayPlayers = useMemo(()=> coffeeView ? filterCoffeeAttendees(displayPlayers, coffeeView) : [], [displayPlayers, coffeeView]);
  const visiblePlayers = useMemo(()=> {
    if (isAdmin && coffeeView) return coffeeDayPlayers;
    return generalPlayers;
  }, [isAdmin, coffeeView, generalPlayers, coffeeDayPlayers]);
  const myClientId = getClientId();
  const isOwner = ADMIN_CLIENT_ID ? myClientId === ADMIN_CLIENT_ID : false;

  useEffect(() => {
    const calculatedMatches = findOverlaps(displayPlayers);
    setMatches(calculatedMatches);
  }, [displayPlayers]);

  // Initial load from backend
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPlayers();
        setPlayers(data);
        try {
          const board = await fetchBoardSettings();
          if (board && typeof board.title === 'string' && board.title.trim().length > 0) {
            setBoardTitle(board.title);
          }
        } catch (e) {
          // ignore board settings failure; keep default title
        }
        try {
          const meRes = await fetchMe();
          const user = meRes.user ? { id: meRes.user.id, display: meRes.user.display || meRes.user.username || meRes.user.global_name || null } : null;
          setMe(user);
          if (user) {
            try {
              const res = await claimMyEntries();
              if (res && res.updated > 0) {
                const refreshed = await fetchPlayers();
                setPlayers(refreshed);
              }
            } catch {}
          }
        } catch {}
      } catch (e) {
        console.error('Failed to load players', e);
      }
    })();
    // Verify admin token (if any) before showing admin controls
    (async () => {
      try {
        const token = getAdminToken();
        if (token) {
          const ok = await verifyAdminToken();
          setIsAdmin(!!ok);
        } else {
          setIsAdmin(false);
        }
      } catch { setIsAdmin(false); }
    })();
    // Subscribe to live updates
    const unsubscribe = subscribeToUpdates(async () => {
      try {
        const data = await fetchPlayers();
        setPlayers(data);
        try {
          const board = await fetchBoardSettings();
          if (board && typeof board.title === 'string') {
            setBoardTitle(board.title || 'Coffee & Keys M+');
          }
        } catch {
          // ignore
        }
      } catch (e) {
        console.error('Failed to refresh players after update', e);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddPlayer = async (playerData: Omit<Player, 'id'>) => {
    try {
      if (editing) {
        const updated = await apiUpdatePlayer(editing.id, playerData);
        // Preserve clientId and board from existing player to avoid losing ownership in UI state
        setPlayers(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } as Player : p));
        setEditing(null);
      } else {
        // Require Discord login for submissions
        if (!me) {
          const go = confirm('Please login with Discord first. Open Discord login now?');
          if (go) {
            window.location.href = getDiscordLoginUrl();
          }
          return;
        }
        // Main/Alt prompt: if user already has a character, ask if this is an ALT
        const myChars = players.filter(p => p.discordId && me && p.discordId === me.id);
        let payload: any = { ...playerData };
        if (myChars.length > 0) {
          const isAlt = confirm('Is this an alt? Click OK for Yes, Cancel for No');
          if (isAlt) {
            payload.isMain = false;
          } else {
            alert('You already have a MAIN. Edit your main instead or create an ALT.');
            return;
          }
        }
        const created = await createPlayer(payload);
        setPlayers(prev => [...prev, created]);
      }
    } catch (e) {
      console.error('Failed to add player', e);
      alert('Failed to submit availability. Please try again.');
    }
  };
  
  const handleDeletePlayer = async (playerId: string) => {
    if (playerId.startsWith('sample-')) {
      alert('Sample player; cannot delete. Toggle off sample data instead.');
      return;
    }
    try {
      await apiDeletePlayer(playerId);
      setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId));
    } catch (e) {
      console.error('Failed to delete player', e);
      if (!getAdminToken()) {
        const token = prompt('Admin token required to delete. Enter token:');
        if (token) setAdminToken(token);
      } else {
        alert('Failed to delete player.');
      }
    }
  };
  
  const handleClearAllPlayers = async () => {
    if (!confirm('This will remove ALL players from the shared list. Continue?')) return;
    try {
      await apiClearPlayers();
      setPlayers([]);
    } catch (e) {
      console.error('Failed to clear players', e);
      const token = prompt('Admin token required to clear all. Enter token:');
      if (token) {
        setAdminToken(token);
        try {
          await apiClearPlayers();
          setPlayers([]);
        } catch {
          alert('Failed to clear players.');
        }
      }
    }
  };

  const handleClearGeneralPlayers = async () => {
    if (!confirm('This will remove all general availability players (not Coffee & Keys players). Continue?')) return;
    try {
      await apiClearGeneralPlayers();
      // Refresh players to get updated data
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (e) {
      console.error('Failed to clear general players', e);
      alert('Failed to clear general players.');
    }
  };

  const handleClearCoffeeSat = async () => {
    if (!confirm('This will clear all Coffee & Keys Saturday signups and assignments. Continue?')) return;
    try {
      await clearCoffeePlayers('sat');
      // Refresh players to get updated data
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (e) {
      console.error('Failed to clear Coffee & Keys Sat', e);
      alert('Failed to clear Coffee & Keys Saturday data.');
    }
  };

  const handleClearCoffeeSun = async () => {
    if (!confirm('This will clear all Coffee & Keys Sunday signups and assignments. Continue?')) return;
    try {
      await clearCoffeePlayers('sun');
      // Refresh players to get updated data
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (e) {
      console.error('Failed to clear Coffee & Keys Sun', e);
      alert('Failed to clear Coffee & Keys Sunday data.');
    }
  };

  // removed sample loader in production

  const toggleRoleFilter = (role: Role) => {
    setRoleFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(role)) {
        newFilters.delete(role);
      } else {
        newFilters.add(role);
      }
      return newFilters;
    });
  };

  const sortedMatches = useMemo(() => {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return [...matches].sort((a, b) => {
      if (sortOption === 'fullGroups') {
        const aIsFull = isFullGroup(a);
        const bIsFull = isFullGroup(b);
        if (aIsFull !== bIsFull) return aIsFull ? -1 : 1;
      }
      
      if (sortOption === 'groupSize' || sortOption === 'fullGroups') {
         if (b.players.length !== a.players.length) {
            return b.players.length - a.players.length;
         }
      }

      if (dayOrder.indexOf(a.day) !== dayOrder.indexOf(b.day)) {
        return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      }
      return a.start - b.start;
    });
  }, [matches, sortOption]);

  const filteredMatches = useMemo(() => {
    if (roleFilters.size === 0) {
      let res = sortedMatches;
      if (timezoneFilter !== 'all') {
        res = res.filter(match => match.players.some(p => p.timezone === timezoneFilter));
      }
      return res;
    }
    let res = sortedMatches.filter(match => 
      Array.from(roleFilters).every(filterRole => 
        match.players.some(player => (player.roles||[]).includes(filterRole))
      )
    );
    if (timezoneFilter !== 'all') {
      res = res.filter(match => match.players.some(p => p.timezone === timezoneFilter));
    }
    return res;
  }, [sortedMatches, roleFilters, timezoneFilter]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-yellow-400 tracking-wider" style={{textShadow: '0 0 10px rgba(250, 204, 21, 0.5)'}}>
            {boardTitle}
          </h1>
          {showSamples && (
            <span className="mt-2 inline-block text-xs font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/50 rounded-full px-2 py-0.5">
              Sample Data ON
            </span>
          )}
          <p className="mt-2 text-lg text-gray-400">Coordinate your weekly keys with ease.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {me ? (
              <>
                <span className="text-sm text-gray-300">Signed in as {me.display || 'Discord user'}</span>
                <button
                  onClick={async () => { try { await apiLogout(); setMe(null); } catch {} }}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
                >
                  Logout
                </button>
                <button
                  onClick={()=> setShowMyChars(true)}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
                >
                  My Characters
                </button>
                {/* User Coffee join quick action */}
                {players.some(p=>p.discordId && me && p.discordId===me.id) && (
                  <button
                    onClick={()=> setShowCoffeeJoin(true)}
                    className="text-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold py-1 px-3 rounded-md transition-colors"
                  >
                    Join Coffee & Keys
                  </button>
                )}
              </>
            ) : (
              <a
                href={getDiscordLoginUrl()}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1 px-3 rounded-md transition-colors"
              >
                Login with Discord
              </a>
            )}
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                if (!url.searchParams.get('board')) {
                  url.searchParams.set('board', 'default');
                }
                navigator.clipboard.writeText(url.toString());
                alert('Shareable link copied to clipboard');
              }}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-yellow-300 font-semibold py-1 px-3 rounded-md transition-colors"
            >
              Copy Share Link
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  const nextTitle = prompt('Set board title:', boardTitle || 'Coffee & Keys M+');
                  if (nextTitle !== null) {
                    try {
                      const updated = await updateBoardSettings({ title: nextTitle.trim() || null });
                      setBoardTitle((updated && updated.title) || 'Coffee & Keys M+');
                    } catch (e) {
                      alert('Failed to update title. Make sure admin password is set.');
                    }
                  }
                }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
              >
                Change Title
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={() => setCoffeeView(null)}
                  className={`text-sm font-semibold py-1 px-3 rounded-md transition-colors ${coffeeView===null ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                  General
                </button>
                <button
                  onClick={() => setCoffeeView(prev => prev === 'sat' ? null : 'sat')}
                  className={`text-sm font-semibold py-1 px-3 rounded-md transition-colors ${coffeeView==='sat' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                  Coffee & Keys Sat
                </button>
                <button
                  onClick={() => setCoffeeView(prev => prev === 'sun' ? null : 'sun')}
                  className={`text-sm font-semibold py-1 px-3 rounded-md transition-colors ${coffeeView==='sun' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                >
                  Coffee & Keys Sun
                </button>
                <button
                  onClick={() => setShowVault(true)}
                  className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
                >
                  Character Vault
                </button>
              </>
            )}
            <button
              onClick={async () => {
                const token = prompt('Enter admin password:');
                if (!token) return;
                setAdminToken(token);
                const ok = await verifyAdminToken();
                if (ok) {
                  setIsAdmin(true);
                } else {
                  clearAdminToken();
                  setIsAdmin(false);
                  alert('Invalid admin password.');
                }
              }}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
            >
              Enter Admin PW
            </button>
            {isAdmin && (
              <button
                onClick={() => { clearAdminToken(); setIsAdmin(false); }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
              >
                Clear Admin Token
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  const next = !showSamples;
                  setShowSamples(next);
                  try { localStorage.setItem('mff_show_samples', next ? '1' : '0'); } catch {}
                }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-1 px-3 rounded-md transition-colors"
              >
                {showSamples ? 'Hide Sample Data' : 'Show Sample Data'}
              </button>
            )}
          </div>
        </header>
        
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1" id="availability-form">
            <AvailabilityForm onSubmit={handleAddPlayer} initial={editing ? { ...editing } : undefined} onCancelEdit={() => setEditing(null)} />
          </div>
          <div className="lg:col-span-2">
            {isAdmin && coffeeView ? (
              <div className="space-y-6">
                <CoffeeKeysPanel allPlayers={displayPlayers} day={coffeeView} />
                <SummaryDisplay
                  matches={[]}
                  allPlayers={coffeeDayPlayers}
                  onDeletePlayer={handleDeletePlayer}
                  onClearAllPlayers={coffeeView === 'sat' ? handleClearCoffeeSat : handleClearCoffeeSun}
                  roleFilters={roleFilters}
                  toggleRoleFilter={toggleRoleFilter}
                  sortOption={sortOption}
                  setSortOption={setSortOption}
                  showAdminControls={isAdmin}
                  myClientId={myClientId}
                  onEditPlayer={(p)=> setEditing(p)}
                  timezoneFilter={timezoneFilter}
                  setTimezoneFilter={setTimezoneFilter}
                  showMatches={false}
                  coffeeView={coffeeView}
                />
              </div>
            ) : (
              <SummaryDisplay
                matches={filteredMatches}
                allPlayers={visiblePlayers}
                onDeletePlayer={handleDeletePlayer}
                onClearAllPlayers={handleClearGeneralPlayers}
                roleFilters={roleFilters}
                toggleRoleFilter={toggleRoleFilter}
                sortOption={sortOption}
                setSortOption={setSortOption}
                showAdminControls={isAdmin}
                myClientId={myClientId}
                onEditPlayer={(p)=> setEditing(p)}
                timezoneFilter={timezoneFilter}
                setTimezoneFilter={setTimezoneFilter}
              />
            )}
          </div>
        </main>
        {isAdmin && showVault && (
          <AdminCharacterVault players={players} onClose={()=> setShowVault(false)} />
        )}
        {showCoffeeJoin && me && (
          <CoffeeJoinModal onClose={()=> setShowCoffeeJoin(false)} players={players.filter(p=>p.discordId && p.discordId===me.id)} />
        )}
        {showMyChars && me && (
          <MyCharactersModal
            onClose={()=> setShowMyChars(false)}
            players={players.filter(p=>p.discordId && p.discordId===me.id)}
            onRefetch={async ()=> { const data = await fetchPlayers(); setPlayers(data); }}
          />
        )}
      </div>
    </div>
  );
};

export default App;
