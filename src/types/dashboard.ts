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
  orderUuid?: string;
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
    otherCount: number;
    total: number;
    ordersByWeek: string[][];
    otherOrders: string[];
  }[];
  weekKeys: string[];
  orderUuidMap: Record<string, string>; // orderNumber → orderUuid
}

export interface ConversationMessage {
  uuid: string;
  messageText: string;
  userUuid: string;
  userFirstName: string;
  userLastName: string;
  dateCreated: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface ConversationUser {
  userUuid: string;
  userFirstName: string;
  userLastName: string;
  role?: string;
}

export interface ResponseTimeResult {
  byDesigner: Record<string, { avgMinutes: number; sampleSize: number }>;
  overall: { avgMinutes: number; sampleSize: number };
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
