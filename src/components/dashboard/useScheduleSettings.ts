'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DesignerRoster {
  [designerId: string]: {
    ratio:        number;
    payType:      'hourly' | 'salary';
    hourlyRate:   number;
    annualSalary: number;
    name:         string;
  };
}

export interface PresSettings {
  dayPcts: number[];   // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  utPct:   number;
  gaPct:   number;
  unkPct:  number;
  dateFrom?: string;
  dateTo?:   string;
}

export interface TeamRoster {
  [memberId: string]: {
    ratio: number;
    rate:  number;
    name:  string;
  };
}

// hours[memberId][weekOrDayIndex] = hours
export type HoursMap = Record<string, number[]>;

export interface ScheduleSettings {
  // Design
  designHours:   HoursMap;    // 52 weeks
  designRoster:  DesignerRoster;
  // Preservation
  presHours:     HoursMap;    // 7 days
  presRoster:    TeamRoster;
  presSettings:  PresSettings;
  // Fulfillment
  ffHours:       HoursMap;    // 8 weeks
  ffRoster:      TeamRoster;
  // Global
  avgIntake:       number;
  weeklyEstimates: Record<string, number>;  // ISO monday → bouquet count
}

const DEFAULTS: ScheduleSettings = {
  designHours:     {},
  designRoster:    {},
  presHours:       {},
  presRoster:      {},
  presSettings:    { dayPcts: [10,30,20,15,5,15,5], utPct: 50, gaPct: 40, unkPct: 10 },
  ffHours:         {},
  ffRoster:        {},
  avgIntake:       45,
  weeklyEstimates: {},
};

const KEYS: (keyof ScheduleSettings)[] = [
  'designHours', 'designRoster',
  'presHours', 'presRoster', 'presSettings',
  'ffHours', 'ffRoster',
  'avgIntake', 'weeklyEstimates',
];

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useScheduleSettings(location: 'Utah' | 'Georgia') {
  const [settings,  setSettings]  = useState<ScheduleSettings>(DEFAULTS);
  const [loading,   setLoading]   = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Debounce timers per key
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load all settings for this location ──────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`/api/schedule-settings?location=${location}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        setSettings(prev => {
          const next = { ...prev };
          KEYS.forEach(k => {
            if (data[k] !== undefined) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (next as any)[k] = data[k];
            }
          });
          return next;
        });
      })
      .catch(() => {/* keep defaults */})
      .finally(() => setLoading(false));
  }, [location]);

  // ── Save a single key with debounce ──────────────────────────────────────
  const save = useCallback((key: keyof ScheduleSettings, value: unknown) => {
    // Clear existing timer for this key
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
    }, 500); // 500ms debounce
  }, [location]);

  // ── Update helper — updates state and triggers debounced save ────────────
  const update = useCallback(<K extends keyof ScheduleSettings>(
    key: K,
    value: ScheduleSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    save(key, value);
  }, [save]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  return { settings, loading, saveState, update };
}
