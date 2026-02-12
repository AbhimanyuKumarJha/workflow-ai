'use client';

import { useCallback } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Type } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { TextNodeData } from '@/lib/types';

export function TextNode({ id, data, selected }: NodeProps) {
    const nodeData = data as TextNodeData;
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            updateNodeData(id, { value: e.target.value });
        },
        [id, updateNodeData]
    );

    return (
        <>
            {/* Output handle */}
            <CustomHandle
                id="output"
                type="source"
                dataType="text"
                label="Output"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Text Node'}
                icon={Type}
                iconColor="text-node-text"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {/* Text input */}
                <textarea
                    value={nodeData.value || ''}
                    onChange={handleChange}
                    placeholder="Enter your text here..."
                    className="w-full min-h-[80px] p-2 text-sm bg-background border border-border rounded 
                        text-text-primary placeholder-text-tertiary resize-none
                        focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple/50
                        custom-scrollbar"
                    rows={4}
                />
            </BaseNode>
        </>
    );
}

export default TextNode;
