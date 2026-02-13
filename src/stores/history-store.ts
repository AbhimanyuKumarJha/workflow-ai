import { create } from 'zustand';

export interface NodeRunRecord {
    id: string;
    nodeId: string;
    nodeType: string;
    status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    inputs: Record<string, unknown> | null;
    outputs: Record<string, unknown> | null;
    errorMessage: string | null;
    errorDetails: Record<string, unknown> | null;
    taskName: string | null;
    triggerRunId: string | null;
}

export interface WorkflowRunRecord {
    id: string;
    workflowId: string;
    workflowVersionId: string;
    userId: string;
    runNumber: number;
    scope: 'FULL' | 'SELECTED' | 'SINGLE';
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    selectedNodeIds: string[];
    errorSummary: string | null;
    nodeRuns: NodeRunRecord[];
}

interface HistoryState {
    runs: WorkflowRunRecord[];
    selectedRunId: string | null;
    activeRunId: string | null;
    loading: boolean;
    error: string | null;

    fetchHistory: (workflowId: string, limit?: number) => Promise<void>;
    fetchRunDetails: (runId: string) => Promise<WorkflowRunRecord | null>;
    addRun: (run: WorkflowRunRecord) => void;
    clearRuns: () => void;

    setSelectedRunId: (runId: string | null) => void;
    setActiveRunId: (runId: string | null) => void;
    clearActiveRunId: () => void;
}

function upsertRun(runs: WorkflowRunRecord[], nextRun: WorkflowRunRecord): WorkflowRunRecord[] {
    const existingIndex = runs.findIndex((run) => run.id === nextRun.id);
    if (existingIndex === -1) {
        return [nextRun, ...runs].sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
    }

    const clone = [...runs];
    clone[existingIndex] = nextRun;
    return clone.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export const useHistoryStore = create<HistoryState>((set) => ({
    runs: [],
    selectedRunId: null,
    activeRunId: null,
    loading: false,
    error: null,

    fetchHistory: async (workflowId, limit = 30) => {
        set({ loading: true, error: null });
        try {
            const params = new URLSearchParams({
                workflowId,
                limit: String(limit),
            });

            const response = await fetch(`/api/history?${params.toString()}`);
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(payload?.error ?? 'Failed to fetch history');
            }

            const data = (await response.json()) as { runs?: WorkflowRunRecord[] };
            set({
                runs: data.runs ?? [],
                loading: false,
                error: null,
            });
        } catch (error) {
            set({
                loading: false,
                error: error instanceof Error ? error.message : 'Failed to fetch history',
            });
        }
    },

    fetchRunDetails: async (runId) => {
        try {
            const response = await fetch(`/api/history?runId=${runId}`);
            if (!response.ok) {
                return null;
            }

            const data = (await response.json()) as { run?: WorkflowRunRecord };
            if (!data.run) {
                return null;
            }

            set((state) => ({
                runs: upsertRun(state.runs, data.run as WorkflowRunRecord),
            }));

            return data.run as WorkflowRunRecord;
        } catch {
            return null;
        }
    },

    addRun: (run) => {
        set((state) => ({
            runs: upsertRun(state.runs, run),
        }));
    },

    clearRuns: () => {
        set({
            runs: [],
            selectedRunId: null,
            activeRunId: null,
            error: null,
        });
    },

    setSelectedRunId: (runId) => {
        set({ selectedRunId: runId });
    },

    setActiveRunId: (runId) => {
        set({ activeRunId: runId });
    },

    clearActiveRunId: () => {
        set({ activeRunId: null });
    },
}));
