// Single source of truth for all team member names
// Used by invite form to prevent typo mismatches with schedule system

export interface TeamMember {
  name: string;
  location: 'Utah' | 'Georgia';
  department: 'design' | 'preservation' | 'fulfillment';
}

export const TEAM_MEMBERS: TeamMember[] = [
  // Utah Design
  { name: 'Jennika Merrill',       location: 'Utah',    department: 'design' },
  { name: 'Deanna Haug',           location: 'Utah',    department: 'design' },
  { name: 'Kathryn Sonntag',       location: 'Utah',    department: 'design' },
  { name: 'Mia Legas Boots',       location: 'Utah',    department: 'design' },
  { name: 'Sloane James',          location: 'Utah',    department: 'design' },
  { name: 'Audrey Windsor',        location: 'Utah',    department: 'design' },
  { name: 'Chloe Jensen',          location: 'Utah',    department: 'design' },
  // Utah Preservation
  { name: 'Katelyn Wilson',        location: 'Utah',    department: 'preservation' },
  { name: 'Emma Dunakey',          location: 'Utah',    department: 'preservation' },
  { name: 'Preslee Peterson',      location: 'Utah',    department: 'preservation' },
  // Utah Fulfillment
  { name: 'Bella DePrima',         location: 'Utah',    department: 'fulfillment' },
  { name: 'Warner Neuenschwander', location: 'Utah',    department: 'fulfillment' },
  { name: 'Owen Shaw',             location: 'Utah',    department: 'fulfillment' },
  { name: 'Emma Van Dyke',         location: 'Utah',    department: 'fulfillment' },
  // Georgia Design
  { name: 'Katherine Piper',       location: 'Georgia', department: 'design' },
  { name: 'Allanna Harlan',        location: 'Georgia', department: 'design' },
  { name: 'Erin Webb',             location: 'Georgia', department: 'design' },
  { name: 'Rachel Tucker',         location: 'Georgia', department: 'design' },
  { name: 'Celt Stewart',          location: 'Georgia', department: 'design' },
  // Georgia Preservation
  { name: 'Amber Garrett',         location: 'Georgia', department: 'preservation' },
  { name: 'Celt Stewart',          location: 'Georgia', department: 'preservation' },
  // Georgia Fulfillment
  { name: 'Yann Jean-Louis',       location: 'Georgia', department: 'fulfillment' },
  { name: 'Nahid Knight',          location: 'Georgia', department: 'fulfillment' },
  { name: 'Shantel Phifer',        location: 'Georgia', department: 'fulfillment' },
];

export function getTeamMembers(location?: string, department?: string): TeamMember[] {
  return TEAM_MEMBERS.filter(m => {
    if (location && m.location !== location) return false;
    if (department && m.department !== department) return false;
    return true;
  });
}
