export type MonitoringView = "live" | "logs";
export type CallDirectionFilter = "ALL" | "INBOUND" | "OUTBOUND" | "INTERNAL";
export type CallStatusFilter = "ALL" | "COMPLETED" | "MISSED" | "RECORDED";

export const callDirectionFilters = ["ALL", "INBOUND", "OUTBOUND", "INTERNAL"] as const;
export const callStatusFilters = ["ALL", "COMPLETED", "MISSED", "RECORDED"] as const;
export const callLogPageSizeOptions = [10, 25, 50] as const;
export const defaultCallLogPageSize = 25;

export type CallLogEntry = {
  id: string;
  direction: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  fromIdentity: string | null;
  toIdentity: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  durationSeconds: number | null;
  startedAt: string;
  recordingSid: string | null;
  recordingUrl: string | null;
  playbackUrl: string | null;
  transcriptStatus: string | null;
  aiAnalysisStatus: string | null;
  failureInsight: {
    title: string;
    detail: string;
    nextAction: string;
  } | null;
  summary: string | null;
  transcript: string | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
  } | null;
  opportunity: {
    title: string;
  } | null;
  user: {
    name: string;
  } | null;
};

export type CallLogPage = {
  calls: CallLogEntry[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor: string | null;
  selectedCall: CallLogEntry | null;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};
