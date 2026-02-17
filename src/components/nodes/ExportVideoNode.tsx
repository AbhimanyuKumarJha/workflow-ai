'use client';

import { useMemo } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Download, ExternalLink, Video } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { ExportVideoNodeData } from '@/lib/types';
import { useWorkflowStore } from '@/stores/workflow-store';

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

function formatDuration(durationMs?: number): string {
    if (!durationMs || durationMs <= 0) {
        return '--';
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function ExportVideoNode({ id, data, selected }: NodeProps) {
    const nodeData = data as ExportVideoNodeData;
    const nodes = useWorkflowStore((state) => state.nodes);
    const edges = useWorkflowStore((state) => state.edges);

    const connectedSourceVideoUrl = useMemo(() => {
        const incoming = edges.find((edge) => edge.target === id && edge.targetHandle === 'video');
        if (!incoming) {
            return undefined;
        }

        const sourceNode = nodes.find((node) => node.id === incoming.source);
        if (!sourceNode) {
            return undefined;
        }

        const sourceData = sourceNode.data as Record<string, unknown>;
        const toStringValue = (value: unknown): string | undefined =>
            typeof value === 'string' && value.trim().length > 0 ? value : undefined;

        switch (sourceNode.type) {
            case 'upload_video':
            case 'export_video':
                return toStringValue(sourceData.videoUrl) ?? toStringValue(sourceData.url);
            default:
                return toStringValue(sourceData.videoUrl) ?? toStringValue(sourceData.url);
        }
    }, [edges, id, nodes]);

    const effectiveVideoUrl = nodeData.videoUrl ?? connectedSourceVideoUrl;
    const isExportedPreview = Boolean(nodeData.videoUrl);

    return (
        <>
            <CustomHandle
                id="video"
                type="target"
                dataType="video"
                label="Video"
                required
                position={Position.Left}
                style={{ top: '50%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Export Video'}
                icon={Video}
                iconColor="text-node-video"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {effectiveVideoUrl ? (
                    <div className="space-y-2">
                        <div
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] border ${isExportedPreview
                                ? 'bg-green-500/10 text-green-300 border-green-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                }`}
                        >
                            {isExportedPreview ? 'Exported' : 'Connected Source'}
                        </div>
                        <video
                            src={effectiveVideoUrl}
                            controls
                            className="w-full max-h-40 rounded border border-border"
                        />

                        <div className="text-xs text-text-secondary space-y-1">
                            <div>Provider: {nodeData.provider ?? 'cloudinary'}</div>
                            <div>MIME: {nodeData.mimeType ?? '--'}</div>
                            <div>Duration: {formatDuration(nodeData.durationMs)}</div>
                            <div>Bytes: {formatBytes(nodeData.bytes)}</div>
                        </div>

                        <div className="flex items-center gap-2">
                            <a
                                href={effectiveVideoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open
                            </a>
                            <a
                                href={effectiveVideoUrl}
                                download
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download
                            </a>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-text-tertiary bg-background rounded border border-border p-2">
                        Connect a video output to export and persist a final asset.
                    </div>
                )}
            </BaseNode>
        </>
    );
}

export default ExportVideoNode;
