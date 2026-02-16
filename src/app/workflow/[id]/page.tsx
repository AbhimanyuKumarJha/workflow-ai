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

    const setLeftSidebarOpen = useUIStore((state) => state.setLeftSidebarOpen);
    const setRightSidebarOpen = useUIStore((state) => state.setRightSidebarOpen);

    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const clearRuns = useHistoryStore((state) => state.clearRuns);
    const activeRunId = useHistoryStore((state) => state.activeRunId);

    useExecutionStatus(activeRunId);

    // Auto-collapse sidebars on small screens
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setLeftSidebarOpen(false);
                setRightSidebarOpen(false);
            }
        };

        handleResize(); // Check on mount
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [setLeftSidebarOpen, setRightSidebarOpen]);

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
        <div className="h-full flex overflow-hidden">
            <LeftSidebar />

            <main className="flex-1 relative min-w-0">
                <WorkflowCanvas />
            </main>

            <RightSidebar />
        </div>
    );
}

