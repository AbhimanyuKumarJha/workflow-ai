'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Plus, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface WorkflowListItem {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
    runCount: number;
    latestVersion: number;
}

export default function WorkflowListPage() {
    const router = useRouter();
    const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchWorkflows = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/workflows');
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(payload?.error ?? 'Failed to load workflows');
            }

            const data = (await response.json()) as {
                workflows?: WorkflowListItem[];
            };

            setWorkflows(data.workflows ?? []);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'Failed to load workflows');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorkflows().catch(() => undefined);
    }, [fetchWorkflows]);

    const createWorkflow = async () => {
        setCreating(true);
        setError(null);

        try {
            const response = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Untitled workflow' }),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(payload?.error ?? 'Failed to create workflow');
            }

            const data = (await response.json()) as { workflow?: { id: string } };
            if (!data.workflow?.id) {
                throw new Error('Workflow was created but no ID was returned');
            }

            router.push(`/workflow/${data.workflow.id}`);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Failed to create workflow');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-gray-950 p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-semibold text-white">My Workflows</h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Build, run, and iterate on visual AI workflows.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchWorkflows()}
                            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded transition inline-flex items-center gap-2"
                            title="Refresh workflows"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </button>

                        <button
                            onClick={createWorkflow}
                            disabled={creating}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition inline-flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            {creating ? 'Creating...' : 'New Workflow'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 border border-red-800/40 bg-red-900/20 rounded text-sm text-red-200">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="h-[40vh] flex items-center justify-center">
                        <LoadingSpinner size="lg" />
                    </div>
                ) : workflows.length === 0 ? (
                    <div className="h-[40vh] flex items-center justify-center border border-gray-800 rounded-xl bg-gray-900/50">
                        <div className="text-center px-6">
                            <Folder className="mx-auto h-12 w-12 text-gray-600 mb-3" />
                            <p className="text-white font-medium">No workflows yet</p>
                            <p className="text-sm text-gray-400 mt-1">
                                Create your first workflow to get started.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {workflows.map((workflow) => (
                            <button
                                key={workflow.id}
                                onClick={() => router.push(`/workflow/${workflow.id}`)}
                                className="text-left p-4 rounded-xl border border-gray-800 bg-gray-900 hover:border-purple-500/50 hover:bg-gray-900/80 transition"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Folder className="h-4 w-4 text-purple-300" />
                                    <h2 className="text-white font-medium truncate">{workflow.name}</h2>
                                </div>

                                <p className="text-sm text-gray-400 line-clamp-2 min-h-10">
                                    {workflow.description || 'No description'}
                                </p>

                                <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
                                    <span>v{workflow.latestVersion}</span>
                                    <span>•</span>
                                    <span>{workflow.runCount} runs</span>
                                    <span>•</span>
                                    <span>{new Date(workflow.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

