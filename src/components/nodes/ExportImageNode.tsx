'use client';

import { useMemo } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Download, ExternalLink, ImageDown } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { ExportImageNodeData } from '@/lib/types';
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

export function ExportImageNode({ id, data, selected }: NodeProps) {
    const nodeData = data as ExportImageNodeData;
    const nodes = useWorkflowStore((state) => state.nodes);
    const edges = useWorkflowStore((state) => state.edges);

    const connectedSourceImageUrl = useMemo(() => {
        const incoming = edges.find((edge) => edge.target === id && edge.targetHandle === 'image');
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
            case 'upload_image':
            case 'generate_image':
            case 'export_image':
                return toStringValue(sourceData.imageUrl) ?? toStringValue(sourceData.url);
            case 'crop_image':
                return (
                    toStringValue(sourceData.croppedUrl) ??
                    toStringValue(sourceData.imageUrl) ??
                    toStringValue(sourceData.url)
                );
            case 'extract_frame':
                return (
                    toStringValue(sourceData.frameUrl) ??
                    toStringValue(sourceData.extractedFrameUrl) ??
                    toStringValue(sourceData.imageUrl) ??
                    toStringValue(sourceData.url)
                );
            default:
                return toStringValue(sourceData.imageUrl) ?? toStringValue(sourceData.url);
        }
    }, [edges, id, nodes]);

    const effectiveImageUrl = nodeData.imageUrl ?? connectedSourceImageUrl;
    const isExportedPreview = Boolean(nodeData.imageUrl);

    return (
        <>
            <CustomHandle
                id="image"
                type="target"
                dataType="image"
                label="Image"
                required
                position={Position.Left}
                style={{ top: '50%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Export Image'}
                icon={ImageDown}
                iconColor="text-node-image"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {effectiveImageUrl ? (
                    <div className="space-y-2">
                        <div
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] border ${isExportedPreview
                                ? 'bg-green-500/10 text-green-300 border-green-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                }`}
                        >
                            {isExportedPreview ? 'Exported' : 'Connected Source'}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={effectiveImageUrl}
                            alt="Exported"
                            className="w-full max-h-40 object-contain rounded border border-border"
                        />

                        <div className="text-xs text-text-secondary space-y-1">
                            <div>Provider: {nodeData.provider ?? 'cloudinary'}</div>
                            <div>MIME: {nodeData.mimeType ?? '--'}</div>
                            <div>
                                Size:{' '}
                                {nodeData.width && nodeData.height
                                    ? `${nodeData.width} x ${nodeData.height}px`
                                    : '--'}
                            </div>
                            <div>Bytes: {formatBytes(nodeData.bytes)}</div>
                        </div>

                        <div className="flex items-center gap-2">
                            <a
                                href={effectiveImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open
                            </a>
                            <a
                                href={effectiveImageUrl}
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
                        Connect an image output to export and persist a final asset.
                    </div>
                )}
            </BaseNode>
        </>
    );
}

export default ExportImageNode;
