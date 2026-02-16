'use client';

import { useCallback, useState, useRef } from 'react';
import { NodeProps, Position } from '@xyflow/react';
import { Video, Upload, X, Loader2 } from 'lucide-react';
import { BaseNode, CustomHandle } from './BaseNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import { UploadVideoNodeData } from '@/lib/types';
import { useTransloaditUpload } from '@/hooks/useTransloaditUpload';

export function UploadVideoNode({ id, data, selected }: NodeProps) {
    const nodeData = data as UploadVideoNodeData;
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const { triggerUpload } = useTransloaditUpload({
        allowedFileTypes: ['video/*'],
        onStart: () => {
            setIsUploading(true);
            updateNodeData(id, { error: undefined });
        },
        onSuccess: (url) => {
            updateNodeData(id, {
                videoUrl: url,
                mimeType: 'video/mp4',
            });
            setIsUploading(false);
        },
        onError: (message) => {
            updateNodeData(id, { error: message });
            setIsUploading(false);
        },
    });

    const handleFileSelect = useCallback(
        (file: File) => {
            if (!file.type.startsWith('video/')) {
                updateNodeData(id, { error: 'Please select a video file' });
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
            videoUrl: undefined,
            assetId: undefined,
            mimeType: undefined,
            durationMs: undefined,
            thumbnailUrl: undefined,
        });
    }, [id, updateNodeData]);

    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            updateNodeData(id, {
                durationMs: Math.round(videoRef.current.duration * 1000),
            });
        }
    }, [id, updateNodeData]);

    const formatDuration = (ms?: number) => {
        if (!ms) return '';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    return (
        <>
            {/* Output handle */}
            <CustomHandle
                id="output"
                type="source"
                dataType="video"
                label="Video"
                position={Position.Right}
                style={{ top: '70%' }}
            />

            <BaseNode
                id={id}
                label={nodeData.label || 'Upload Video'}
                icon={Video}
                iconColor="text-node-video"
                isExecuting={nodeData.isExecuting}
                error={nodeData.error}
                selected={selected}
            >
                {/* Upload area or preview */}
                {nodeData.videoUrl ? (
                    <div className="relative group">
                        <video
                            ref={videoRef}
                            src={nodeData.videoUrl}
                            className="w-full max-h-40 rounded border border-border"
                            controls
                            onLoadedMetadata={handleLoadedMetadata}
                        />
                        <button
                            onClick={handleRemove}
                            className="absolute top-1 right-1 p-1 bg-background-secondary/80 rounded-full 
                                opacity-0 group-hover:opacity-100 transition-opacity
                                hover:bg-status-error text-text-primary"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        {nodeData.durationMs && (
                            <div className="text-xs text-text-tertiary mt-1">
                                Duration: {formatDuration(nodeData.durationMs)}
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
                                ? 'border-node-video bg-node-video/10'
                                : 'border-border hover:border-border-hover'
                            }
                        `}
                    >
                        <input
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                        {isUploading ? (
                            <Loader2 className="w-8 h-8 text-node-video animate-spin" />
                        ) : (
                            <>
                                <Upload className="w-8 h-8 text-text-tertiary" />
                                <span className="text-xs text-text-secondary text-center">
                                    Drop video or click to upload
                                    <br />
                                    <span className="text-text-tertiary">
                                        MP4, MOV, WebM, M4V
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

export default UploadVideoNode;
