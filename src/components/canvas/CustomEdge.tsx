'use client';

import { EdgeProps, getBezierPath } from '@xyflow/react';

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
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    return (
        <>
            <defs>
                <linearGradient
                    id={`gradient-${id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={sourceX}
                    y1={sourceY}
                    x2={targetX}
                    y2={targetY}
                >
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="50%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
            </defs>
            <path
                id={id}
                style={{
                    ...style,
                    stroke: `url(#gradient-${id})`,
                    strokeWidth: 2,
                }}
                className="react-flow__edge-path animated-edge"
                d={edgePath}
                markerEnd={markerEnd}
            />
        </>
    );
}
