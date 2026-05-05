'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DesignerRoster {
  [designerId: string]: {
    ratio: number; payType: 'hourly' | 'salary';
    hourlyRate: number; annualSalary: number; name: string;
    isManager?: boolean;
    role?: 'specialist' | 'senior' | 'master';
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
  [memberId: string]: { ratio: number; rate: number; name: string; payType?: 'hourly'|'salary'; annualSalary?: number; isManager?: boolean; role?: 'specialist'|'senior'|'master' };
}

export type HoursMap = Record<string, number[]>;

// personId → { defaultHours, overrides: { isoDate → hours } }
export interface MasterAvailability {
  [personId: string]: { defaultHours: number; overrides: Record<string, number> };
}

// A flex/on-call row added to a dept schedule
export interface FlexRow {
  id:         string;   // unique row id
  personId:   string;   // matches team member id
  personName: string;
  homeDept:   'design' | 'preservation' | 'fulfillment' | 'oncall';
  hours:      number[]; // parallel to dept schedule length
}

export interface ScheduleSettings {
  designHours:        HoursMap;
  designRoster:       DesignerRoster;
  presHours:          HoursMap;
  presRoster:         TeamRoster;
  presSettings:       PresSettings;
  ffHours:            HoursMap;
  ffRoster:           TeamRoster;
  masterAvailability: MasterAvailability;
  flexRows:           Record<string, FlexRow[]>;
  avgIntake:          number;
  weeklyEstimates:    Record<string, { ut: number; ga: number }>;
  // Manager total hours (production + managerial) — parallel to dept hours maps
  mgrTotalHours:      HoursMap;
}

const DEFAULTS: ScheduleSettings = {
  designHours: {}, designRoster: {},
  presHours: {}, presRoster: {},
  presSettings: { weekOverrides: {} },
  ffHours: {}, ffRoster: {},
  masterAvailability: {},
  flexRows: {},
  avgIntake: 45,
  weeklyEstimates: {},
  mgrTotalHours: {},
};

const KEYS: (keyof ScheduleSettings)[] = [
  'designHours','designRoster','presHours','presRoster','presSettings',
  'ffHours','ffRoster','masterAvailability','flexRows','avgIntake','weeklyEstimates',
  'mgrTotalHours',
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
