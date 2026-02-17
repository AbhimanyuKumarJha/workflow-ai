'use client';

import { useCallback } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Crop, Loader2, Play } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { CropImageNodeData } from '@/lib/types';
import { toast } from 'sonner';
import { useHistoryStore } from '@/stores/history-store';

export function CropImageNode({ id, data, selected }: NodeProps) {
    const nodeData = data as CropImageNodeData;
    const edges = useWorkflowStore((state) => state.edges);
    const workflowId = useWorkflowStore((state) => state.workflowId);
    const isDirty = useWorkflowStore((state) => state.isDirty);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const executingNodes = useUIStore((state) => state.executingNodes);
    const addRun = useHistoryStore((state) => state.addRun);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const setActiveRunId = useHistoryStore((state) => state.setActiveRunId);

    // Check which handles are connected
    const imageConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'image_url'
    );
    const xConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'x_percent'
    );
    const yConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'y_percent'
    );
    const widthConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'width_percent'
    );
    const heightConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'height_percent'
    );

    const isExecuting = nodeData.isExecuting || executingNodes.has(id);
    const handleInputChange = useCallback(
        (field: keyof CropImageNodeData, value: number) => {
            updateNodeData(id, { [field]: value });
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
            const croppedUrl =
                typeof nodeRun?.outputs?.croppedUrl === 'string'
                    ? nodeRun.outputs.croppedUrl
                    : typeof nodeRun?.outputs?.imageUrl === 'string'
                    ? nodeRun.outputs.imageUrl
                    : undefined;

            updateNodeData(id, {
                isExecuting: false,
                croppedUrl: croppedUrl ?? nodeData.croppedUrl,
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
        nodeData.croppedUrl,
    ]);

    const canRun = !isExecuting && (imageConnected || nodeData.imageUrl);

    return (
        <>
            {/* Input handles - positioned on left */}
            <CustomHandle
                id="image_url"
                type="target"
                dataType="image"
                label="Image"
                required
                position={Position.Left}
                style={{ top: '20%' }}
            />
            <CustomHandle
                id="x_percent"
                type="target"
                dataType="text"
                label="X%"
                position={Position.Left}
                style={{ top: '35%' }}
            />
            <CustomHandle
                id="y_percent"
                type="target"
                dataType="text"
                label="Y%"
                position={Position.Left}
                style={{ top: '50%' }}
            />
            <CustomHandle
                id="width_percent"
                type="target"
                dataType="text"
                label="Width%"
                position={Position.Left}
                style={{ top: '65%' }}
            />
            <CustomHandle
                id="height_percent"
                type="target"
                dataType="text"
                label="Height%"
                position={Position.Left}
                style={{ top: '80%' }}
            />
            {/* Output handle */}
            <CustomHandle
                id="output"
                type="source"
                dataType="image"
                label="Cropped Image"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Crop Image'}
                icon={Crop}
                iconColor="text-node-processing"
                isExecuting={isExecuting}
                error={nodeData.error}
                selected={selected}
            >

                {/* Crop parameters */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label className="text-xs text-text-secondary">X% {xConnected && '(connected)'}</label>
                        <input
                            type="number"
                            value={nodeData.xPercent ?? 0}
                            onChange={(e) => handleInputChange('xPercent', Number(e.target.value))}
                            min={0}
                            max={100}
                            disabled={xConnected}
                            className={`w-full p-1.5 text-sm bg-background border border-border rounded 
                            text-text-primary
                            focus:outline-none focus:border-accent-purple
                            ${xConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-secondary">Y% {yConnected && '(connected)'}</label>
                        <input
                            type="number"
                            value={nodeData.yPercent ?? 0}
                            onChange={(e) => handleInputChange('yPercent', Number(e.target.value))}
                            min={0}
                            max={100}
                            disabled={yConnected}
                            className={`w-full p-1.5 text-sm bg-background border border-border rounded 
                            text-text-primary
                            focus:outline-none focus:border-accent-purple
                            ${yConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-secondary">Width% {widthConnected && '(connected)'}</label>
                        <input
                            type="number"
                            value={nodeData.widthPercent ?? 100}
                            onChange={(e) => handleInputChange('widthPercent', Number(e.target.value))}
                            min={1}
                            max={100}
                            disabled={widthConnected}
                            className={`w-full p-1.5 text-sm bg-background border border-border rounded 
                            text-text-primary
                            focus:outline-none focus:border-accent-purple
                            ${widthConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-secondary">Height% {heightConnected && '(connected)'}</label>
                        <input
                            type="number"
                            value={nodeData.heightPercent ?? 100}
                            onChange={(e) => handleInputChange('heightPercent', Number(e.target.value))}
                            min={1}
                            max={100}
                            disabled={heightConnected}
                            className={`w-full p-1.5 text-sm bg-background border border-border rounded 
                            text-text-primary
                            focus:outline-none focus:border-accent-purple
                            ${heightConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                    </div>
                </div>

                {/* Run button */}
                <button
                    onClick={handleRun}
                    disabled={!canRun}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded font-medium text-sm
                    transition-colors
                    ${canRun
                            ? 'bg-accent-purple hover:bg-accent-purple-dark text-white'
                            : 'bg-background-tertiary text-text-tertiary cursor-not-allowed'
                        }`}
                >
                    {isExecuting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Crop
                        </>
                    )}
                </button>

                {/* Cropped image preview */}
                {nodeData.croppedUrl && (
                    <div className="mt-3">
                        <label className="text-xs text-text-secondary mb-1 block">Result</label>
                        {/* Local object URLs and generated data URLs are not handled by next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={nodeData.croppedUrl}
                            alt="Cropped"
                            className="w-full max-h-32 object-contain rounded border border-border"
                        />
                    </div>
                )}

            </BaseNode>
        </>
    );
}

export default CropImageNode;
