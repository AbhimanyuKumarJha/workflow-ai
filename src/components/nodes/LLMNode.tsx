'use client';

import { useCallback, useState } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Brain, Loader2, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { LLMNodeData } from '@/lib/types';
import { toast } from 'sonner';
import { useHistoryStore } from '@/stores/history-store';

const GEMINI_MODELS = [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
];

export function LLMNode({ id, data, selected }: NodeProps) {
    const nodeData = data as LLMNodeData;
    const edges = useWorkflowStore((state) => state.edges);
    const workflowId = useWorkflowStore((state) => state.workflowId);
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const executingNodes = useUIStore((state) => state.executingNodes);
    const addRun = useHistoryStore((state) => state.addRun);
    const fetchHistory = useHistoryStore((state) => state.fetchHistory);
    const setActiveRunId = useHistoryStore((state) => state.setActiveRunId);
    const [responseExpanded, setResponseExpanded] = useState(false);

    // Check which handles are connected
    const systemPromptConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'system_prompt'
    );
    const userMessageConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'user_message'
    );
    const imagesConnected = edges.filter(
        (e) => e.target === id && e.targetHandle === 'images'
    );

    const isExecuting = nodeData.isExecuting || executingNodes.has(id);

    const handleModelChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            updateNodeData(id, { selectedModel: e.target.value });
        },
        [id, updateNodeData]
    );

    const handleSystemPromptChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            updateNodeData(id, { systemPrompt: e.target.value });
        },
        [id, updateNodeData]
    );

    const handleUserMessageChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            updateNodeData(id, { userMessage: e.target.value });
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
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId,
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
            await fetchHistory(workflowId);

            const nodeRun = payload?.run?.nodeRuns?.find((run) => run.nodeId === id);
            const outputText =
                typeof nodeRun?.outputs?.text === 'string'
                    ? nodeRun.outputs.text
                    : typeof nodeRun?.outputs?.response === 'string'
                    ? nodeRun.outputs.response
                    : undefined;

            updateNodeData(id, {
                isExecuting: false,
                response: outputText ?? nodeData.response,
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
        id,
        updateNodeData,
        addRun,
        setActiveRunId,
        fetchHistory,
        nodeData.response,
    ]);

    const canRun = !isExecuting && (userMessageConnected || nodeData.userMessage);

    return (
        <>
            {/* Input handles - positioned on left */}
            <CustomHandle
                id="system_prompt"
                type="target"
                dataType="text"
                label="System Prompt"
                position={Position.Left}
                style={{ top: '25%' }}
            />
            <CustomHandle
                id="user_message"
                type="target"
                dataType="text"
                label="User Message"
                required
                position={Position.Left}
                style={{ top: '50%' }}
            />
            <CustomHandle
                id="images"
                type="target"
                dataType="image"
                label="Images"
                position={Position.Left}
                multiple
                style={{ top: '75%' }}
            />
            {/* Output handle - positioned on right */}
            <CustomHandle
                id="output"
                type="source"
                dataType="text"
                label="Response"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Run Any LLM'}
                icon={Brain}
                iconColor="text-node-llm"
                isExecuting={isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {/* Model selector */}
                <div className="mb-2">
                    <label className="text-xs text-text-secondary mb-1 block">Model</label>
                    <select
                        value={nodeData.selectedModel || 'gemini-2.0-flash-exp'}
                        onChange={handleModelChange}
                        className="w-full p-2 text-sm bg-background border border-border rounded 
                            text-text-primary
                            focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50"
                    >
                        {GEMINI_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                                {model.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* System prompt */}
                <div className="mb-2">
                    <label className="text-xs text-text-secondary mb-1 block">
                        System Prompt {systemPromptConnected && '(connected)'}
                    </label>
                    <textarea
                        value={nodeData.systemPrompt || ''}
                        onChange={handleSystemPromptChange}
                        placeholder="Enter system prompt (optional)..."
                        disabled={systemPromptConnected}
                        className={`w-full min-h-[50px] p-2 text-sm bg-background border border-border rounded 
                            text-text-primary placeholder-text-tertiary resize-none
                            focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50
                            custom-scrollbar
                            ${systemPromptConnected ? 'opacity-50 cursor-not-allowed bg-background-tertiary' : ''}`}
                        rows={2}
                    />
                </div>

                {/* User message */}
                <div className="mb-2">
                    <label className="text-xs text-text-secondary mb-1 block">
                        User Message * {userMessageConnected && '(connected)'}
                    </label>
                    <textarea
                        value={nodeData.userMessage || ''}
                        onChange={handleUserMessageChange}
                        placeholder="Enter your message..."
                        disabled={userMessageConnected}
                        className={`w-full min-h-[60px] p-2 text-sm bg-background border border-border rounded 
                            text-text-primary placeholder-text-tertiary resize-none
                            focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50
                            custom-scrollbar
                            ${userMessageConnected ? 'opacity-50 cursor-not-allowed bg-background-tertiary' : ''}`}
                        rows={3}
                    />
                </div>

                {/* Image connections indicator */}
                {imagesConnected.length > 0 && (
                    <div className="text-xs text-text-secondary bg-node-image/10 px-2 py-1 rounded mb-2">
                        {imagesConnected.length} image(s) connected
                    </div>
                )}

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
                            Running...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Run
                        </>
                    )}
                </button>

                {/* Response display */}
                {nodeData.response && (
                    <div className="mt-3">
                        <button
                            onClick={() => setResponseExpanded(!responseExpanded)}
                            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
                        >
                            {responseExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                            ) : (
                                <ChevronDown className="w-3 h-3" />
                            )}
                            View Response
                        </button>
                        {responseExpanded && (
                            <div className="mt-2 p-2 bg-background rounded text-sm text-text-primary 
                                max-h-40 overflow-y-auto custom-scrollbar border border-border">
                                {nodeData.response}
                            </div>
                        )}
                    </div>
                )}
            </BaseNode>
        </>
    );
}

export default LLMNode;
