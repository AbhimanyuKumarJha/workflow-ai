'use client';

import { useCallback } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Film, Loader2, Play } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { ExtractFrameNodeData } from '@/lib/types';

export function ExtractFrameNode({ id, data, selected }: NodeProps) {
    const nodeData = data as ExtractFrameNodeData;
    const edges = useWorkflowStore((state) => state.edges);
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const executingNodes = useUIStore((state) => state.executingNodes);

    // Check which handles are connected
    const videoConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'video_url'
    );
    const timestampConnected = edges.some(
        (e) => e.target === id && e.targetHandle === 'timestamp'
    );

    const isExecuting = nodeData.isExecuting || executingNodes.has(id);

    const handleTimestampChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNodeData(id, { timestamp: e.target.value });
        },
        [id, updateNodeData]
    );

    const handleRun = useCallback(() => {
        // This will be implemented in Phase 5 with Trigger.dev
        updateNodeData(id, {
            isExecuting: true,
            error: undefined,
        });

        // Simulate execution
        setTimeout(() => {
            updateNodeData(id, {
                isExecuting: false,
                // Placeholder - would be actual extracted frame
                extractedFrameUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%23374151" width="200" height="120"/><text x="50%" y="50%" fill="%239CA3AF" text-anchor="middle" dy=".3em" font-size="12">Frame extracted</text></svg>',
            });
        }, 1000);
    }, [id, updateNodeData]);

    const canRun = !isExecuting && (videoConnected || nodeData.videoUrl);

    // Parse timestamp for display
    const formatTimestamp = (ts: string | number | undefined) => {
        if (ts === undefined || ts === '') return '00:00:00';
        if (typeof ts === 'number') {
            const seconds = Math.floor(ts / 1000);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return ts;
    };

    return (
        <>
            {/* Input handles - positioned on left */}
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
            {/* Output handle */}
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

                {/* Timestamp input */}
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
                        Format: HH:MM:SS or seconds (e.g., 1.5)
                    </p>
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
                            Extracting...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Extract
                        </>
                    )}
                </button>

                {/* Extracted frame preview */}
                {nodeData.extractedFrameUrl && (
                    <div className="mt-3">
                        <label className="text-xs text-text-secondary mb-1 block">Extracted Frame</label>
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
