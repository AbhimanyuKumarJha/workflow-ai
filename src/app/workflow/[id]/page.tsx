'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { WorkflowCanvas } from '@/components/canvas/WorkflowCanvas';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { useHistoryStore } from '@/stores/history-store';
import { useExecutionStatus } from '@/hooks/useExecutionStatus';

export default function WorkflowEditorPage() {
    const params = useParams<{ id: string }>();
    const routeId = params?.id as string;

    const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
    const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow);

    const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);

    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const clearRuns = useHistoryStore((state) => state.clearRuns);
    const activeRunId = useHistoryStore((state) => state.activeRunId);

    useExecutionStatus(activeRunId);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!routeId || routeId === 'new') {
                resetWorkflow();
                clearRuns();
                return;
            }

            try {
                await loadWorkflow(routeId);
                if (!cancelled) {
                    await fetchHistory(routeId);
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(error instanceof Error ? error.message : 'Failed to load workflow');
                }
            }
        };

        load().catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [routeId, loadWorkflow, resetWorkflow, fetchHistory, clearRuns]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const state = useWorkflowStore.getState();
            if (!state.workflowId || state.isSaving || !state.isDirty) {
                return;
            }

            state.saveWorkflow().catch(() => undefined);
        }, 30_000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="h-full flex">
            {leftSidebarOpen && <LeftSidebar />}

            <main className="flex-1 relative min-w-0">
                <WorkflowCanvas />
            </main>

            {rightSidebarOpen && <RightSidebar />}
        </div>
    );
}

