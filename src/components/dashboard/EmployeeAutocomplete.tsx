'use client';

import { useState, useEffect, useRef } from 'react';

export interface RipplingEmployee {
  full_name:     string;
  location:      string;
  department:    string;
  title:         string;
  role:          'specialist' | 'senior' | 'master';
  pay_type:      'hourly' | 'salary';
  hourly_rate:   number;
  annual_salary: number;
}

interface Props {
  value:       string;
  location:    string;
  department:  string;
  onChange:    (name: string) => void;
  onSelect:    (employee: RipplingEmployee) => void;
  placeholder?: string;
  className?:  string;
}

export function EmployeeAutocomplete({ value, location, department, onChange, onSelect, placeholder, className }: Props) {
  const [query,       setQuery]       = useState(value);
  const [suggestions, setSuggestions] = useState<RipplingEmployee[]>([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 1) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ search: val });
        if (location)   params.set('location', location);
        // Search across all departments so flex workers can be added anywhere
        const res  = await fetch(`/api/admin/employees-upload?${params}`);
        const data = await res.json() as { employees?: RipplingEmployee[] };
        setSuggestions(data.employees ?? []);
        setOpen(true);
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 200);
  }

  function handleSelect(emp: RipplingEmployee) {
    setQuery(emp.full_name);
    setSuggestions([]);
    setOpen(false);
    // Cancel any pending debounced onChange to avoid partial name overwriting the selection
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSelect(emp);
  }

  function roleLabel(role: string) {
    if (role === 'master') return 'Master';
    if (role === 'senior') return 'Senior';
    return 'Specialist';
  }

  function roleColor(role: string) {
    if (role === 'master') return 'text-indigo-600 bg-indigo-50';
    if (role === 'senior') return 'text-slate-600 bg-slate-100';
    return 'text-slate-500 bg-slate-50';
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => query.length >= 1 && suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder ?? 'Type a name…'}
        className={className ?? 'w-full border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300'}
      />
      {loading && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">…</span>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(emp => (
            <button
              key={`${emp.full_name}-${emp.department}`}
              type="button"
              onClick={() => handleSelect(emp)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{emp.full_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleColor(emp.role)}`}>
                  {roleLabel(emp.role)}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{emp.title}</div>
            </button>
          ))}
          {suggestions.length === 0 && !loading && query.length >= 2 && (
            <div className="px-3 py-2 text-xs text-slate-400">No matches in {location}</div>
          )}
        </div>
      )}
      {open && suggestions.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs text-slate-400">
          No matches in {location}
        </div>
      )}
    </div>
  );
}
