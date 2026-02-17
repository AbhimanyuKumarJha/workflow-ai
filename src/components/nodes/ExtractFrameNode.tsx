'use client';

import { useCallback } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Film, Loader2, Play } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { ExtractFrameNodeData } from '@/lib/types';
import { toast } from 'sonner';
import { useHistoryStore } from '@/stores/history-store';

export function ExtractFrameNode({ id, data, selected }: NodeProps) {
    const nodeData = data as ExtractFrameNodeData;
    const edges = useWorkflowStore((state) => state.edges);
    const workflowId = useWorkflowStore((state) => state.workflowId);
    const isDirty = useWorkflowStore((state) => state.isDirty);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const executingNodes = useUIStore((state) => state.executingNodes);
    const addRun = useHistoryStore((state) => state.addRun);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const setActiveRunId = useHistoryStore((state) => state.setActiveRunId);

    const videoConnected = edges.some((e) => e.target === id && e.targetHandle === 'video_url');
    const timestampConnected = edges.some((e) => e.target === id && e.targetHandle === 'timestamp');

    const isExecuting = nodeData.isExecuting || executingNodes.has(id);
    const handleTimestampChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNodeData(id, { timestamp: e.target.value });
        },
        [id, updateNodeData]
    );

    const handleRun = useCallback(async () => {
        if (!workflowId) {
            toast.error('Save the workflow before executing a node');
            return;
        }

        updateNodeData(id, {
            isExecuting: true,
            error: undefined,
        });

        try {
            let targetWorkflowId = workflowId;
            if (isDirty) {
                await saveWorkflow();
                targetWorkflowId = useWorkflowStore.getState().workflowId ?? targetWorkflowId;
            }

            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId: targetWorkflowId,
                    scope: 'SINGLE',
                    selectedNodeIds: [id],
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | {
                      error?: string;
                      runId?: string;
                      run?: {
                          nodeRuns?: Array<{
                              nodeId: string;
                              outputs?: Record<string, unknown>;
                              errorMessage?: string | null;
                          }>;
                      };
                  }
                | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? 'Node execution failed');
            }

            if (payload?.run) {
                addRun(payload.run as Parameters<typeof addRun>[0]);
            }
            if (payload?.runId) {
                setActiveRunId(payload.runId);
            }
            await fetchHistory(targetWorkflowId);

            const nodeRun = payload?.run?.nodeRuns?.find((run) => run.nodeId === id);
            const frameUrl =
                typeof nodeRun?.outputs?.frameUrl === 'string'
                    ? nodeRun.outputs.frameUrl
                    : typeof nodeRun?.outputs?.extractedFrameUrl === 'string'
                    ? nodeRun.outputs.extractedFrameUrl
                    : undefined;

            updateNodeData(id, {
                isExecuting: false,
                extractedFrameUrl: frameUrl ?? nodeData.extractedFrameUrl,
                error: nodeRun?.errorMessage ?? undefined,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Node execution failed';
            updateNodeData(id, {
                isExecuting: false,
                error: message,
            });
            toast.error(message);
        }
    }, [
        workflowId,
        isDirty,
        saveWorkflow,
        id,
        updateNodeData,
        addRun,
        setActiveRunId,
        fetchHistory,
        nodeData.extractedFrameUrl,
    ]);

    const canRun = !isExecuting && (videoConnected || nodeData.videoUrl);

    const formatTimestamp = (ts: string | number | undefined) => {
        if (ts === undefined || ts === '') return '00:00:00';
        if (typeof ts === 'number') {
            const seconds = Math.floor(ts / 1000);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes
                .toString()
                .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return ts;
    };

    return (
        <>
            <CustomHandle
                id="video_url"
                type="target"
                dataType="video"
                label="Video"
                required
                position={Position.Left}
                style={{ top: '33%' }}
            />
            <CustomHandle
                id="timestamp"
                type="target"
                dataType="text"
                label="Timestamp"
                position={Position.Left}
                style={{ top: '66%' }}
            />
            <CustomHandle
                id="output"
                type="source"
                dataType="image"
                label="Frame"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Extract Frame'}
                icon={Film}
                iconColor="text-node-processing"
                isExecuting={isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                <div className="mb-3">
                    <label className="text-xs text-text-secondary mb-1 block">
                        Timestamp {timestampConnected && '(connected)'}
                    </label>
                    <input
                        type="text"
                        value={formatTimestamp(nodeData.timestamp)}
                        onChange={handleTimestampChange}
                        placeholder="00:00:00 or seconds"
                        disabled={timestampConnected}
                        className={`w-full p-2 text-sm bg-background border border-border rounded 
                        text-text-primary placeholder-text-tertiary font-mono
                        focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50
                        ${timestampConnected ? 'opacity-50 cursor-not-allowed bg-background-tertiary' : ''}`}
                    />
                    <p className="text-xs text-text-tertiary mt-1">
                        Format: HH:MM:SS, seconds, or percentage (e.g. 50%)
                    </p>
                </div>

                <button
                    onClick={handleRun}
                    disabled={!canRun}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded font-medium text-sm
                    transition-colors
                    ${
                        canRun
                            ? 'bg-accent-purple hover:bg-accent-purple-dark text-white'
                            : 'bg-background-tertiary text-text-tertiary cursor-not-allowed'
                    }`}
                >
                    {isExecuting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Extracting...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Extract
                        </>
                    )}
                </button>

                {nodeData.extractedFrameUrl && (
                    <div className="mt-3">
                        <label className="text-xs text-text-secondary mb-1 block">Extracted Frame</label>
                        {/* Local object URLs and generated data URLs are not handled by next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={nodeData.extractedFrameUrl}
                            alt="Extracted frame"
                            className="w-full max-h-32 object-contain rounded border border-border"
                        />
                    </div>
                )}
            </BaseNode>
        </>
    );
}

export default ExtractFrameNode;

