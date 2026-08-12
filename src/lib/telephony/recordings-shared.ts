export type RecordingFilter = "ALL" | "INBOUND" | "OUTBOUND" | "READY" | "NEEDS_TRANSCRIPT";

export const recordingFilters: Array<{ label: string; value: RecordingFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Inbound", value: "INBOUND" },
  { label: "Outbound", value: "OUTBOUND" },
  { label: "Ready", value: "READY" },
  { label: "Needs transcript", value: "NEEDS_TRANSCRIPT" },
];

export const recordingPageSizeOptions = [10, 25, 50] as const;
export const defaultRecordingPageSize = 10;

export type RecordingEntry = {
  id: string;
  direction: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  fromIdentity: string | null;
  toIdentity: string | null;
  callSid: string | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  recordingConsent: string;
  durationSeconds: number | null;
  startedAt: string | null;
  playbackUrl: string | null;
  transcriptStatus: string | null;
  aiAnalysisStatus: string | null;
  summary: string | null;
  transcript: string | null;
  transcriptError: string | null;
  user: { name: string } | null;
  contact: { firstName: string | null; lastName: string | null } | null;
  opportunity: { title: string } | null;
};

export type RecordingPageSummary = {
  aiReadyCount: number;
  averageDurationSeconds: number;
  recordingCount: number;
  transcriptReadyCount: number;
};

export type RecordingPage = {
  calls: RecordingEntry[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor: string | null;
  page: number;
  pageSize: number;
  summary: RecordingPageSummary;
  totalCount: number;
  totalPages: number;
};
