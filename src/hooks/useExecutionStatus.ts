import { useEffect } from 'react';
import { useHistoryStore } from '@/stores/history-store';
import { useWorkflowStore } from '@/stores/workflow-store';

export function useExecutionStatus(runId: string | null) {
    const fetchRunDetails = useHistoryStore((state) => state.fetchRunDetails);
    const clearActiveRunId = useHistoryStore((state) => state.clearActiveRunId);
    const applyNodeRunOutputs = useWorkflowStore((state) => state.applyNodeRunOutputs);

    useEffect(() => {
        if (!runId) {
            return;
        }

        let disposed = false;
        const interval = window.setInterval(async () => {
            const run = await fetchRunDetails(runId);
            if (!run || disposed) {
                return;
            }

            applyNodeRunOutputs(run.nodeRuns ?? []);

            if (run.status !== 'RUNNING') {
                window.clearInterval(interval);
                clearActiveRunId();
            }
        }, 2000);

        return () => {
            disposed = true;
            window.clearInterval(interval);
        };
    }, [runId, fetchRunDetails, clearActiveRunId, applyNodeRunOutputs]);
}
