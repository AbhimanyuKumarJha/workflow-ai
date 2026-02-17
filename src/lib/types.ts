import { Node, Edge, Viewport } from '@xyflow/react';

// ===== Handle Types =====
export type HandleDataType = 'text' | 'image' | 'video';

export interface HandleConfig {
    id: string;
    type: HandleDataType;
    label: string;
    required: boolean;
    multiple?: boolean; // For image handles that accept multiple connections
}

// ===== Node Data Types =====
export interface BaseNodeData extends Record<string, unknown> {
    label: string;
    isExecuting?: boolean;
    lastResult?: unknown;
    error?: string;
}

export interface TextNodeData extends BaseNodeData {
    value: string;
}

export interface UploadImageNodeData extends BaseNodeData {
    imageUrl?: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    assemblyId?: string;
    mimeType?: string;
    outputType?: string;
    sourceStep?: string;
    isTempUrl?: boolean;
    width?: number;
    height?: number;
}

export interface UploadVideoNodeData extends BaseNodeData {
    videoUrl?: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    assemblyId?: string;
    mimeType?: string;
    outputType?: string;
    sourceStep?: string;
    isTempUrl?: boolean;
    durationMs?: number;
    thumbnailUrl?: string;
}

export interface LLMNodeData extends BaseNodeData {
    selectedModel: string;
    systemPrompt?: string;
    userMessage?: string;
    imageUrls?: string[];
    response?: string;
}

export interface CropImageNodeData extends BaseNodeData {
    imageUrl?: string;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
    croppedUrl?: string;
}

export interface ExtractFrameNodeData extends BaseNodeData {
    videoUrl?: string;
    timestamp: string | number;
    extractedFrameUrl?: string;
}

export interface GenerateImageNodeData extends BaseNodeData {
    prompt?: string;
    model?: string;
    imageUrl?: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
}

export interface ExportTextNodeData extends BaseNodeData {
    text?: string;
    value?: string;
    format?: 'txt';
}

export interface ExportImageNodeData extends BaseNodeData {
    imageUrl?: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
}

export interface ExportVideoNodeData extends BaseNodeData {
    videoUrl?: string;
    assetId?: string;
    publicId?: string;
    provider?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
}

export type CustomNodeData = Record<string, unknown> &
    (
        | TextNodeData
        | UploadImageNodeData
        | UploadVideoNodeData
        | LLMNodeData
        | CropImageNodeData
        | ExtractFrameNodeData
        | GenerateImageNodeData
        | ExportTextNodeData
        | ExportImageNodeData
        | ExportVideoNodeData
    );

export type CustomNode = Node<CustomNodeData>;
export type CustomEdge = Edge;

// ===== Workflow Types =====
export interface WorkflowSnapshot {
    nodes: CustomNode[];
    edges: CustomEdge[];
    viewport: Viewport;
}

export interface InputResolution {
    nodeId: string;
    handleId: string;
    value: unknown;
    source: 'connection' | 'manual';
}

// ===== Execution Types =====
export interface ExecutionContext {
    workflowId: string;
    runId: string;
    scope: 'FULL' | 'SELECTED' | 'SINGLE';
    selectedNodeIds?: string[];
}

export interface NodeExecutionResult {
    nodeId: string;
    success: boolean;
    outputs?: Record<string, unknown>;
    error?: string;
    durationMs?: number;
}
