'use client';

import { useState } from 'react';
import { Clock, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

// Placeholder for workflow run history
// This will be populated with actual data in Phase 5
interface WorkflowRun {
    id: string;
    runNumber: number;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
    startedAt: Date;
    durationMs?: number;
    errorSummary?: string;
}

export function RightSidebar() {
    const rightSidebarOpen = useUIStore((state) => state.rightSidebarOpen);
    const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

    // Placeholder data - will be replaced with actual API calls in Phase 5
    const runs: WorkflowRun[] = [];

    const toggleRunExpanded = (runId: string) => {
        setExpandedRuns((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(runId)) {
                newSet.delete(runId);
            } else {
                newSet.add(runId);
            }
            return newSet;
        });
    };

    const getStatusIcon = (status: WorkflowRun['status']) => {
        switch (status) {
            case 'RUNNING':
                return <Loader2 size={16} className="text-blue-400 animate-spin" />;
            case 'SUCCESS':
                return <CheckCircle size={16} className="text-green-400" />;
            case 'FAILED':
                return <XCircle size={16} className="text-red-400" />;
            case 'PARTIAL':
                return <CheckCircle size={16} className="text-yellow-400" />;
        }
    };

    const getStatusColor = (status: WorkflowRun['status']) => {
        switch (status) {
            case 'RUNNING':
                return 'text-blue-400';
            case 'SUCCESS':
                return 'text-green-400';
            case 'FAILED':
                return 'text-red-400';
            case 'PARTIAL':
                return 'text-yellow-400';
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '--';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const formatDate = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (!rightSidebarOpen) return null;

    return (
        <aside className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <Clock size={20} className="text-purple-400" />
                    <h2 className="text-lg font-semibold text-white">Workflow History</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    View past executions and results
                </p>
            </div>

            {/* Run list */}
            <div className="flex-1 overflow-y-auto">
                {runs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <Clock size={48} className="text-gray-600 mb-4" />
                        <p className="text-gray-400 text-sm">No execution history yet</p>
                        <p className="text-gray-500 text-xs mt-2">
                            Run your workflow to see execution history here
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-2">
                        {runs.map((run) => {
                            const isExpanded = expandedRuns.has(run.id);
                            return (
                                <div
                                    key={run.id}
                                    className="bg-gray-800 rounded-lg overflow-hidden"
                                >
                                    {/* Run header */}
                                    <button
                                        onClick={() => toggleRunExpanded(run.id)}
                                        className="w-full p-3 flex items-center gap-3 hover:bg-gray-750 transition-colors"
                                    >
                                        {/* Expand icon */}
                                        {isExpanded ? (
                                            <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                                        ) : (
                                            <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                                        )}

                                        {/* Status icon */}
                                        {getStatusIcon(run.status)}

                                        {/* Run info */}
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">
                                                    Run #{run.runNumber}
                                                </span>
                                                <span className={`text-xs ${getStatusColor(run.status)}`}>
                                                    {run.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-gray-400">
                                                    {formatDate(run.startedAt)}
                                                </span>
                                                {run.durationMs && (
                                                    <>
                                                        <span className="text-gray-600">•</span>
                                                        <span className="text-xs text-gray-400">
                                                            {formatDuration(run.durationMs)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </button>

                                    {/* Run details (expanded) */}
                                    {isExpanded && (
                                        <div className="px-3 pb-3 border-t border-gray-700">
                                            <div className="pt-3 space-y-2">
                                                {run.errorSummary && (
                                                    <div className="bg-red-900/20 border border-red-800 rounded p-2">
                                                        <p className="text-xs text-red-300">{run.errorSummary}</p>
                                                    </div>
                                                )}
                                                <p className="text-xs text-gray-400">
                                                    Node-level execution details coming in Phase 5
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800">
                <button
                    disabled={runs.length === 0}
                    className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                >
                    Clear History
                </button>
            </div>
        </aside>
    );
}
