'use client';

import { useState, useEffect } from 'react';

// ── Types (mirrors API response) ──────────────────────────────────────────────

export interface WeekStats {
  approvals:       number;
  disapprovals:    number;
  disapprovalRate: number | null;
  comments:        string[];
}

export interface MonthStats {
  approvals:       number;
  disapprovals:    number;
  disapprovalRate: number | null;
  comments:        string[];
}

export interface DesignerStats {
  weekly:             Record<string, WeekStats>;
  monthly:            Record<string, MonthStats>;
  ytdApprovals:       number;
  ytdDisapprovals:    number;
  ytdDisapprovalRate: number | null;
  allComments:        string[];
  location:           string | null;
  isActive:           boolean;
}

export interface DisapprovalStatsData {
  designers: Record<string, DesignerStats>;
  weeks:     string[];
  months:    string[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDisapprovalStats(location: 'Utah' | 'Georgia' | 'all' = 'all') {
  const [data,    setData]    = useState<DisapprovalStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/disapproval-stats?location=${location}&weeks=52`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DisapprovalStatsData>;
      })
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });

    return () => { cancelled = true; };
  }, [location]);

  return { data, loading, error };
}
