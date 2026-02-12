'use client';

import { useCallback, useState } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { ImageIcon, Upload, X, Loader2 } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { UploadImageNodeData } from '@/lib/types';

export function UploadImageNode({ id, data, selected }: NodeProps) {
    const nodeData = data as UploadImageNodeData;
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const handleFileSelect = useCallback(
        async (file: File) => {
            if (!file.type.startsWith('image/')) {
                updateNodeData(id, { error: 'Please select an image file' });
                return;
            }

            setIsUploading(true);
            updateNodeData(id, { error: undefined });

            try {
                // Create a local preview URL for now
                // In production, this would upload to Transloadit
                const previewUrl = URL.createObjectURL(file);

                // Get image dimensions
                const img = new Image();
                img.onload = () => {
                    updateNodeData(id, {
                        imageUrl: previewUrl,
                        mimeType: file.type,
                        width: img.width,
                        height: img.height,
                    });
                    setIsUploading(false);
                };
                img.onerror = () => {
                    updateNodeData(id, { error: 'Failed to load image' });
                    setIsUploading(false);
                };
                img.src = previewUrl;
            } catch (error) {
                updateNodeData(id, { error: 'Failed to upload image' });
                setIsUploading(false);
            }
        },
        [id, updateNodeData]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        },
        [handleFileSelect]
    );

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
        },
        [handleFileSelect]
    );

    const handleRemove = useCallback(() => {
        updateNodeData(id, {
            imageUrl: undefined,
            assetId: undefined,
            mimeType: undefined,
            width: undefined,
            height: undefined,
        });
    }, [id, updateNodeData]);

    return (
        <>
            {/* Output handle */}
            <CustomHandle
                id="output"
                type="source"
                dataType="image"
                label="Image"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Upload Image'}
                icon={ImageIcon}
                iconColor="text-node-image"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {/* Upload area or preview */}
                {nodeData.imageUrl ? (
                    <div className="relative group">
                        <img
                            src={nodeData.imageUrl}
                            alt="Uploaded"
                            className="w-full max-h-40 object-contain rounded border border-border"
                        />
                        <button
                            onClick={handleRemove}
                            className="absolute top-1 right-1 p-1 bg-background-secondary/80 rounded-full 
                                opacity-0 group-hover:opacity-100 transition-opacity
                                hover:bg-status-error text-text-primary"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        {nodeData.width && nodeData.height && (
                            <div className="text-xs text-text-tertiary mt-1">
                                {nodeData.width} × {nodeData.height}px
                            </div>
                        )}
                    </div>
                ) : (
                    <label
                        onDrop={handleDrop}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        className={`
                            flex flex-col items-center justify-center gap-2 p-4 
                            border-2 border-dashed rounded cursor-pointer transition-colors
                            ${dragOver
                                ? 'border-node-image bg-node-image/10'
                                : 'border-border hover:border-border-hover'
                            }
                        `}
                    >
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                        {isUploading ? (
                            <Loader2 className="w-8 h-8 text-node-image animate-spin" />
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-text-tertiary" />
                                <span className="text-xs text-text-secondary text-center">
                                    Drop image or click to upload
                                    <br />
                                    <span className="text-text-tertiary">
                                        JPG, PNG, WebP, GIF
                                    </span>
                                </span>
                            </>
                        )}
                    </label>
                )}
            </BaseNode>
        </>
    );
}

export default UploadImageNode;
