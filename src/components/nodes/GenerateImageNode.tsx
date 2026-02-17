'use client';

import { useCallback } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Download, ImagePlus, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { useHistoryStore } from '@/stores/history-store';
import { GenerateImageNodeData } from '@/lib/types';

const IMAGE_MODELS = [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) {
        return '--';
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GenerateImageNode({ id, data, selected }: NodeProps) {
    const nodeData = data as GenerateImageNodeData;
    const edges = useWorkflowStore((state) => state.edges);
    const workflowId = useWorkflowStore((state) => state.workflowId);
    const isDirty = useWorkflowStore((state) => state.isDirty);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const executingNodes = useUIStore((state) => state.executingNodes);
    const addRun = useHistoryStore((state) => state.addRun);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const setActiveRunId = useHistoryStore((state) => state.setActiveRunId);

    const promptConnected = edges.some((edge) => edge.target === id && edge.targetHandle === 'prompt');
    const refAConnected = edges.some(
        (edge) => edge.target === id && edge.targetHandle === 'reference_a'
    );
    const refBConnected = edges.some(
        (edge) => edge.target === id && edge.targetHandle === 'reference_b'
    );
    const referenceCount = Number(refAConnected) + Number(refBConnected);

    const isExecuting = nodeData.isExecuting || executingNodes.has(id);

    const handlePromptChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            updateNodeData(id, { prompt: event.target.value });
        },
        [id, updateNodeData]
    );

    const handleModelChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            updateNodeData(id, { model: event.target.value });
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
            const generatedUrl =
                typeof nodeRun?.outputs?.imageUrl === 'string'
                    ? nodeRun.outputs.imageUrl
                    : typeof nodeRun?.outputs?.url === 'string'
                        ? nodeRun.outputs.url
                        : undefined;

            updateNodeData(id, {
                isExecuting: false,
                imageUrl: generatedUrl ?? nodeData.imageUrl,
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
        nodeData.imageUrl,
    ]);

    const canRun = !isExecuting && (promptConnected || Boolean(nodeData.prompt?.trim()));

    return (
        <>
            <CustomHandle
                id="prompt"
                type="target"
                dataType="text"
                label="Prompt"
                required
                position={Position.Left}
                style={{ top: '25%' }}
            />
            <CustomHandle
                id="reference_a"
                type="target"
                dataType="image"
                label="Reference A"
                position={Position.Left}
                style={{ top: '50%' }}
            />
            <CustomHandle
                id="reference_b"
                type="target"
                dataType="image"
                label="Reference B"
                position={Position.Left}
                style={{ top: '75%' }}
            />
            <CustomHandle
                id="output"
                type="source"
                dataType="image"
                label="Generated Image"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Generate Image'}
                icon={ImagePlus}
                iconColor="text-node-image"
                isExecuting={isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                <div className="space-y-2">
                    <div>
                        <label className="text-xs text-text-secondary mb-1 block">Model</label>
                        <select
                            value={nodeData.model || IMAGE_MODELS[0].value}
                            onChange={handleModelChange}
                            className="w-full p-2 text-sm bg-background border border-border rounded text-text-primary focus:outline-none focus:border-accent-purple"
                        >
                            {IMAGE_MODELS.map((model) => (
                                <option key={model.value} value={model.value}>
                                    {model.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-text-secondary mb-1 block">
                            Prompt * {promptConnected && '(connected)'}
                        </label>
                        <textarea
                            value={nodeData.prompt ?? ''}
                            onChange={handlePromptChange}
                            disabled={promptConnected}
                            placeholder="Describe the image you want to generate..."
                            rows={3}
                            className={`w-full p-2 text-sm bg-background border border-border rounded text-text-primary placeholder-text-tertiary resize-none focus:outline-none focus:border-accent-purple ${promptConnected ? 'opacity-50 cursor-not-allowed bg-background-tertiary' : ''}`}
                        />
                    </div>

                    <div className="text-xs text-text-secondary bg-node-image/10 px-2 py-1 rounded">
                        Reference images connected: {referenceCount} (max 2)
                    </div>

                    <button
                        onClick={handleRun}
                        disabled={!canRun}
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${canRun ? 'bg-accent-purple hover:bg-accent-purple-dark text-white' : 'bg-background-tertiary text-text-tertiary cursor-not-allowed'}`}
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4" />
                                Generate
                            </>
                        )}
                    </button>

                    {nodeData.imageUrl && (
                        <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={nodeData.imageUrl}
                                alt="Generated"
                                className="w-full max-h-40 object-contain rounded border border-border"
                            />
                            <div className="text-xs text-text-secondary space-y-1">
                                <div>Provider: {nodeData.provider ?? '--'}</div>
                                <div>MIME: {nodeData.mimeType ?? '--'}</div>
                                <div>
                                    Size:{' '}
                                    {nodeData.width && nodeData.height
                                        ? `${nodeData.width} x ${nodeData.height}px`
                                        : '--'}
                                </div>
                                <div>Bytes: {formatBytes(nodeData.bytes)}</div>
                            </div>
                            <a
                                href={nodeData.imageUrl}
                                download
                                className="w-full inline-flex items-center justify-center gap-2 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download
                            </a>
                        </div>
                    )}
                </div>
            </BaseNode>
        </>
    );
}

export default GenerateImageNode;
