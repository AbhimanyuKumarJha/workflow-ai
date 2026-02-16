'use client';

import { useState, useMemo } from 'react';
import { UserButton } from '@clerk/nextjs';
import {
    Download,
    FlaskConical,
    PanelLeftClose,
    PanelRightClose,
    Play,
    Save,
    Upload,
    MousePointerClick,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { sampleWorkflow } from '@/lib/sample-workflow';
import { useHistoryStore } from '@/stores/history-store';

export function Header() {
    const workflowId = useWorkflowStore((state) => state.workflowId);
    const workflowName = useWorkflowStore((state) => state.workflowName);
    const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const exportJSON = useWorkflowStore((state) => state.exportJSON);
    const importJSON = useWorkflowStore((state) => state.importJSON);
    const applySnapshot = useWorkflowStore((state) => state.applySnapshot);
    const nodes = useWorkflowStore((state) => state.nodes);
    const isSaving = useWorkflowStore((state) => state.isSaving);

    const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);
    const toggleLeftSidebar = useUIStore((state) => state.toggleLeftSidebar);
    const toggleRightSidebar = useUIStore((state) => state.toggleRightSidebar);

    const addRun = useHistoryStore((state) => state.addRun);
    const setActiveRunId = useHistoryStore((state) => state.setActiveRunId);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);

    const [isEditingName, setIsEditingName] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);

    // Track selected nodes for "Run Selected" feature
    const selectedNodeIds = useMemo(
        () => nodes.filter((n) => n.selected).map((n) => n.id),
        [nodes]
    );
    const hasSelection = selectedNodeIds.length > 1;

    const handleSave = async () => {
        try {
            await toast.promise(saveWorkflow(), {
                loading: 'Saving workflow...',
                success: 'Workflow saved',
                error: 'Failed to save workflow',
            });
        } catch {
            // handled via toast.promise
        }
    };

    const handleExport = () => {
        try {
            const json = exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${workflowName || 'workflow'}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success('Workflow exported');
        } catch {
            toast.error('Failed to export workflow');
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) {
                return;
            }

            try {
                const text = await file.text();
                importJSON(text);
                toast.success('Workflow imported');
            } catch {
                toast.error('Failed to import workflow JSON');
            }
        };

        input.click();
    };

    const handleLoadSample = () => {
        applySnapshot(sampleWorkflow, {
            name: 'Product Marketing Kit Generator',
            markDirty: true,
        });
        toast.success('Sample workflow loaded');
    };

    const handleExecute = async () => {
        if (nodes.length === 0) {
            toast.error('Add at least one node before running');
            return;
        }

        setIsExecuting(true);

        try {
            let targetWorkflowId = workflowId;
            if (!targetWorkflowId) {
                await saveWorkflow();
                targetWorkflowId = useWorkflowStore.getState().workflowId;
            }

            if (!targetWorkflowId) {
                throw new Error('Workflow must be saved before execution');
            }

            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId: targetWorkflowId,
                    scope: 'FULL',
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | {
                    error?: string;
                    runId?: string;
                    runNumber?: number;
                    run?: Parameters<typeof addRun>[0];
                }
                | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? 'Execution failed');
            }

            if (payload?.run) {
                addRun(payload.run);
            }

            if (payload?.runId) {
                setActiveRunId(payload.runId);
            }

            await fetchHistory(targetWorkflowId);
            toast.success(
                payload?.runNumber
                    ? `Run #${payload.runNumber} started`
                    : 'Workflow execution started'
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to execute workflow');
        } finally {
            setIsExecuting(false);
        }
    };

    const handleExecuteSelected = async () => {
        if (selectedNodeIds.length === 0) {
            toast.error('Select nodes on the canvas first');
            return;
        }

        setIsExecuting(true);

        try {
            let targetWorkflowId = workflowId;
            if (!targetWorkflowId) {
                await saveWorkflow();
                targetWorkflowId = useWorkflowStore.getState().workflowId;
            }

            if (!targetWorkflowId) {
                throw new Error('Workflow must be saved before execution');
            }

            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workflowId: targetWorkflowId,
                    scope: 'SELECTED',
                    selectedNodeIds,
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | {
                    error?: string;
                    runId?: string;
                    runNumber?: number;
                    run?: Parameters<typeof addRun>[0];
                }
                | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? 'Execution failed');
            }

            if (payload?.run) {
                addRun(payload.run);
            }
            if (payload?.runId) {
                setActiveRunId(payload.runId);
            }

            await fetchHistory(targetWorkflowId);
            toast.success(
                payload?.runNumber
                    ? `Run #${payload.runNumber} (selected nodes) started`
                    : 'Selected node execution started'
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to execute selected nodes');
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <header className="h-16 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4">
            <div className="flex items-center gap-4 min-w-0">
                <button
                    onClick={toggleLeftSidebar}
                    className="p-2 hover:bg-gray-800 rounded transition-colors"
                    title={leftSidebarOpen ? 'Close left sidebar' : 'Open left sidebar'}
                >
                    <PanelLeftClose
                        size={20}
                        className={`transition-transform ${!leftSidebarOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">W</span>
                    </div>
                    <span className="text-xl font-bold text-white hidden sm:block">Weavy</span>
                </div>

                <div className="min-w-0">
                    {isEditingName ? (
                        <input
                            type="text"
                            value={workflowName}
                            onChange={(event) => setWorkflowName(event.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === 'Escape') {
                                    setIsEditingName(false);
                                }
                            }}
                            autoFocus
                            className="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700 focus:outline-none focus:border-purple-500 w-64 max-w-[45vw]"
                        />
                    ) : (
                        <button
                            onClick={() => setIsEditingName(true)}
                            className="text-white hover:text-purple-300 transition-colors px-3 py-1 hover:bg-gray-800 rounded truncate max-w-[45vw]"
                            title={workflowName}
                        >
                            {workflowName}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                    title="Save workflow (Ctrl+S)"
                >
                    <Save size={16} />
                    <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
                </button>

                <button
                    onClick={handleLoadSample}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                    title="Load sample workflow"
                >
                    <FlaskConical size={16} />
                    <span className="hidden sm:inline">Sample</span>
                </button>

                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    title="Export workflow (Ctrl+E)"
                >
                    <Download size={16} />
                    <span className="hidden sm:inline">Export</span>
                </button>

                <button
                    onClick={handleImport}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    title="Import workflow"
                >
                    <Upload size={16} />
                    <span className="hidden sm:inline">Import</span>
                </button>

                {hasSelection && (
                    <button
                        onClick={handleExecuteSelected}
                        disabled={isExecuting}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                        title={`Run ${selectedNodeIds.length} selected nodes`}
                    >
                        <MousePointerClick size={16} />
                        <span className="hidden sm:inline">
                            {isExecuting ? 'Running...' : `Run Selected (${selectedNodeIds.length})`}
                        </span>
                    </button>
                )}

                <button
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                    title="Execute workflow"
                >
                    <Play size={16} />
                    <span className="hidden sm:inline">{isExecuting ? 'Running...' : 'Run'}</span>
                </button>
            </div>

            <div className="flex items-center gap-2">
                <UserButton
                    appearance={{
                        elements: {
                            avatarBox: 'w-8 h-8',
                        },
                    }}
                />

                <button
                    onClick={toggleRightSidebar}
                    className="p-2 hover:bg-gray-800 rounded transition-colors"
                    title={rightSidebarOpen ? 'Close right sidebar' : 'Open right sidebar'}
                >
                    <PanelRightClose
                        size={20}
                        className={`transition-transform ${!rightSidebarOpen ? 'rotate-180' : ''}`}
                    />
                </button>
            </div>
        </header>
    );
}

