import { create } from "zustand";

// M3 log system — replicates eops-desktop useApiActivityStore (requestCount +
// capped log ring) and adds the debug-panel open flag. Runs in the browser, so
// Date.now() is fine here. The aopsApi client calls beginRequest/endRequest
// around every request (single choke point: requestResult).

export const MAX_API_ACTIVITY_LOGS = 200;

export type ApiLogLevel = "info" | "warn" | "error";

export interface ApiActivityLog {
  id: string;
  ts: number;
  kind: string;
  level: ApiLogLevel;
  message: string;
  data: Record<string, unknown>;
}

export interface ApiActivityLogInput {
  id?: string;
  ts?: number;
  kind?: string;
  level?: ApiLogLevel;
  message?: string;
  data?: Record<string, unknown>;
}

interface ApiActivityState {
  requestCount: number;
  logs: ApiActivityLog[];
  debugOpen: boolean;
  beginRequest: () => void;
  endRequest: (entry?: ApiActivityLogInput) => void;
  addLog: (entry: ApiActivityLogInput) => void;
  clearLogs: () => void;
  reset: () => void;
  toggleDebug: () => void;
  setDebugOpen: (open: boolean) => void;
}

let logSequence = 0;

function createActivityLog(entry?: ApiActivityLogInput): ApiActivityLog | null {
  if (!entry || typeof entry !== "object") return null;
  logSequence += 1;
  return {
    id: entry.id ?? `api-log-${logSequence}`,
    ts: typeof entry.ts === "number" ? entry.ts : Date.now(),
    kind: entry.kind ?? "api",
    level: entry.level ?? "info",
    message: entry.message ?? "",
    data: entry.data && typeof entry.data === "object" ? entry.data : {}
  };
}

function appendActivityLog(logs: ApiActivityLog[], entry?: ApiActivityLogInput): ApiActivityLog[] {
  const record = createActivityLog(entry);
  if (!record) return logs;
  return [...logs, record].slice(-MAX_API_ACTIVITY_LOGS);
}

export const useApiActivityStore = create<ApiActivityState>((set) => ({
  requestCount: 0,
  logs: [],
  debugOpen: false,
  beginRequest: () => set((state) => ({ requestCount: state.requestCount + 1 })),
  endRequest: (entry) =>
    set((state) => ({
      requestCount: Math.max(0, state.requestCount - 1),
      logs: appendActivityLog(state.logs, entry)
    })),
  addLog: (entry) => set((state) => ({ logs: appendActivityLog(state.logs, entry) })),
  clearLogs: () => set({ logs: [] }),
  reset: () => set({ requestCount: 0, logs: [] }),
  toggleDebug: () => set((state) => ({ debugOpen: !state.debugOpen })),
  setDebugOpen: (open) => set({ debugOpen: open })
}));

/** Issues = warn/error level logs (used for the footer + debug-panel stats). */
export function apiActivityIssueCount(logs: ApiActivityLog[]): number {
  return logs.filter((log) => log.level === "warn" || log.level === "error").length;
}
