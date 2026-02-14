import { useEffect } from 'react';
import { useHistoryStore } from '@/stores/history-store';

export function useExecutionStatus(runId: string | null) {
    const fetchRunDetails = useHistoryStore((state) => state.fetchRunDetails);
    const clearActiveRunId = useHistoryStore((state) => state.clearActiveRunId);

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

            if (run.status !== 'RUNNING') {
                window.clearInterval(interval);
                clearActiveRunId();
            }
        }, 2000);

        return () => {
            disposed = true;
            window.clearInterval(interval);
        };
    }, [runId, fetchRunDetails, clearActiveRunId]);
}
