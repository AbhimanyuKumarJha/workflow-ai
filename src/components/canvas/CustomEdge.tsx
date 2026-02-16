'use client';

import { EdgeProps, getBezierPath } from '@xyflow/react';

export interface CustomEdgeData {
    dataType?: string;
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
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // All edges use animated purple per README requirement
    const colors = {
        start: '#a855f7',
        mid: '#7c3aed',
        end: '#6d28d9',
        selectedStart: '#c084fc',
        selectedMid: '#a855f7',
        selectedEnd: '#9333ea',
    };

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
