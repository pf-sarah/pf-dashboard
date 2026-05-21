'use client';
import { useState, useRef, useEffect } from "react";
import { getTeamMembers } from "@/lib/teamMembers";

interface TeamMemberSelectProps {
  value: string;
  onChange: (name: string) => void;
  location?: string;
  department?: string;
  placeholder?: string;
}

export function TeamMemberSelect({
  value,
  onChange,
  location,
  department,
  placeholder = "Search team members...",
}: TeamMemberSelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const members = getTeamMembers(location || undefined, department || undefined);
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (!members.find(m => m.name === query)) {
          setQuery(value);
        }
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [query, value, members]);

  const select = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
    setOpen(false);
  };

  const isDisabled = !location && !department;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#703C2E]/30 pr-8 disabled:bg-gray-50 disabled:text-gray-400"
          placeholder={isDisabled ? "Select location & department first" : placeholder}
          value={query}
          disabled={isDisabled}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(m => (
            <button
              key={m.name + m.department}
              onClick={() => select(m.name)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
            >
              <span className="text-gray-800">{m.name}</span>
              {(!location || !department) && (
                <span className="text-xs text-gray-400 capitalize">{m.department}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && filtered.length === 0 && query && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          No matches found
        </div>
      )}
    </div>
  );
}
