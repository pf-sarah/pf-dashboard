'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DesignerRoster {
  [designerId: string]: {
    ratio: number; payType: 'hourly' | 'salary';
    hourlyRate: number; annualSalary: number; name: string;
    isManager?: boolean;
    role?: 'specialist' | 'senior' | 'master';
    // Soft-delete flag: excludes this member from the active roster (schedule
    // grid, future editing) while keeping their historical scheduled hours
    // intact for past-period goal/CPO calculations.
    _removed?: boolean;
  };
}

export interface PresSettings {
  dateFrom?: string;
  dateTo?:   string;
  dayPcts?:  number[];
  utPct?:    number;
  gaPct?:    number;
  unkPct?:   number;
  // Per-week manual overrides: weekOf ISO → { ut, ga }
  weekOverrides?: Record<string, { ut: number; ga: number }>;
}

export interface TeamRoster {
  [memberId: string]: { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number; isManager?: boolean; role?: 'specialist'|'senior'|'master'; _removed?: boolean };
}

// memberId → { isoMonday → hours }. Week-of-year is anchored to a calendar
// date, not an integer offset, so entries never silently drift as time passes.
export type WeeklyHoursMap = Record<string, Record<string, number>>;

// "${isoMonday}-${memberId}" → daily hours array (parallel to the visible
// week's weekdays). The date component of the key is the Monday of the week
// this daily breakdown belongs to.
export type DailyHoursMap = Record<string, number[]>;

// personId → { defaultHours, overrides: { isoDate → hours }, workDays }
// workDays: weekday indices (0=Mon..6=Sun) this person normally works.
// Defaults to Mon-Fri ([0,1,2,3,4]) when unset, for people who don't have a
// standard 5-day week.
export interface MasterAvailability {
  [personId: string]: { defaultHours: number; overrides: Record<string, number>; workDays?: number[] };
}

export interface ScheduleSettings {
  designHours:        WeeklyHoursMap;
  designRoster:       DesignerRoster;
  presHours:          WeeklyHoursMap;
  presRoster:         TeamRoster;
  presSettings:       PresSettings;
  ffHours:            WeeklyHoursMap;
  ffRoster:           TeamRoster;
  masterAvailability: MasterAvailability;
  avgIntake:          number;
  weeklyEstimates:    Record<string, { ut: number; ga: number }>;
  // Per-week multiplier applied to same-week-last-year intake to auto-project
  // future "bouquets received" when no manual weeklyEstimates override exists.
  weeklyMultipliers:  Record<string, { ut: number; ga: number }>;
  // Manager total hours (production + managerial) — parallel to dept hours maps
  mgrTotalHours:      WeeklyHoursMap;
  mgrTotalDailyHours: DailyHoursMap;
  designDailyHours:   DailyHoursMap;
  presDailyHours:     DailyHoursMap;
  presCheckHours:     DailyHoursMap;
  ffDailyHours:       DailyHoursMap;
  // Resin scheduling
  resinRoster:        unknown;
  resinHours:         Record<string, Record<string, number>>;
  resinDailyHours:    DailyHoursMap;
}

const DEFAULTS: ScheduleSettings = {
  designHours: {}, designRoster: {},
  presHours: {}, presRoster: {},
  presSettings: { weekOverrides: {} },
  ffHours: {}, ffRoster: {},
  masterAvailability: {},
  avgIntake: 45,
  weeklyEstimates: {},
  weeklyMultipliers: {},
  mgrTotalHours: {},
  mgrTotalDailyHours: {},
  designDailyHours: {},
  presDailyHours: {},
  presCheckHours: {},
  ffDailyHours: {},
  resinRoster: null,
  resinHours: {},
  resinDailyHours: {},
};

const KEYS: (keyof ScheduleSettings)[] = [
  'designHours','designRoster','presHours','presRoster','presSettings',
  'ffHours','ffRoster','masterAvailability','avgIntake','weeklyEstimates','weeklyMultipliers',
  'mgrTotalHours','mgrTotalDailyHours','designDailyHours','ffDailyHours','presDailyHours','presCheckHours',
  'resinRoster','resinHours','resinDailyHours',
];

export function useScheduleSettings(location: 'Utah' | 'Georgia') {
  const [settings,  setSettings]  = useState<ScheduleSettings>(DEFAULTS);
  const [loading,   setLoading]   = useState(true);
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    setLoading(true);
    fetch(`/api/schedule-settings?location=${location}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        setSettings(prev => {
          const next = { ...prev };
          KEYS.forEach(k => {
            if (data[k] !== undefined) (next as Record<string, unknown>)[k] = data[k];
          });
          // Migrate weeklyEstimates from flat number to {ut, ga} shape
          if (next.weeklyEstimates) {
            const migrated: Record<string, { ut: number; ga: number }> = {};
            Object.entries(next.weeklyEstimates).forEach(([week, val]) => {
              if (typeof val === 'number') {
                migrated[week] = { ut: val, ga: 0 };
              } else {
                migrated[week] = val as { ut: number; ga: number };
              }
            });
            next.weeklyEstimates = migrated;
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  const save = useCallback((key: keyof ScheduleSettings, value: unknown) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await fetch('/api/schedule-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location, key, value }),
        });
        if (!res.ok) throw new Error('Save failed');
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch {
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 3000);
      }
    }, 500);
  }, [location]);

  const update = useCallback(<K extends keyof ScheduleSettings>(key: K, value: ScheduleSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    save(key, value);
  }, [save]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  return { settings, loading, saveState, update };
}

// Paid holidays: one shared calendar for both locations (staff are paid but
// produce nothing that day), stored under a location-agnostic 'Global' row
// so it applies regardless of which location/department is being viewed.
export function usePaidHolidays() {
  const [holidays, setHolidays] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');

  useEffect(() => {
    setLoading(true);
    fetch('/api/schedule-settings?location=Global')
      .then(r => r.json())
      .then((data: { paidHolidays?: string[] }) => setHolidays(data.paidHolidays ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: string[]) => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/schedule-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'Global', key: 'paidHolidays', value: next }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, []);

  const addHoliday = useCallback((isoDateStr: string) => {
    setHolidays(prev => {
      if (prev.includes(isoDateStr)) return prev;
      const next = [...prev, isoDateStr].sort();
      persist(next);
      return next;
    });
  }, [persist]);

  const removeHoliday = useCallback((isoDateStr: string) => {
    setHolidays(prev => {
      const next = prev.filter(d => d !== isoDateStr);
      persist(next);
      return next;
    });
  }, [persist]);

  return { holidays, loading, saveState, addHoliday, removeHoliday };
}

// Per-person time off (PTO/OOO): personId → ISO dates. Staff ids are already
// globally unique (ut-*/ga-*), so like paidHolidays this is stored under a
// single location-agnostic 'Global' row rather than duplicated per location.
export function usePersonTimeOff() {
  const [timeOff, setTimeOff] = useState<Record<string, string[]>>({});
  const [loading,  setLoading]  = useState(true);
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');

  useEffect(() => {
    setLoading(true);
    fetch('/api/schedule-settings?location=Global')
      .then(r => r.json())
      .then((data: { personTimeOff?: Record<string, string[]> }) => setTimeOff(data.personTimeOff ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: Record<string, string[]>) => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/schedule-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: 'Global', key: 'personTimeOff', value: next }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, []);

  const addTimeOff = useCallback((personId: string, isoDateStr: string) => {
    setTimeOff(prev => {
      const existing = prev[personId] ?? [];
      if (existing.includes(isoDateStr)) return prev;
      const next = { ...prev, [personId]: [...existing, isoDateStr].sort() };
      persist(next);
      return next;
    });
  }, [persist]);

  const removeTimeOff = useCallback((personId: string, isoDateStr: string) => {
    setTimeOff(prev => {
      const next = { ...prev, [personId]: (prev[personId] ?? []).filter(d => d !== isoDateStr) };
      persist(next);
      return next;
    });
  }, [persist]);

  return { timeOff, loading, saveState, addTimeOff, removeTimeOff };
}
