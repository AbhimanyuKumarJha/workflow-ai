'use client';

import { EdgeProps, getBezierPath } from '@xyflow/react';
import { HandleDataType } from '@/lib/types';

export interface CustomEdgeData {
    dataType?: HandleDataType;
}

export function CustomEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    selected,
    data,
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // Get color scheme based on data type
    const dataType = (data as CustomEdgeData | undefined)?.dataType || 'text';
    const colorSchemes = {
        text: {
            start: '#3b82f6',
            mid: '#6366f1',
            end: '#4f46e5',
            selectedStart: '#60a5fa',
            selectedMid: '#818cf8',
            selectedEnd: '#6366f1',
        },
        image: {
            start: '#22c55e',
            mid: '#16a34a',
            end: '#15803d',
            selectedStart: '#4ade80',
            selectedMid: '#22c55e',
            selectedEnd: '#16a34a',
        },
        video: {
            start: '#a855f7',
            mid: '#7c3aed',
            end: '#6d28d9',
            selectedStart: '#c084fc',
            selectedMid: '#a855f7',
            selectedEnd: '#9333ea',
        },
    };

    const colors = colorSchemes[dataType];
    const strokeWidth = selected ? 3 : 2;

    return (
        <>
            <defs>
                {/* Normal gradient */}
                <linearGradient
                    id={`gradient-${id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                >
                    <stop offset="0%" stopColor={colors.start} />
                    <stop offset="50%" stopColor={colors.mid} />
                    <stop offset="100%" stopColor={colors.end} />
                </linearGradient>
                {/* Selected gradient (brighter) */}
                <linearGradient
                    id={`gradient-selected-${id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                >
                    <stop offset="0%" stopColor={colors.selectedStart} />
                    <stop offset="50%" stopColor={colors.selectedMid} />
                    <stop offset="100%" stopColor={colors.selectedEnd} />
                </linearGradient>
            </defs>

            {/* Invisible wider path for easier clicking */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={20}
                stroke="transparent"
                className="react-flow__edge-interaction"
            />

            {/* Visible styled path */}
            <path
                id={id}
                style={style}
                className={`react-flow__edge-path ${selected ? '' : 'animated-edge'}`}
                d={edgePath}
                markerEnd={markerEnd}
                stroke={selected ? `url(#gradient-selected-${id})` : `url(#gradient-${id})`}
                strokeWidth={strokeWidth}
                fill="none"
            />

            {/* Glow effect when selected */}
            {selected && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke={colors.selectedMid}
                    strokeWidth={strokeWidth + 4}
                    opacity={0.3}
                    style={{ filter: 'blur(4px)' }}
                />
            )}
        </>
    );
}
