import React, { useState } from 'react';
import { Player, Role, Availability, TimeSlot } from '../types';
import { DAYS_OF_WEEK, ROLES, TIME_OPTIONS, US_TIMEZONES, WOW_CLASSES } from '../constants';
import { DateTime } from 'luxon';
import RoleSelector from './RoleSelector';

interface AvailabilityFormProps {
  onSubmit: (playerData: Omit<Player, 'id'>) => void;
  initial?: Omit<Player, 'id'> & { id?: string };
  onCancelEdit?: () => void;
}

const AvailabilityForm: React.FC<AvailabilityFormProps> = ({ onSubmit, initial, onCancelEdit }) => {
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [flexRole, setFlexRole] = useState<Role | ''>('');
  const [availability, setAvailability] = useState<Availability>({});
  const [notes, setNotes] = useState('');
  const [discordName, setDiscordName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const defaultTz = (Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/New_York';
  const [timezone, setTimezone] = useState<string>(defaultTz);
  // Coffee & Keys
  const [coffeeEnabled, setCoffeeEnabled] = useState<boolean>(false);
  const [coffeeSat, setCoffeeSat] = useState<boolean>(false);
  const [coffeeSun, setCoffeeSun] = useState<boolean>(false);
  const [coffeeTier, setCoffeeTier] = useState<'2-5' | '6-9' | '10+' | undefined>(undefined);
  const [wowClass, setWowClass] = useState<string>('');
  const [flexClass, setFlexClass] = useState<string>('');

  // Load initial data if editing
  React.useEffect(() => {
    if (initial) {
      setName(initial.name || '');
      setSelectedRoles(initial.roles || []);
      setAvailability(initial.availability || {} as Availability);
      setNotes(initial.notes || '');
      setTimezone(initial.timezone || defaultTz);
      setDiscordName(initial.discordName || '');
      if (initial.coffee) {
        setCoffeeEnabled(!!(initial.coffee.attendSat || initial.coffee.attendSun));
        setCoffeeSat(!!initial.coffee.attendSat);
        setCoffeeSun(!!initial.coffee.attendSun);
        setCoffeeTier(initial.coffee.keyTier as any);
      }
      setWowClass(initial.wowClass || '');
      setFlexRole((initial as any).flexRole || '');
      setFlexClass((initial as any).flexClass || '');
    }
  }, [initial]);

  const handleAddTimeSlot = (day: string) => {
    const newSlot: TimeSlot = { start: 1140, end: 1260 }; // Default to 7:00 PM - 9:00 PM
    const daySlots = availability[day] ? [...availability[day], newSlot] : [newSlot];
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleRemoveTimeSlot = (day: string, index: number) => {
    const daySlots = [...(availability[day] || [])];
    daySlots.splice(index, 1);
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleTimeChange = (day: string, index: number, type: 'start' | 'end', value: number) => {
    const daySlots = [...(availability[day] || [])];
    const slot = { ...daySlots[index] };
    slot[type] = value;
    
    if (type === 'end' && slot.start >= value) {
        slot.end = slot.start + 30;
    }
     if (type === 'start' && value >= slot.end) {
        slot.start = slot.end - 30;
    }

    daySlots[index] = slot;
    setAvailability({ ...availability, [day]: daySlots });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
        setError('Please enter your character name.');
        return;
    }
    if (!selectedRoles || selectedRoles.length === 0) {
        setError('Please select at least one role.');
        return;
    }
    const hasAvailability = !(Object.keys(availability).length === 0 || Object.values(availability).every(v => v.length === 0));
    if (!hasAvailability) {
      // Allow no availability if Coffee & Keys is selected with a day and tier
      if (!(coffeeEnabled && (coffeeSat || coffeeSun) && coffeeTier)) {
        setError('Please add at least one time slot — or use Coffee & Keys with day + key level.');
        return;
      }
    }
    setError(null);

    const coffee = coffeeEnabled ? {
      attendSat: coffeeSat || false,
      attendSun: coffeeSun || false,
      keyTier: coffeeTier,
    } : undefined;
    onSubmit({ name, roles: selectedRoles, availability, notes, timezone, discordName: discordName || undefined, coffee, wowClass: wowClass || undefined, flexRole: (flexRole || undefined) as any, flexClass: flexClass || undefined });
    setName('');
    setSelectedRoles([]);
    setAvailability({});
    setNotes('');
    setTimezone(defaultTz);
    setDiscordName('');
    setCoffeeEnabled(false);
    setCoffeeSat(false);
    setCoffeeSun(false);
    setCoffeeTier(undefined);
    setWowClass('');
    setFlexRole('');
    setFlexClass('');
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-2xl font-bold mb-4 text-yellow-300">Add Your Availability</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Character Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., Arthas"
          />
        </div>
        
        <div>
           <label className="block text-sm font-medium text-gray-300 mb-2">Role(s) You Can Play</label>
           <RoleSelector selectedRoles={selectedRoles} onToggleRole={(role)=>{
              setSelectedRoles(prev => prev.includes(role) ? prev.filter(r=>r!==role) : [...prev, role]);
           }} />
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-300 mb-1">Your Timezone</label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
          >
            {US_TIMEZONES.map(z => (
              <option key={z.id} value={z.id}>{z.label} — {z.id}</option>
            ))}
            {!US_TIMEZONES.find(z=>z.id===timezone) && (
              <option value={timezone}>{timezone}</option>
            )}
          </select>
        </div>

        <div>
          <label htmlFor="discord" className="block text-sm font-medium text-gray-300 mb-1">Discord Name (optional)</label>
          <input
            type="text"
            id="discord"
            value={discordName}
            onChange={(e) => setDiscordName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., YourName#1234 or @yourname"
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-300 mb-1">Notes (Optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white focus:ring-yellow-500 focus:border-yellow-500"
            placeholder="e.g., 483 Devastation Evoker, ilvl 483, KSH 2200, prefer keys 8-12"
            rows={2}
          />
        </div>

        <div className="border-t border-gray-700 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <input type="checkbox" checked={coffeeEnabled} onChange={(e)=> setCoffeeEnabled(e.target.checked)} />
            Coffee & Keys event
          </label>
          {coffeeEnabled && (
            <div className="space-y-3 pl-1">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-gray-300">
                  <input type="checkbox" checked={coffeeSat} onChange={(e)=> setCoffeeSat(e.target.checked)} />
                  <span>Saturday {formatNoonETInLocal(timezone)}</span>
                </label>
                <label className="flex items-center gap-2 text-gray-300">
                  <input type="checkbox" checked={coffeeSun} onChange={(e)=> setCoffeeSun(e.target.checked)} />
                  <span>Sunday {formatNoonETInLocal(timezone)}</span>
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-400">Preferred key level:</span>
                {(['2-5','6-9','10+'] as const).map(t => (
                  <button key={t} type="button" onClick={()=> setCoffeeTier(t)} className={`text-sm py-1 px-2 rounded-md border ${coffeeTier===t? 'bg-yellow-500 text-gray-900 border-yellow-400' : 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600'}`}>{t}</button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Class (for admin info)</label>
                <select value={wowClass} onChange={(e)=> setWowClass(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white">
                  <option value="">Select class (optional)</option>
                  {WOW_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Flex Role (optional)</label>
                  <select value={flexRole as any} onChange={(e)=> setFlexRole((e.target.value || '') as any)} className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white">
                    <option value="">None</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Flex Class (optional)</label>
                  <select value={flexClass} onChange={(e)=> setFlexClass(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-white">
                    <option value="">None</option>
                    {WOW_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {!coffeeEnabled && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Weekly Availability (in your timezone)</label>
            <div className="space-y-4">
              {DAYS_OF_WEEK.map(day => (
                <div key={day}>
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-200">{day}</h3>
                    <button type="button" onClick={() => handleAddTimeSlot(day)} className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded-md transition-colors">
                      + Add Slot
                    </button>
                  </div>
                  {availability[day] && availability[day].map((slot, index) => (
                    <div key={index} className="mt-2 p-3 bg-gray-700/50 rounded-md flex items-center space-x-2">
                      <select value={slot.start} onChange={(e) => handleTimeChange(day, index, 'start', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-white text-sm">
                        {TIME_OPTIONS.map(opt => <option key={`start-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <span className="text-gray-400">-</span>
                      <select value={slot.end} onChange={(e) => handleTimeChange(day, index, 'end', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-white text-sm">
                        {TIME_OPTIONS.map(opt => <option key={`end-${opt.value}`} value={opt.value}>{opt.label}</option>)}
                      </select>
                      <button type="button" onClick={() => handleRemoveTimeSlot(day, index)} className="text-red-400 hover:text-red-300 font-bold text-xl">&times;</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-4 rounded-md transition-colors text-lg">
            {initial ? 'Update Availability' : 'Submit Availability'}
          </button>
          {initial && onCancelEdit && (
            <button type="button" onClick={onCancelEdit} className="px-4 py-3 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold">Cancel</button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AvailabilityForm;

function formatNoonETInLocal(localTz: string): string {
  try {
    const dtET = DateTime.now().setZone('America/New_York').set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
    const local = dtET.setZone(localTz);
    return `${local.toFormat('h:mm a')} (${local.offsetNameShort})`;
  } catch {
    return '12:00 PM ET';
  }
}
