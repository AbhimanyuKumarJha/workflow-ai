'use client';

import { useEffect } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock,
    Loader2,
    RotateCw,
    XCircle,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useHistoryStore } from '@/stores/history-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function formatDuration(durationMs: number | null): string {
    if (durationMs === null || durationMs === undefined) {
        return '--';
    }

    if (durationMs < 1000) {
        return `${durationMs}ms`;
    }

    if (durationMs < 60_000) {
        return `${(durationMs / 1000).toFixed(1)}s`;
    }

    return `${(durationMs / 60_000).toFixed(1)}m`;
}

function formatStartedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--';
    }

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function truncateJson(value: unknown, maxLength = 120): string {
    if (value === null || value === undefined) {
        return '--';
    }

    const content = typeof value === 'string' ? value : JSON.stringify(value);
    if (content.length <= maxLength) {
        return content;
    }

    return `${content.slice(0, maxLength)}...`;
}

function runStatusStyles(status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL') {
    switch (status) {
        case 'RUNNING':
            return {
                badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
                icon: <Loader2 className="h-4 w-4 animate-spin text-yellow-300" />,
            };
        case 'SUCCESS':
            return {
                badge: 'bg-green-500/15 text-green-300 border-green-500/30',
                icon: <CheckCircle2 className="h-4 w-4 text-green-300" />,
            };
        case 'FAILED':
            return {
                badge: 'bg-red-500/15 text-red-300 border-red-500/30',
                icon: <XCircle className="h-4 w-4 text-red-300" />,
            };
        case 'PARTIAL':
            return {
                badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
                icon: <AlertCircle className="h-4 w-4 text-orange-300" />,
            };
    }
}

function nodeStatusIcon(status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED') {
    switch (status) {
        case 'RUNNING':
            return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-300" />;
        case 'SUCCESS':
            return <CheckCircle2 className="h-3.5 w-3.5 text-green-300" />;
        case 'FAILED':
            return <XCircle className="h-3.5 w-3.5 text-red-300" />;
        case 'SKIPPED':
            return <AlertCircle className="h-3.5 w-3.5 text-gray-400" />;
        case 'QUEUED':
        default:
            return <Clock className="h-3.5 w-3.5 text-blue-300" />;
    }
}

export function RightSidebar() {
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);
    const workflowId = useWorkflowStore((state) => state.workflowId);

    const runs = useHistoryStore((state) => state.runs);
    const loading = useHistoryStore((state) => state.loading);
    const error = useHistoryStore((state) => state.error);
    const selectedRunId = useHistoryStore((state) => state.selectedRunId);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const setSelectedRunId = useHistoryStore((state) => state.setSelectedRunId);
    const clearRuns = useHistoryStore((state) => state.clearRuns);

    useEffect(() => {
        if (!workflowId) {
            clearRuns();
            return;
        }

        fetchHistory(workflowId).catch(() => undefined);
    }, [workflowId, fetchHistory, clearRuns]);

    if (!rightSidebarOpen) {
        return null;
    }

    return (
        <aside className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-400" />
                        <h2 className="text-white text-lg font-semibold">Workflow History</h2>
                    </div>
                    {workflowId && (
                        <button
                            onClick={() => fetchHistory(workflowId)}
                            className="p-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition"
                            title="Refresh history"
                        >
                            <RotateCw className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    Runs include full, selected, and single-node executions
                </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {!workflowId ? (
                    <div className="h-full flex items-center justify-center px-6 text-center text-gray-500 text-sm">
                        Save or open a workflow to view execution history.
                    </div>
                ) : loading ? (
                    <div className="h-full flex items-center justify-center">
                        <LoadingSpinner size="md" />
                    </div>
                ) : error ? (
                    <div className="p-4 text-sm text-red-300">{error}</div>
                ) : runs.length === 0 ? (
                    <div className="h-full flex items-center justify-center px-6 text-center text-gray-500 text-sm">
                        No runs yet. Execute the workflow to populate history.
                    </div>
                ) : (
                    <div className="p-3 space-y-2">
                        {runs.map((run) => {
                            const expanded = selectedRunId === run.id;
                            const status = runStatusStyles(run.status);

                            return (
                                <div
                                    key={run.id}
                                    className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
                                >
                                    <button
                                        onClick={() =>
                                            setSelectedRunId(expanded ? null : run.id)
                                        }
                                        className="w-full p-3 text-left hover:bg-gray-700/40 transition"
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className="pt-0.5">
                                                {expanded ? (
                                                    <ChevronDown className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className="text-sm font-medium text-white">
                                                        Run #{run.runNumber}
                                                    </p>
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${status.badge}`}
                                                    >
                                                        {status.icon}
                                                        {run.status}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                                    <span>{formatStartedAt(run.startedAt)}</span>
                                                    <span>•</span>
                                                    <span>{formatDuration(run.durationMs)}</span>
                                                    <span>•</span>
                                                    <span>{run.scope}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="px-3 pb-3 border-t border-gray-700">
                                            {run.errorSummary && (
                                                <div className="mt-3 p-2 rounded border border-red-700/40 bg-red-900/20 text-xs text-red-200">
                                                    {run.errorSummary}
                                                </div>
                                            )}

                                            <div className="mt-3 space-y-2">
                                                {run.nodeRuns.map((nodeRun) => (
                                                    <div
                                                        key={nodeRun.id}
                                                        className="p-2 rounded border border-gray-700 bg-gray-900/60"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-1.5 text-xs text-gray-200">
                                                                {nodeStatusIcon(nodeRun.status)}
                                                                <span className="font-medium">
                                                                    {nodeRun.nodeType}
                                                                </span>
                                                                <span className="text-gray-500">
                                                                    ({nodeRun.nodeId})
                                                                </span>
                                                            </div>
                                                            <span className="text-[11px] text-gray-400">
                                                                {formatDuration(nodeRun.durationMs)}
                                                            </span>
                                                        </div>

                                                        {nodeRun.errorMessage ? (
                                                            <p className="mt-2 text-[11px] text-red-300">
                                                                {nodeRun.errorMessage}
                                                            </p>
                                                        ) : (
                                                            <p className="mt-2 text-[11px] text-gray-400 break-words">
                                                                Output: {truncateJson(nodeRun.outputs)}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </aside>
    );
}

