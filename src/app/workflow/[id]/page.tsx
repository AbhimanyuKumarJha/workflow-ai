'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { LeftSidebar } from '@/components/layout/LeftSidebar';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { WorkflowCanvas } from '@/components/canvas/WorkflowCanvas';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { toast } from 'sonner';

export default function WorkflowEditorPage() {
    const params = useParams();
    const workflowId = params.id as string;

    const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
    const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId);
    const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);

    useEffect(() => {
        if (workflowId && workflowId !== 'new') {
            // Load existing workflow
            loadWorkflow(workflowId).catch((error) => {
                toast.error('Failed to load workflow');
                console.error(error);
            });
        } else {
            // New workflow
            setWorkflowId(null);
        }
    }, [workflowId, loadWorkflow, setWorkflowId]);

    return (
        <div className="h-full flex">
            {/* Left Sidebar */}
            {leftSidebarOpen && <LeftSidebar />}

            {/* Main Canvas */}
            <div className="flex-1 relative">
                <WorkflowCanvas />
            </div>

            {/* Right Sidebar */}
            {rightSidebarOpen && <RightSidebar />}
        </div>
    );
}
