export interface PipelineCount {
  status: string;
  location: string;
  count: number;
}

export interface WeeklyReportItem {
  orderNumber: number;
  shopifyOrderNumber?: number;
  location: string;
  status: string;
  eventDate: string;
  originalOrderDate: string;
}

export interface SearchItem {
  orderNumber?: number;
  shopifyOrderNumber?: number;
  frameValetKey?: string;
  assignedToUserFirstName?: string;
  assignedToUserLastName?: string;
  assignedToUserUuid?: string;
  status?: string;
}

export interface SearchResponse {
  items: SearchItem[];
  totalItems?: number;
  total?: number;
}

export interface DesignerFrameData {
  designers: {
    name: string;
    weeks: number[];
    total: number;
    ordersByWeek: string[][];
  }[];
  weekKeys: string[];
}

export interface FrameSnapshot {
  id?: number;
  snapshot_date: string;
  counts: Record<string, number>;
  created_at?: string;
}

export interface LastWeekFrameCounts {
  pending: boolean;
  snapCount?: number;
  latestDate?: string;
  prevDate?: string;
  delta?: Record<string, number>;
}

export interface DashboardConfig {
  design_anchor_week: string | null;
}
