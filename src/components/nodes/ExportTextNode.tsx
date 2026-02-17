'use client';

import { useMemo } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Copy, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { BaseNode, CustomHandle } from './BaseNode';
import { ExportTextNodeData } from '@/lib/types';
import { useWorkflowStore } from '@/stores/workflow-store';

function toStringValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function ExportTextNode({ id, data, selected }: NodeProps) {
    const nodeData = data as ExportTextNodeData;
    const nodes = useWorkflowStore((state) => state.nodes);
    const edges = useWorkflowStore((state) => state.edges);

    const connectedSourceText = useMemo(() => {
        const incoming = edges.find((edge) => edge.target === id && edge.targetHandle === 'text');
        if (!incoming) {
            return undefined;
        }

        const sourceNode = nodes.find((node) => node.id === incoming.source);
        if (!sourceNode) {
            return undefined;
        }

        const sourceData = sourceNode.data as Record<string, unknown>;
        switch (sourceNode.type) {
            case 'text':
                return toStringValue(sourceData.value) ?? toStringValue(sourceData.text);
            case 'llm':
            case 'export_text':
                return toStringValue(sourceData.response) ?? toStringValue(sourceData.text) ?? toStringValue(sourceData.value);
            default:
                return toStringValue(sourceData.text) ?? toStringValue(sourceData.value);
        }
    }, [edges, id, nodes]);

    const effectiveText = nodeData.text ?? nodeData.value ?? connectedSourceText;
    const isExportedText = Boolean(nodeData.text ?? nodeData.value);

    const handleCopy = async () => {
        if (!effectiveText) {
            return;
        }
        try {
            await navigator.clipboard.writeText(effectiveText);
            toast.success('Copied exported text');
        } catch {
            toast.error('Failed to copy text');
        }
    };

    const txtHref = useMemo(() => {
        if (!effectiveText) {
            return undefined;
        }
        return `data:text/plain;charset=utf-8,${encodeURIComponent(effectiveText)}`;
    }, [effectiveText]);

    return (
        <>
            <CustomHandle
                id="text"
                type="target"
                dataType="text"
                label="Text"
                required
                position={Position.Left}
                style={{ top: '50%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Export Text'}
                icon={FileText}
                iconColor="text-node-text"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {effectiveText ? (
                    <div className="space-y-2">
                        <div
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] border ${isExportedText
                                ? 'bg-green-500/10 text-green-300 border-green-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                }`}
                        >
                            {isExportedText ? 'Exported' : 'Connected Source'}
                        </div>

                        <div className="max-h-36 overflow-y-auto text-xs text-text-primary bg-background rounded border border-border p-2 whitespace-pre-wrap break-words">
                            {effectiveText}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopy}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                            </button>
                            {txtHref && (
                                <a
                                    href={txtHref}
                                    download="export.txt"
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded bg-background border border-border hover:border-border-hover"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                </a>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-text-tertiary bg-background rounded border border-border p-2">
                        Connect a text output to export formatted text.
                    </div>
                )}
            </BaseNode>
        </>
    );
}

export default ExportTextNode;
