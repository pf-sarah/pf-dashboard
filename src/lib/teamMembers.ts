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

export const DESIGNER_IDS: Record<string, string> = {
  // Utah Design
  'Jennika Merrill':       'ut-mgr',
  'Deanna Haug':           'ut-1',
  'Kathryn Sonntag':       'ut-3',
  'Mia Legas Boots':       'ut-4',
  'Sloane James':          'ut-5',
  'Audrey Windsor':        'ut-6',
  'Chloe Jensen':          'ut-7',
  // Georgia Design
  'Katherine Piper':       'ga-1',
  'Allanna Harlan':        'ga-2',
  'Erin Webb':             'ga-3',
  'Rachel Tucker':         'ga-4',
  'Celt Stewart':          'ga-5',
  // Utah Preservation
  'Katelyn Wilson':        'ut-p1',
  'Emma Dunakey':          'ut-p2',
  'Preslee Peterson':      'ut-p7',
  // Georgia Preservation
  'Amber Garrett':         'ga-p1',
  // Utah Fulfillment
  'Bella DePrima':         'ut-f1',
  'Warner Neuenschwander': 'ut-f2',
  'Owen Shaw':             'ut-f3',
  'Emma Van Dyke':         'ut-f4',
  // Georgia Fulfillment
  'Yann Jean-Louis':       'ga-f1',
  'Nahid Knight':          'ga-f2',
  'Shantel Phifer':        'ga-f3',
};

export function getTeamMembers(location?: string, department?: string): TeamMember[] {
  return TEAM_MEMBERS.filter(m => {
    if (location && m.location !== location) return false;
    if (department && m.department !== department) return false;
    return true;
  });
}
