'use client';

import { useCallback, useState } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { ImageIcon, Upload, X, Loader2 } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { UploadImageNodeData } from '@/lib/types';
import { useTransloaditUpload } from '@/hooks/useTransloaditUpload';

export function UploadImageNode({ id, data, selected }: NodeProps) {
    const nodeData = data as UploadImageNodeData;
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const { triggerUpload } = useTransloaditUpload({
        allowedFileTypes: ['image/*'],
        uploadType: 'image',
        onStart: () => {
            setIsUploading(true);
            updateNodeData(id, { error: undefined });
        },
        onSuccess: (url, meta) => {
            const mimeType = meta?.mimeType ?? 'image/jpeg';
            const assemblyId = meta?.assemblyId;

            if (typeof meta?.width === 'number' && typeof meta?.height === 'number') {
                updateNodeData(id, {
                    imageUrl: url,
                    assemblyId,
                    mimeType,
                    width: meta.width,
                    height: meta.height,
                });
                setIsUploading(false);
                return;
            }

            const img = new Image();
            img.onload = () => {
                updateNodeData(id, {
                    imageUrl: url,
                    assemblyId,
                    mimeType,
                    width: img.width,
                    height: img.height,
                });
                setIsUploading(false);
            };
            img.onerror = () => {
                updateNodeData(id, { imageUrl: url, assemblyId, mimeType });
                setIsUploading(false);
            };
            img.src = url;
        },
        onError: (message) => {
            updateNodeData(id, { error: message });
            setIsUploading(false);
        },
    });

    const handleFileSelect = useCallback(
        (file: File) => {
            if (!file.type.startsWith('image/')) {
                updateNodeData(id, { error: 'Please select an image file' });
                return;
            }
            triggerUpload(file);
        },
        [id, updateNodeData, triggerUpload]
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
            assemblyId: undefined,
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
                        {/* Local object URLs and generated data URLs are not handled by next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={nodeData.imageUrl}
                            alt="Uploaded"
                            className="w-full max-h-40 object-contain rounded border border-border"
                            onError={() =>
                                updateNodeData(id, {
                                    error:
                                        'Image URL loaded from Transloadit could not be displayed in browser. Check URL access policy/CORP settings.',
                                })
                            }
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
