'use client';

import { ReactNode, useCallback, useState } from 'react';
import { Position, Handle, useNodeId } from '@xyflow/react';
import { X, LucideIcon } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUIStore } from '@/stores/ui-store';
import { HandleDataType } from '@/lib/types';

// ===== Custom Handle Component =====
interface CustomHandleProps {
    id: string;
    type: 'source' | 'target';
    dataType: HandleDataType;
    label?: string;
    required?: boolean;
    multiple?: boolean;
    position: Position;
    style?: React.CSSProperties;
}

export function CustomHandle({
    id,
    type,
    dataType,
    label,
    required,
    multiple,
    position,
    style,
}: CustomHandleProps) {
    const edges = useWorkflowStore((state) => state.edges);
    const nodeId = useNodeId();
    const [isHovered, setIsHovered] = useState(false);

    // Check if this handle is connected
    const isConnected = edges.some((edge) =>
        type === 'target'
            ? edge.target === nodeId && edge.targetHandle === id
            : edge.source === nodeId && edge.sourceHandle === id
    );

    // For multiple connections, always connectable
    // For single connections, only connectable if not connected (for target handles)
    const isConnectable = type === 'source' || multiple || !isConnected;

    // Handle colors based on data type
    const handleColor = {
        text: '#3b82f6',
        image: '#22c55e',
        video: '#a855f7',
    }[dataType];

    const textColor = {
        text: 'text-blue-400',
        image: 'text-green-400',
        video: 'text-purple-400',
    }[dataType];

    const isLeft = position === Position.Left;
    const isRight = position === Position.Right;

    // Combine provided style with side positioning
    // Position wrapper at edge, then transform to shift 50% outside
    const translateX = isLeft ? 'translateX(-50%)' : isRight ? 'translateX(50%)' : '';
    const translateY = style?.top ? 'translateY(-50%)' : '';
    const combinedTransform = [translateX, translateY].filter(Boolean).join(' ');

    const handleWrapperStyle: React.CSSProperties = {
        ...style,
        ...(isLeft && { left: 0 }),
        ...(isRight && { right: 0 }),
        ...(combinedTransform && { transform: combinedTransform }),
    };

    return (
        <div
            className="absolute z-50"
            style={handleWrapperStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Handle
                id={id}
                type={type}
                position={position}
                isConnectable={isConnectable}
                style={{
                    width: 12,
                    height: 12,
                    backgroundColor: handleColor,
                    border: `2px solid ${handleColor}`,
                    zIndex: 50,
                }}
                className={`${isConnected ? 'ring-2 ring-white/30' : ''}`}
            />
            {label && isHovered && (
                <div
                    className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium px-2 py-1 rounded 
                        bg-background-tertiary border border-border ${textColor} pointer-events-none z-100
                        ${isLeft ? 'left-5' : 'right-5'}`}
                >
                    {label}
                    {required && <span className="text-red-400 ml-0.5">*</span>}
                </div>
            )}
        </div>
    );
}

// ===== Base Node Component =====
interface BaseNodeProps {
    id: string;
    label: string;
    icon: LucideIcon;
    iconColor?: string;
    isExecuting?: boolean;
    error?: string;
    selected?: boolean;
    children: ReactNode;
}

export function BaseNode({
    id,
    label,
    icon: Icon,
    iconColor = 'text-accent-purple',
    isExecuting,
    error,
    selected,
    children,
}: BaseNodeProps) {
    const deleteNode = useWorkflowStore((state) => state.deleteNode);
    const executingNodes = useUIStore((state) => state.executingNodes);

    const isNodeExecuting = isExecuting || executingNodes.has(id);

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            deleteNode(id);
        },
        [deleteNode, id]
    );

    return (
        <div
            className={`
                relative min-w-60 max-w-100 bg-background-secondary border-2 rounded-lg shadow-lg
                transition-all duration-200
                ${selected ? 'border-accent-purple shadow-glow-md' : 'border-border'}
                ${isNodeExecuting ? 'node-executing border-accent-purple' : ''}
                ${error ? 'border-status-error' : ''}
            `}
            style={{ overflow: 'visible' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background-tertiary rounded-t-lg">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                    <span className="text-sm font-medium text-text-primary">{label}</span>
                </div>
                <button
                    onClick={handleDelete}
                    className="p-1 rounded hover:bg-background text-text-tertiary hover:text-text-primary transition-colors"
                    title="Delete node"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Content */}
            <div className="p-3 space-y-3">{children}</div>

            {/* Error display */}
            {error && (
                <div className="px-3 pb-3">
                    <div className="text-xs text-status-error bg-red-500/10 p-2 rounded border border-red-500/20">
                        {error}
                    </div>
                </div>
            )}
        </div>
    );
}

export default BaseNode;
