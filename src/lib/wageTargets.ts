import type { RatioTier } from './ratioTargets';

// Official pay-structure targets per location + department + role tier
// ("Production Team - Utah/Georgia, Pay Structure Review" spreadsheets).
// Fixed policy numbers, not derived from any individual's actual pay — real
// people can be paid above or below their tier's rate (raises, negotiation,
// management premium), so those are outliers relative to this table, not
// inputs to it. Used by /api/kpis to project Expected/Goal CPO.
//
// Managers are intentionally excluded from this table — their pay reflects
// management responsibility, not a production tier, so their Expected/Goal
// cost always falls back to their own actual pay (see isManager handling in
// route.ts).

export type WageLocation = 'Utah' | 'Georgia';
export type WageDept     = 'Design' | 'Preservation' | 'Fulfillment';

export const WAGE_TARGETS: Record<WageLocation, Record<WageDept, Record<RatioTier, number>>> = {
  Utah: {
    Preservation: { specialist: 16.50, senior: 17.50, master: 18.50 },
    Design:       { specialist: 16.50, senior: 17.50, master: 18.50 },
    Fulfillment:  { specialist: 15.00, senior: 16.00, master: 17.00 },
  },
  Georgia: {
    Preservation: { specialist: 16.50, senior: 17.50, master: 18.50 },
    Design:       { specialist: 16.50, senior: 18.50, master: 19.50 },
    Fulfillment:  { specialist: 16.50, senior: 17.50, master: 18.50 },
  },
};
