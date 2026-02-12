'use client';

import { useRouter } from 'next/navigation';
import { Plus, FolderOpen } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow-store';

export default function WorkflowListPage() {
    const router = useRouter();
    const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow);

    const handleNewWorkflow = () => {
        resetWorkflow();
        // For now, go directly to editor without creating a workflow in DB
        // This will be enhanced in Phase 4 with actual API calls
        router.push('/workflow/new');
    };

    return (
        <div className="h-full flex items-center justify-center bg-gray-950">
            <div className="text-center max-w-md px-8">
                <div className="mb-8">
                    <FolderOpen size={64} className="mx-auto text-gray-600 mb-4" />
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Your Workflows
                    </h1>
                    <p className="text-gray-400">
                        Create visual workflows powered by AI and automation
                    </p>
                </div>

                <button
                    onClick={handleNewWorkflow}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                    <Plus size={20} />
                    <span>Create New Workflow</span>
                </button>

                <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <p className="text-sm text-gray-400">
                        <span className="font-semibold text-purple-400">Phase 2 Note:</span>{' '}
                        Workflow list and persistence will be implemented in Phase 4. For
                        now, you can create and work with workflows in memory.
                    </p>
                </div>
            </div>
        </div>
    );
}
